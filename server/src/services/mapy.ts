// ===== Mapy.com REST API wrapper =====
// Wraps the mapy.com REST API (https://api.mapy.com/v1/) for geocoding, routing,
// POI search, and elevation. Uses the user's per-user API key (AES-256-GCM
// encrypted in the MapyCredentials table). Results are cached in-memory for 60s
// to conserve API credits.
//
// The legacy SMap JS SDK (api.mapy.cz) was permanently retired at the end of
// 2025; the new REST API + a third-party map library (Leaflet, used client-side)
// is the only supported path.

import prisma from "../db/client";
import { encryptSecret, decryptSecret } from "./crypto";

const API_BASE = "https://api.mapy.com/v1";
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000;

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0 Athena/1.0 (+https://github.com/athena/student-os)";

// ===== In-memory response cache (per user, 60s) =====
interface CacheEntry {
  ts: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.data as T;
}

function cacheSet(key: string, data: unknown): void {
  cache.set(key, { ts: Date.now(), data });
  // Opportunistic cleanup — drop ~10% of the oldest entries when the cache grows.
  if (cache.size > 500) {
    for (const [k, v] of cache) {
      if (Date.now() - v.ts > CACHE_TTL_MS) cache.delete(k);
    }
  }
}

// ===== Credential management =====

export class MapyNotConfiguredError extends Error {
  constructor() {
    super("Mapy.cz API key is not configured. Add it in Settings → Integrations.");
    this.name = "MapyNotConfiguredError";
  }
}

/** Read + decrypt the user's mapy.com API key. Throws if not configured. */
export async function getApiKey(userId: string): Promise<string> {
  const row = await prisma.mapyCredentials.findUnique({ where: { userId } });
  if (!row) throw new MapyNotConfiguredError();
  return decryptSecret(row.apiKeyEnc);
}

/** Whether the user has a mapy.com API key configured. */
export async function hasApiKey(userId: string): Promise<boolean> {
  const row = await prisma.mapyCredentials.findUnique({ where: { userId } });
  return !!row;
}

/** Save (encrypt + upsert) the user's mapy.com API key. */
export async function saveApiKey(userId: string, apiKey: string): Promise<void> {
  const enc = encryptSecret(apiKey.trim());
  await prisma.mapyCredentials.upsert({
    where: { userId },
    create: { userId, apiKeyEnc: enc },
    update: { apiKeyEnc: enc },
  });
}

/** Delete the user's mapy.com API key. */
export async function deleteApiKey(userId: string): Promise<void> {
  await prisma.mapyCredentials.deleteMany({ where: { userId } });
}

// ===== Core fetch helper =====

async function mapyFetch<T>(
  userId: string,
  path: string,
  params: Record<string, string | string[] | undefined>,
  cacheKey?: string
): Promise<T> {
  const apiKey = await getApiKey(userId);
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, v);
    }
  }
  const key = cacheKey ?? `${userId}:${url.pathname}?${url.searchParams.toString()}`;
  const cached = cacheGet<T>(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-Mapy-Api-Key": apiKey,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Mapy.cz rejected the API key (HTTP ${res.status}). Check Settings → Integrations.`);
      }
      throw new Error(`Mapy.cz API error (HTTP ${res.status}) for ${path}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as T;
    cacheSet(key, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ===== Types =====

export interface GeocodeResult {
  lat: number;
  lon: number;
  name: string;
  label: string;
  type: string;
  location: string;
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  ascentM: number;
  descentM: number;
  /** Route geometry as an array of [lat, lon] points. */
  geometry: [number, number][];
  /** Per-segment distance/duration (between waypoints). */
  parts: { length: number; duration: number }[];
}

export interface PoiResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
  description: string;
  /** Source permalink if available. */
  permalink?: string;
}

export type RouteType =
  | "car_fast"
  | "car_fast_traffic"
  | "car_short"
  | "foot_fast"
  | "foot_hiking"
  | "bike_road"
  | "bike_mountain";

/** Map a friendly travel mode to the mapy.com route type. */
export function routeTypeFor(mode: "hiking" | "bicycle" | "car"): RouteType {
  switch (mode) {
    case "hiking":
      return "foot_hiking";
    case "bicycle":
      return "bike_road";
    case "car":
      return "car_fast";
  }
}

// ===== Geocoding =====

interface RawGeocodeResponse {
  items: Array<{
    name: string;
    label: string;
    type: string;
    location?: string;
    position: { lon: number; lat: number };
  }>;
}

export async function geocode(
  userId: string,
  query: string,
  limit = 10,
  lang = "en"
): Promise<GeocodeResult[]> {
  const raw = await mapyFetch<RawGeocodeResponse>(
    userId,
    "/geocode",
    { query, limit: String(limit), lang, type: "regional,poi" }
  );
  return (raw.items ?? []).map((it) => ({
    lat: it.position.lat,
    lon: it.position.lon,
    name: it.name,
    label: it.label,
    type: it.type,
    location: it.location ?? "",
  }));
}

interface RawRgeocodeResponse {
  items: Array<{
    name: string;
    label: string;
    type: string;
    location?: string;
    position: { lon: number; lat: number };
  }>;
}

export async function reverseGeocode(
  userId: string,
  lat: number,
  lon: number,
  lang = "en"
): Promise<GeocodeResult[]> {
  const raw = await mapyFetch<RawRgeocodeResponse>(
    userId,
    "/rgeocode",
    { lon: String(lon), lat: String(lat), lang }
  );
  return (raw.items ?? []).map((it) => ({
    lat: it.position.lat,
    lon: it.position.lon,
    name: it.name,
    label: it.label,
    type: it.type,
    location: it.location ?? "",
  }));
}

// ===== Routing =====

interface RawRouteGeometry {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][]; // [lon, lat]
  };
  properties?: Record<string, unknown>;
}

interface RawRouteResponse {
  length: number; // meters
  duration: number; // seconds
  geometry: RawRouteGeometry;
  parts?: { length: number; duration: number }[];
  routePoints?: Array<{ originalPosition: [number, number]; mappedPosition: [number, number] }>;
}

/** Plan a route between two points (optionally via waypoints). */
export async function route(
  userId: string,
  opts: {
    startLon: number;
    startLat: number;
    endLon: number;
    endLat: number;
    /** Waypoints as [lon, lat] pairs between start and end (max 15). */
    waypoints?: [number, number][];
    routeType: RouteType;
    lang?: string;
  }
): Promise<RouteResult> {
  const { startLon, startLat, endLon, endLat, waypoints, routeType, lang = "en" } = opts;
  const params: Record<string, string | string[] | undefined> = {
    start: `${startLon},${startLat}`,
    end: `${endLon},${endLat}`,
    routeType,
    lang,
    format: "geojson",
  };
  if (waypoints && waypoints.length > 0) {
    params.waypoints = waypoints.map(([lon, lat]) => `${lon},${lat}`);
  }
  const raw = await mapyFetch<RawRouteResponse>(userId, "/routing/route", params);

  const coords = raw.geometry?.geometry?.coordinates ?? [];
  const geometry: [number, number][] = coords.map(([lon, lat]) => [lat, lon]);

  // Compute ascent/descent via the elevation API (best-effort; capped to 256
  // sampled points so a single elevation request covers the whole route).
  let ascentM = 0;
  let descentM = 0;
  try {
    [ascentM, descentM] = await computeAscentDescent(userId, geometry);
  } catch {
    // Elevation is optional — leave at 0 if it fails.
  }

  return {
    distanceM: raw.length,
    durationS: raw.duration,
    ascentM,
    descentM,
    geometry,
    parts: raw.parts ?? [],
  };
}

// ===== Elevation (for ascent/descent) =====

interface RawElevationResponse {
  results?: Array<{
    position: [number, number]; // [lon, lat]
    elevation: number | null;
  }>;
}

/** Sample up to 256 points from a route geometry and compute total ascent/descent. */
async function computeAscentDescent(
  userId: string,
  geometry: [number, number][]
): Promise<[number, number]> {
  if (geometry.length < 2) return [0, 0];
  // Downsample to at most 256 points (the elevation API limit).
  const MAX = 256;
  let sampled: [number, number][] = geometry;
  if (geometry.length > MAX) {
    sampled = [];
    const step = (geometry.length - 1) / (MAX - 1);
    for (let i = 0; i < MAX; i++) {
      sampled.push(geometry[Math.round(i * step)]);
    }
  }
  // mapy.com elevation expects [lon,lat] pairs, semicolon-separated.
  const positions = sampled.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const raw = await mapyFetch<RawElevationResponse>(
    userId,
    "/elevation",
    { positions },
    `elev:${userId}:${positions}` // distinct cache key namespace
  );
  const elevations = (raw.results ?? [])
    .map((r) => r.elevation)
    .filter((e): e is number => typeof e === "number");
  let ascent = 0;
  let descent = 0;
  for (let i = 1; i < elevations.length; i++) {
    const d = elevations[i] - elevations[i - 1];
    if (d > 0) ascent += d;
    else descent -= d;
  }
  return [Math.round(ascent), Math.round(descent)];
}

// ===== POI search =====

/**
 * Search for POIs/landmarks by text. Optionally bias results toward a point
 * (preferNear with a precision radius in meters). Uses the geocode endpoint
 * with type=poi.
 */
export async function searchPois(
  userId: string,
  opts: {
    query: string;
    lat?: number;
    lon?: number;
    /** Prefer radius in meters (only with lat/lon). */
    radius?: number;
    limit?: number;
    lang?: string;
  }
): Promise<PoiResult[]> {
  const { query, lat, lon, radius, limit = 20, lang = "en" } = opts;
  const params: Record<string, string | string[] | undefined> = {
    query,
    lang,
    limit: String(limit),
    type: "poi",
  };
  if (lat !== undefined && lon !== undefined) {
    params.preferNear = `${lon},${lat}`;
    if (radius !== undefined) params.preferNearPrecision = String(radius);
  }
  const raw = await mapyFetch<RawGeocodeResponse>(userId, "/geocode", params);
  return (raw.items ?? []).map((it, idx) => ({
    id: `poi-${idx}-${it.position.lon}-${it.position.lat}`,
    name: it.name,
    lat: it.position.lat,
    lon: it.position.lon,
    category: it.label || it.type,
    description: it.location ?? "",
  }));
}

// ===== Hiking-relevant POI categories =====
// mapy.com's geocode POI search is text-based, so "categories" are mapped to
// Czech + English search terms (Czech yields the best coverage for Czech
// hiking infrastructure). Each group is a set of query terms; we run one
// search per term near the target point and merge + dedupe by name+coords.

export type PoiCategoryGroup = "water" | "sleeping" | "landmarks" | "amenities" | "all";

const CATEGORY_TERMS: Record<Exclude<PoiCategoryGroup, "all">, string[]> = {
  // Water sources: springs, wells, drinking water.
  water: ["pramen", "studna", "pitná voda", "water spring", "well"],
  // Legal / sheltered sleeping spots: shelters, bivouacs, mountain huts, camps.
  sleeping: ["prístrešák", "pristresi", "bivak", "bivouac", "chata", "turistická ubytovna", "kemp", "shelter", "mountain hut"],
  // Landmarks: castles, viewpoints, towers, tourist signposts, ruins.
  landmarks: ["hrad", "zámek", "rozhledna", "věž", "rozcestí", "tvrz", "castle", "viewpoint", "tower", "lookout tower"],
  // Amenities: restaurants, accommodation, refreshments.
  amenities: ["restaurace", "občerstvení", "ubytování", "restaurant", "refreshments", "accommodation"],
};

/**
 * Find hiking-relevant POIs near a point, filtered by category group. Runs a
 * text search per term in the group near the point and merges + dedupes the
 * results. `radiusM` is the prefer-near precision in meters.
 */
export async function findNearbyPois(
  userId: string,
  opts: {
    lat: number;
    lon: number;
    radiusM?: number;
    categories?: PoiCategoryGroup;
    limit?: number;
    lang?: string;
  }
): Promise<PoiResult[]> {
  const { lat, lon, radiusM = 3000, categories = "all", limit = 30, lang = "en" } = opts;
  const groups: Exclude<PoiCategoryGroup, "all">[] =
    categories === "all" ? ["water", "sleeping", "landmarks", "amenities"] : [categories];

  const seen = new Set<string>();
  const out: PoiResult[] = [];
  for (const group of groups) {
    const terms = CATEGORY_TERMS[group];
    for (const term of terms) {
      try {
        const results = await searchPois(userId, {
          query: term,
          lat,
          lon,
          radius: radiusM,
          limit: 8,
          lang,
        });
        for (const r of results) {
          const key = `${r.name}|${r.lat.toFixed(5)},${r.lon.toFixed(5)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ ...r, category: group });
          if (out.length >= limit) return out;
        }
      } catch {
        // A single term search failing (e.g. no results) shouldn't abort the rest.
      }
    }
  }
  return out;
}

