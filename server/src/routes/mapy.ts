// ===== Mapy.cz API routes =====
// Endpoints for the Maps app + Athena tools: credentials management, geocoding,
// routing, POI search, elevation-backed ascent/descent, and saved-trips CRUD.
// All endpoints are user-scoped via the auth middleware.

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../middleware/auth";
import {
  hasApiKey,
  saveApiKey,
  deleteApiKey,
  getApiKey,
  geocode,
  reverseGeocode,
  route,
  routeTypeFor,
  searchPois,
  findNearbyPois,
  listTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip,
  MapyNotConfiguredError,
  type PoiCategoryGroup,
  type RouteType,
} from "../services/mapy";

const mapy = new Hono();
mapy.use("*", authMiddleware);

/** Wrap a handler so MapyNotConfiguredError → 400 with a helpful message. */
function mapyGuard(fn: (c: any) => Promise<Response>): (c: any) => Promise<Response> {
  return async (c) => {
    try {
      return await fn(c);
    } catch (e) {
      if (e instanceof MapyNotConfiguredError) {
        return c.json({ error: e.message }, 400);
      }
      const msg = e instanceof Error ? e.message : "Mapy.cz request failed";
      return c.json({ error: msg }, 502);
    }
  };
}

// ===== Credentials =====

mapy.get("/credentials/status", async (c) => {
  const { userId } = c.get("auth");
  return c.json({ configured: await hasApiKey(userId) });
});

const credSchema = z.object({ apiKey: z.string().min(1).max(200) });

mapy.put(
  "/credentials",
  zValidator("json", credSchema, (result, c) =>
    result.success ? undefined : c.json({ error: "API key is required" }, 400)
  ),
  async (c) => {
    const { userId } = c.get("auth");
    const { apiKey } = c.req.valid("json");
    await saveApiKey(userId, apiKey);
    return c.json({ ok: true });
  }
);

mapy.delete("/credentials", async (c) => {
  const { userId } = c.get("auth");
  await deleteApiKey(userId);
  return c.json({ ok: true });
});

/** GET /api/mapy/credentials/key — returns the decrypted API key.
 *  Needed by the client to init the Leaflet tile layer (tiles are loaded via
 *  <img> tags with the apikey query param, so the client must hold the key).
 *  The key is the user's own developer key, scoped to this authenticated user. */
mapy.get(
  "/credentials/key",
  mapyGuard(async (c) => {
    const { userId } = c.get("auth");
    const apiKey = await getApiKey(userId);
    return c.json({ apiKey });
  })
);

// ===== Geocoding =====

mapy.get(
  "/geocode",
  mapyGuard(async (c) => {
    const { userId } = c.get("auth");
    const query = c.req.query("query") ?? "";
    const limit = Math.min(Number(c.req.query("limit") ?? 10), 15);
    const lang = c.req.query("lang") ?? "en";
    if (!query.trim()) return c.json({ items: [] });
    const items = await geocode(userId, query, limit, lang);
    return c.json({ items });
  })
);

mapy.get(
  "/reverse",
  mapyGuard(async (c) => {
    const { userId } = c.get("auth");
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    const lang = c.req.query("lang") ?? "en";
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return c.json({ error: "lat and lon are required" }, 400);
    }
    const items = await reverseGeocode(userId, lat, lon, lang);
    return c.json({ items });
  })
);

// ===== Routing =====

const routeSchema = z.object({
  startLat: z.coerce.number(),
  startLon: z.coerce.number(),
  endLat: z.coerce.number(),
  endLon: z.coerce.number(),
  routeType: z.enum([
    "car_fast",
    "car_fast_traffic",
    "car_short",
    "foot_fast",
    "foot_hiking",
    "bike_road",
    "bike_mountain",
  ]),
  /** Friendly mode — if provided, overrides routeType via routeTypeFor. */
  mode: z.enum(["hiking", "bicycle", "car"]).optional(),
  lang: z.string().optional(),
  /** Waypoints as [lon, lat] pairs (max 15). */
  waypoints: z.array(z.tuple([z.number(), z.number()])).max(15).optional(),
});