/**
 * Sample points along a route geometry at a fixed interval (meters, approximated
 * by haversine) and return up to `maxPoints` evenly-spaced sample coordinates.
 * Used to enrich a hiking route with nearby POIs without exhausting API credits.
 */
export function sampleRoutePoints(geometry: [number, number][], maxPoints = 10): [number, number][] {
  if (geometry.length <= maxPoints) return geometry;
  const out: [number, number][] = [];
  const step = (geometry.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(geometry[Math.round(i * step)]);
  }
  return out;
}

// ===== Trip persistence =====

export interface TripInput {
  name: string;
  type: string; // "hiking" | "bicycle" | "car"
  distanceM: number;
  durationS: number;
  ascentM?: number;
  descentM?: number;
  geometry: [number, number][];
  waypoints?: { name: string; lat: number; lon: number; type?: string }[];
  pois?: { name: string; lat: number; lon: number; category: string; description?: string }[];
  summary?: string;
}

export interface TripRow {
  id: string;
  name: string;
  type: string;
  distanceM: number;
  durationS: number;
  ascentM: number;
  descentM: number;
  geometry: [number, number][];
  waypoints: { name: string; lat: number; lon: number; type?: string }[];
  pois: { name: string; lat: number; lon: number; category: string; description?: string }[];
  summary: string;
  /** Tour linkage (null for standalone trips). */
  tourId: string | null;
  dayNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

function toRow(t: {
  id: string;
  name: string;
  type: string;
  distanceM: number;
  durationS: number;
  ascentM: number;
  descentM: number;
  geometry: string;
  waypoints: string;
  pois: string;
  summary: string;
  tourId: string | null;
  dayNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
}): TripRow {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    distanceM: t.distanceM,
    durationS: t.durationS,
    ascentM: t.ascentM,
    descentM: t.descentM,
    geometry: JSON.parse(t.geometry) as [number, number][],
    waypoints: JSON.parse(t.waypoints) as TripRow["waypoints"],
    pois: JSON.parse(t.pois) as TripRow["pois"],
    summary: t.summary,
    tourId: t.tourId,
    dayNumber: t.dayNumber,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTrips(userId: string): Promise<
  Array<{
    id: string;
    name: string;
    type: string;
    distanceM: number;
    durationS: number;
    ascentM: number;
    createdAt: string;
  }>
> {
  const rows = await prisma.trip.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      distanceM: true,
      durationS: true,
      ascentM: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getTrip(userId: string, tripId: string): Promise<TripRow | null> {
  const t = await prisma.trip.findFirst({ where: { id: tripId, userId } });
  if (!t) return null;
  return toRow(t);
}

export async function createTrip(userId: string, input: TripInput): Promise<TripRow> {
  const t = await prisma.trip.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      distanceM: input.distanceM,
      durationS: input.durationS,
      ascentM: input.ascentM ?? 0,
      descentM: input.descentM ?? 0,
      geometry: JSON.stringify(input.geometry),
      waypoints: JSON.stringify(input.waypoints ?? []),
      pois: JSON.stringify(input.pois ?? []),
      summary: input.summary ?? "",
    },
  });
  return toRow(t);
}

export async function updateTrip(
  userId: string,
  tripId: string,
  input: Partial<TripInput>
): Promise<TripRow | null> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.distanceM !== undefined) data.distanceM = input.distanceM;
  if (input.durationS !== undefined) data.durationS = input.durationS;
  if (input.ascentM !== undefined) data.ascentM = input.ascentM;
  if (input.descentM !== undefined) data.descentM = input.descentM;
  if (input.geometry !== undefined) data.geometry = JSON.stringify(input.geometry);
  if (input.waypoints !== undefined) data.waypoints = JSON.stringify(input.waypoints);
  if (input.pois !== undefined) data.pois = JSON.stringify(input.pois);
  if (input.summary !== undefined) data.summary = input.summary;
  const t = await prisma.trip.updateMany({ where: { id: tripId, userId }, data });
  if (t.count === 0) return null;
  return getTrip(userId, tripId);
}

export async function deleteTrip(userId: string, tripId: string): Promise<boolean> {
  const r = await prisma.trip.deleteMany({ where: { id: tripId, userId } });
  return r.count > 0;
}

// ===== GPX export =====

/** XML-escape a string for safe inclusion in GPX text nodes. */
function gpxEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function gpxTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString();
}

/**
 * Build a GPX 1.1 document from a trip's geometry + waypoints + POIs.
 * - `<wpt>` entries for each waypoint and POI (with name + description).
 * - A single `<trk>` with one `<trkseg>` containing `<trkpt>` per geometry point.
 * No external deps — straight XML string building.
 */