mapy.get(
  "/route",
  mapyGuard(async (c) => {
    const { userId } = c.get("auth");
    const parsed = routeSchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid route params" }, 400);
    }
    const p = parsed.data;
    const rt: RouteType = p.mode ? routeTypeFor(p.mode) : p.routeType;
    const result = await route(userId, {
      startLon: p.startLon,
      startLat: p.startLat,
      endLon: p.endLon,
      endLat: p.endLat,
      waypoints: p.waypoints,
      routeType: rt,
      lang: p.lang ?? "en",
    });
    return c.json(result);
  })
);

// ===== POI search =====

mapy.get(
  "/pois",
  mapyGuard(async (c) => {
    const { userId } = c.get("auth");
    const query = c.req.query("query") ?? "";
    const lat = c.req.query("lat");
    const lon = c.req.query("lon");
    const radius = c.req.query("radius");
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 30);
    const lang = c.req.query("lang") ?? "en";
    if (!query.trim()) return c.json({ items: [] });
    const items = await searchPois(userId, {
      query,
      lat: lat !== undefined ? Number(lat) : undefined,
      lon: lon !== undefined ? Number(lon) : undefined,
      radius: radius !== undefined ? Number(radius) : undefined,
      limit,
      lang,
    });
    return c.json({ items });
  })
);

mapy.get(
  "/nearby",
  mapyGuard(async (c) => {
    const { userId } = c.get("auth");
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    const radius = Number(c.req.query("radius") ?? 3000);
    const categories = (c.req.query("categories") ?? "all") as PoiCategoryGroup;
    const limit = Math.min(Number(c.req.query("limit") ?? 30), 60);
    const lang = c.req.query("lang") ?? "en";
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return c.json({ error: "lat and lon are required" }, 400);
    }
    const items = await findNearbyPois(userId, {
      lat,
      lon,
      radiusM: radius,
      categories,
      limit,
      lang,
    });
    return c.json({ items });
  })
);

// ===== Trips CRUD =====

const tripCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["hiking", "bicycle", "car"]),
  distanceM: z.number(),
  durationS: z.number().int(),
  ascentM: z.number().optional(),
  descentM: z.number().optional(),
  geometry: z.array(z.tuple([z.number(), z.number()])),
  waypoints: z
    .array(
      z.object({
        name: z.string(),
        lat: z.number(),
        lon: z.number(),
        type: z.string().optional(),
      })
    )
    .optional(),
  pois: z
    .array(
      z.object({
        name: z.string(),
        lat: z.number(),
        lon: z.number(),
        category: z.string(),
        description: z.string().optional(),
      })
    )
    .optional(),
  summary: z.string().optional(),
});

mapy.get("/trips", async (c) => {
  const { userId } = c.get("auth");
  const trips = await listTrips(userId);
  return c.json({ trips });
});

mapy.get("/trips/:id", async (c) => {
  const { userId } = c.get("auth");
  const trip = await getTrip(userId, c.req.param("id"));
  if (!trip) return c.json({ error: "Trip not found" }, 404);
  return c.json({ trip });
});

mapy.post(
  "/trips",
  zValidator("json", tripCreateSchema, (result, c) =>
    result.success ? undefined : c.json({ error: result.error.issues[0]?.message ?? "Invalid trip" }, 400)
  ),
  async (c) => {
    const { userId } = c.get("auth");
    const input = c.req.valid("json");
    const trip = await createTrip(userId, input);
    return c.json({ trip }, 201);
  }
);

mapy.put(
  "/trips/:id",
  zValidator("json", tripCreateSchema.partial(), (result, c) =>
    result.success ? undefined : c.json({ error: result.error.issues[0]?.message ?? "Invalid trip" }, 400)
  ),
  async (c) => {
    const { userId } = c.get("auth");
    const trip = await updateTrip(userId, c.req.param("id"), c.req.valid("json"));
    if (!trip) return c.json({ error: "Trip not found" }, 404);
    return c.json({ trip });
  }
);

mapy.delete("/trips/:id", async (c) => {
  const { userId } = c.get("auth");
  const ok = await deleteTrip(userId, c.req.param("id"));
  if (!ok) return c.json({ error: "Trip not found" }, 404);
  return c.json({ ok: true });
});

export default mapy;