export function tripToGpx(trip: TripRow): string {
  const waypoints = trip.waypoints ?? [];
  const pois = trip.pois ?? [];
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Athena" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata>`,
    `    <name>${gpxEscape(trip.name)}</name>`,
    `    <time>${gpxTime(trip.updatedAt)}</time>`,
    `  </metadata>`,
  ];
  // Waypoints
  for (const w of waypoints) {
    lines.push(
      `  <wpt lat="${w.lat}" lon="${w.lon}">`,
      `    <name>${gpxEscape(w.name)}</name>`,
      w.type ? `    <type>${gpxEscape(w.type)}</type>` : ``,
      `  </wpt>`
    );
  }
  // POIs as waypoints too (so they show up in Garmin/Komoot)
  for (const p of pois) {
    lines.push(
      `  <wpt lat="${p.lat}" lon="${p.lon}">`,
      `    <name>${gpxEscape(p.name)}</name>`,
      `    <desc>${gpxEscape(p.description ?? p.category)}</desc>`,
      `    <type>${gpxEscape(p.category)}</type>`,
      `  </wpt>`
    );
  }
  // Track
  lines.push(`  <trk>`, `    <name>${gpxEscape(trip.name)}</name>`, `    <trkseg>`);
  for (const [lat, lon] of trip.geometry) {
    lines.push(`      <trkpt lat="${lat}" lon="${lon}"></trkpt>`);
  }
  lines.push(`    </trkseg>`, `  </trk>`, `</gpx>`);
  return lines.filter((l) => l !== ``).join("\n");
}

/**
 * Build a single GPX document containing all days of a tour as separate
 * `<trk>` elements (one per day), plus waypoints for overnights + POIs.
 */
export function tourToGpx(
  tour: { name: string; updatedAt: string },
  days: TripRow[]
): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Athena" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata>`,
    `    <name>${gpxEscape(tour.name)}</name>`,
    `    <time>${gpxTime(tour.updatedAt)}</time>`,
    `  </metadata>`,
  ];
  // Collect all POIs + overnights as waypoints (deduped by name+coords).
  const seenWpt = new Set<string>();
  for (const day of days) {
    for (const w of day.waypoints ?? []) {
      const key = `${w.name}|${w.lat.toFixed(5)},${w.lon.toFixed(5)}`;
      if (seenWpt.has(key)) continue;
      seenWpt.add(key);
      lines.push(
        `  <wpt lat="${w.lat}" lon="${w.lon}">`,
        `    <name>${gpxEscape(w.name)}</name>`,
        w.type ? `    <type>${gpxEscape(w.type)}</type>` : ``,
        `  </wpt>`
      );
    }
    for (const p of day.pois ?? []) {
      const key = `${p.name}|${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
      if (seenWpt.has(key)) continue;
      seenWpt.add(key);
      lines.push(
        `  <wpt lat="${p.lat}" lon="${p.lon}">`,
        `    <name>${gpxEscape(p.name)}</name>`,
        `    <desc>${gpxEscape(p.description ?? p.category)}</desc>`,
        `    <type>${gpxEscape(p.category)}</type>`,
        `  </wpt>`
      );
    }
  }
  // One track per day
  for (const day of days) {
    lines.push(`  <trk>`, `    <name>${gpxEscape(day.name)}</name>`, `    <trkseg>`);
    for (const [lat, lon] of day.geometry) {
      lines.push(`      <trkpt lat="${lat}" lon="${lon}"></trkpt>`);
    }
    lines.push(`    </trkseg>`, `  </trk>`);
  }
  lines.push(`</gpx>`);
  return lines.filter((l) => l !== ``).join("\n");
}

// ===== Multi-day hiking tour persistence =====

export interface HikingTourRow {
  id: string;
  name: string;
  mode: string;
  baseLat: number;
  baseLon: number;
  baseName: string;
  endLat: number | null;
  endLon: number | null;
  endName: string | null;
  numDays: number;
  difficulty: string;
  totalDistanceM: number;
  totalAscentM: number;
  totalDurationS: number;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

function tourToRow(t: {
  id: string;
  name: string;
  mode: string;
  baseLat: number;
  baseLon: number;
  baseName: string;
  endLat: number | null;
  endLon: number | null;
  endName: string | null;
  numDays: number;
  difficulty: string;
  totalDistanceM: number;
  totalAscentM: number;
  totalDurationS: number;
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}): HikingTourRow {
  return {
    id: t.id,
    name: t.name,
    mode: t.mode,
    baseLat: t.baseLat,
    baseLon: t.baseLon,
    baseName: t.baseName,
    endLat: t.endLat,
    endLon: t.endLon,
    endName: t.endName,
    numDays: t.numDays,
    difficulty: t.difficulty,
    totalDistanceM: t.totalDistanceM,
    totalAscentM: t.totalAscentM,
    totalDurationS: t.totalDurationS,
    summary: t.summary,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTours(userId: string): Promise<
  Array<{
    id: string;
    name: string;
    mode: string;
    baseName: string;
    numDays: number;
    difficulty: string;
    totalDistanceM: number;
    totalAscentM: number;
    createdAt: string;
  }>
> {
  const rows = await prisma.hikingTour.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      mode: true,
      baseName: true,
      numDays: true,
      difficulty: true,
      totalDistanceM: true,
      totalAscentM: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getTour(userId: string, tourId: string): Promise<{
  tour: HikingTourRow;
  days: TripRow[];
} | null> {
  const t = await prisma.hikingTour.findFirst({ where: { id: tourId, userId } });
  if (!t) return null;
  const dayRows = await prisma.trip.findMany({
    where: { tourId },
    orderBy: { dayNumber: "asc" },
  });
  return {
    tour: tourToRow(t),
    days: dayRows.map(toRow),
  };
}

export async function createTour(
  userId: string,
  input: {
    name: string;
    mode: string;
    baseLat: number;
    baseLon: number;
    baseName: string;
    endLat?: number;
    endLon?: number;
    endName?: string;
    numDays: number;
    difficulty: string;
    totalDistanceM: number;
    totalAscentM: number;
    totalDurationS: number;
    summary: string;
    days: Array<{
      dayNumber: number;
      name: string;
      distanceM: number;
      durationS: number;
      ascentM: number;
      descentM: number;
      geometry: [number, number][];
      waypoints: { name: string; lat: number; lon: number; type?: string }[];
      pois: { name: string; lat: number; lon: number; category: string; description?: string }[];
      summary?: string;
    }>;
  }
): Promise<{ tour: HikingTourRow; days: TripRow[] }> {
  const t = await prisma.hikingTour.create({
    data: {
      userId,
      name: input.name,
      mode: input.mode,
      baseLat: input.baseLat,
      baseLon: input.baseLon,
      baseName: input.baseName,
      endLat: input.endLat ?? null,
      endLon: input.endLon ?? null,
      endName: input.endName ?? null,
      numDays: input.numDays,
      difficulty: input.difficulty,
      totalDistanceM: input.totalDistanceM,
      totalAscentM: input.totalAscentM,
      totalDurationS: input.totalDurationS,
      summary: input.summary,
    },
  });
  const dayRows: TripRow[] = [];
  for (const d of input.days) {
    const row = await prisma.trip.create({
      data: {
        userId,
        tourId: t.id,
        dayNumber: d.dayNumber,
        name: d.name,
        type: "hiking",
        distanceM: d.distanceM,
        durationS: d.durationS,
        ascentM: d.ascentM,
        descentM: d.descentM,
        geometry: JSON.stringify(d.geometry),
        waypoints: JSON.stringify(d.waypoints),
        pois: JSON.stringify(d.pois),
        summary: d.summary ?? "",
      },
    });
    dayRows.push(toRow(row));
  }
  return { tour: tourToRow(t), days: dayRows };
}

export async function deleteTour(userId: string, tourId: string): Promise<boolean> {
  // Delete the tour row; the day Trips are deleted via a separate call (or
  // could be cascaded — but Trip has no FK to HikingTour, only a loose
  // tourId string, so we delete them explicitly).
  await prisma.trip.deleteMany({ where: { tourId, userId } });
  const r = await prisma.hikingTour.deleteMany({ where: { id: tourId, userId } });
  return r.count > 0;
}
