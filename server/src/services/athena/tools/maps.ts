// ===== Athena maps & trip-planning tools =====
// Tools that let Athena fully control the Maps app and the mapy.com REST API:
// geocode places, search for POIs/landmarks, find nearby water sources / legal
// sleeping spots / landmarks, plan routes (hiking / bicycle / car), draw routes
// + POIs on the map, narrate about points of interest, and persist trips.
//
// Server-side tools (geocode, search_places, find_nearby_pois, plan_route,
// save_trip, list_trips, get_trip, delete_trip) call the mapy.com API via
// services/mapy.ts. Client-action tools (open_maps, show_on_map, add_map_marker,
// draw_map_route, show_map_pois, open_trip) return a payload that the Athena
// client dispatches to the Maps app via the maps store (see store/maps.ts).

import type { ToolDef } from "./plugin";
import {
  geocode,
  searchPois,
  findNearbyPois,
  route,
  routeTypeFor,
  sampleRoutePoints,
  listTrips,
  getTrip,
  createTrip,
  deleteTrip,
  hasApiKey,
  MapyNotConfiguredError,
  type PoiCategoryGroup,
} from "../../mapy";

/** Wrap a handler so MapyNotConfiguredError → a clear error object (not a throw). */
function safe<T>(fn: (args: any, ctx: any) => Promise<T>): (args: any, ctx: any) => Promise<T | { error: string }> {
  return async (args, ctx) => {
    try {
      return await fn(args, ctx);
    } catch (e) {
      if (e instanceof MapyNotConfiguredError) return { error: e.message };
      return { error: e instanceof Error ? e.message : "Mapy.cz request failed" };
    }
  };
}

export const mapTools: ToolDef[] = [
  // ===== Server-side: data tools =====

  {
    name: "geocode",
    description:
      "Resolve a place name (city, landmark, address, mountain) to latitude/longitude coordinates using mapy.cz. Returns up to 10 candidates with name, lat, lon, type, and location description. ALWAYS call this first when the user mentions a place by name and you need coordinates for show_on_map, plan_route, or find_nearby_pois. Pick the best match from the results.",
    parameters: [
      { name: "query", type: "string", description: "Place name to resolve (e.g. 'Sněžka', 'Praha', 'Krkonoše').", required: true },
      { name: "limit", type: "number", description: "Max results (default 10, max 15)." },
    ],
    handler: safe(async (args, { userId }) => {
      const limit = Math.min(Number(args.limit ?? 10), 15);
      const items = await geocode(userId, String(args.query ?? ""), limit);
      return { count: items.length, items };
    }),
  },

  {
    name: "search_places",
    description:
      "Search for points of interest / landmarks by text (castles, viewpoints, towers, springs, shelters, restaurants, etc.) using mapy.cz. Optionally bias results toward a location (lat/lon + radius in meters). Returns name, lat, lon, category, description. Use this to find specific landmarks or amenities the user asks about, then show_on_map + add_map_marker to display them and describe them in your reply.",
    parameters: [
      { name: "query", type: "string", description: "What to search for (e.g. 'hrad', 'rozhledna', 'castle', 'restaurace').", required: true },
      { name: "lat", type: "number", description: "Latitude to bias results toward (optional)." },
      { name: "lon", type: "number", description: "Longitude to bias results toward (optional)." },
      { name: "radius", type: "number", description: "Bias radius in meters (only with lat/lon, optional)." },
      { name: "limit", type: "number", description: "Max results (default 20, max 30)." },
    ],
    handler: safe(async (args, { userId }) => {
      const items = await searchPois(userId, {
        query: String(args.query ?? ""),
        lat: args.lat !== undefined ? Number(args.lat) : undefined,
        lon: args.lon !== undefined ? Number(args.lon) : undefined,
        radius: args.radius !== undefined ? Number(args.radius) : undefined,
        limit: Math.min(Number(args.limit ?? 20), 30),
      });
      return { count: items.length, items };
    }),
  },

  {
    name: "find_nearby_pois",
    description:
      "Find hiking-relevant points of interest near a coordinate, filtered by category. Categories: 'water' (springs, wells, drinking water), 'sleeping' (shelters, bivouacs, mountain huts, camps — legal sleeping spots), 'landmarks' (castles, viewpoints, towers, tourist signposts), 'amenities' (restaurants, accommodation, refreshments), or 'all'. This is the KEY tool for hiking trip planning — use it to find water sources and legal sleeping spots along a route. Returns name, lat, lon, category, description.",
    parameters: [
      { name: "lat", type: "number", description: "Center latitude.", required: true },
      { name: "lon", type: "number", description: "Center longitude.", required: true },
      { name: "radius", type: "number", description: "Search radius in meters (default 3000)." },
      {
        name: "categories",
        type: "string",
        description: "Category group: 'water' | 'sleeping' | 'landmarks' | 'amenities' | 'all' (default 'all').",
        enum: ["water", "sleeping", "landmarks", "amenities", "all"],
      },
      { name: "limit", type: "number", description: "Max results (default 30, max 60)." },
    ],
    handler: safe(async (args, { userId }) => {
      const categories = (String(args.categories ?? "all")) as PoiCategoryGroup;
      const items = await findNearbyPois(userId, {
        lat: Number(args.lat),
        lon: Number(args.lon),
        radiusM: args.radius !== undefined ? Number(args.radius) : 3000,
        categories,
        limit: Math.min(Number(args.limit ?? 30), 60),
      });
      return { count: items.length, items };
    }),
  },

  {
    name: "plan_route",
    description:
      "Plan a route between two points (optionally via waypoints) for hiking, bicycle, or car using mapy.cz. Returns distance (meters), duration (seconds), ascent/descent (meters, computed from elevation data — especially useful for hiking), the route geometry (array of [lat, lon] points), and per-segment stats. For HIKING routes, this tool ALSO automatically finds water sources, legal sleeping spots, and landmarks along the route and includes them in the result so you can narrate the full plan. After planning, call draw_map_route to display the route on the map, then describe the plan (distance, duration, ascent, water sources, sleeping spots, landmarks) in your reply.",
    parameters: [
      { name: "startLat", type: "number", description: "Start latitude.", required: true },
      { name: "startLon", type: "number", description: "Start longitude.", required: true },
      { name: "endLat", type: "number", description: "End latitude.", required: true },
      { name: "endLon", type: "number", description: "End longitude.", required: true },
      {
        name: "mode",
        type: "string",
        description: "Travel mode: 'hiking' | 'bicycle' | 'car' (default 'hiking').",
        enum: ["hiking", "bicycle", "car"],
      },
      {
        name: "waypoints",
        type: "array",
        description: "Optional intermediate waypoints as [lon, lat] pairs (max 15).",
        items: { type: "number" },
      },
    ],
    handler: safe(async (args, { userId }) => {
      const mode = (String(args.mode ?? "hiking")) as "hiking" | "bicycle" | "car";
      const waypoints = Array.isArray(args.waypoints)
        ? (args.waypoints as [number, number][]).filter(
            (w) => Array.isArray(w) && w.length === 2 && Number.isFinite(w[0]) && Number.isFinite(w[1])
          )
        : undefined;
      const result = await route(userId, {
        startLon: Number(args.startLon),
        startLat: Number(args.startLat),
        endLon: Number(args.endLon),
        endLat: Number(args.endLat),
        waypoints,
        routeType: routeTypeFor(mode),
      });

      // For hiking, enrich the route with nearby water sources, sleeping spots,
      // and landmarks. Sample up to 8 points along the geometry and search near
      // each, then merge + dedupe. Capped to conserve API credits.
      let pois: { name: string; lat: number; lon: number; category: string; description?: string }[] = [];
      if (mode === "hiking" && result.geometry.length > 1) {
        const samples = sampleRoutePoints(result.geometry, 8);
        const seen = new Set<string>();
        for (const [lat, lon] of samples) {
          try {
            const nearby = await findNearbyPois(userId, {
              lat,
              lon,
              radiusM: 2500,
              categories: "all",
              limit: 20,
            });
            for (const p of nearby) {
              const key = `${p.name}|${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              pois.push({ name: p.name, lat: p.lat, lon: p.lon, category: p.category, description: p.description });
            }
          } catch {
            // a single sample failing shouldn't abort enrichment
          }
        }
      }

      return {
        mode,
        distanceM: result.distanceM,
        durationS: result.durationS,
        ascentM: result.ascentM,
        descentM: result.descentM,
        geometryPoints: result.geometry.length,
        geometry: result.geometry,
        pois,
        poiCount: pois.length,
      };
    }),
  },

  // ===== Server-side: trip persistence =====

  {
    name: "save_trip",
    description:
      "Save a planned trip (from plan_route) as a persistent Trip the user can reload later. Call this after planning a trip the user wants to keep. Pass the geometry + POIs from plan_route. Returns { tripId }. The trip appears in the Maps app's Trips list.",
    destructive: true,
    parameters: [
      { name: "name", type: "string", description: "Trip name (e.g. 'Sněžka hike').", required: true },
      {
        name: "type",
        type: "string",
        description: "Travel mode: 'hiking' | 'bicycle' | 'car'.",
        enum: ["hiking", "bicycle", "car"],
        required: true,
      },
      { name: "distanceM", type: "number", description: "Total distance in meters (from plan_route).", required: true },
      { name: "durationS", type: "number", description: "Estimated duration in seconds (from plan_route).", required: true },
      { name: "ascentM", type: "number", description: "Total ascent in meters (from plan_route)." },
      { name: "descentM", type: "number", description: "Total descent in meters (from plan_route)." },
      {
        name: "geometry",
        type: "array",
        description: "Route geometry as an array of [lat, lon] points (from plan_route).",
        items: { type: "number" },
        required: true,
      },
      {
        name: "waypoints",
        type: "array",
        description: "Waypoints: [{ name, lat, lon, type? }].",
        items: { type: "object", properties: [
          { name: "name", type: "string", description: "Waypoint name" }, { name: "lat", type: "number", description: "Latitude" }, { name: "lon", type: "number", description: "Longitude" }, { name: "type", type: "string", description: "Optional type label" }
        ] },
      },
      {
        name: "pois",
        type: "array",
        description: "Points of interest: [{ name, lat, lon, category, description? }] (from plan_route).",
        items: { type: "object", properties: [
          { name: "name", type: "string", description: "POI name" }, { name: "lat", type: "number", description: "Latitude" }, { name: "lon", type: "number", description: "Longitude" }, { name: "category", type: "string", description: "Category (water/sleeping/landmarks/amenities)" }, { name: "description", type: "string", description: "Optional description" }
        ] },
      },
      { name: "summary", type: "string", description: "Human-readable plan / notes." },
    ],
    handler: safe(async (args, { userId }) => {
      const geometry = (args.geometry as [number, number][]) ?? [];
      if (geometry.length < 2) return { error: "geometry must have at least 2 points" };
      const trip = await createTrip(userId, {
        name: String(args.name ?? "Untitled trip"),
        type: String(args.type ?? "hiking"),
        distanceM: Number(args.distanceM ?? 0),
        durationS: Number(args.durationS ?? 0),
        ascentM: args.ascentM !== undefined ? Number(args.ascentM) : 0,
        descentM: args.descentM !== undefined ? Number(args.descentM) : 0,
        geometry,
        waypoints: (args.waypoints as any[]) ?? [],
        pois: (args.pois as any[]) ?? [],
        summary: String(args.summary ?? ""),
      });
      return { tripId: trip.id, saved: true };
    }),
  },

  {
    name: "list_trips",
    description: "List the user's saved trips. Returns id, name, type, distanceM, durationS, ascentM, createdAt.",
    parameters: [],
    handler: safe(async (_args, { userId }) => {
      const trips = await listTrips(userId);
      return { count: trips.length, trips };
    }),
  },

  {
    name: "get_trip",
    description: "Get full details of a saved trip (geometry, waypoints, POIs, summary) by id. Use the id from list_trips.",
    parameters: [{ name: "tripId", type: "string", description: "Trip id (from list_trips).", required: true }],
    handler: safe(async (args, { userId }) => {
      const trip = await getTrip(userId, String(args.tripId ?? ""));
      if (!trip) return { error: "Trip not found" };
      return { trip };
    }),
  },

  {
    name: "delete_trip",
    description: "Delete a saved trip by id.",
    destructive: true,
    parameters: [{ name: "tripId", type: "string", description: "Trip id to delete.", required: true }],
    handler: safe(async (args, { userId }) => {
      const ok = await deleteTrip(userId, String(args.tripId ?? ""));
      return ok ? { deleted: true } : { error: "Trip not found" };
    }),
  },

  // ===== Client-action tools: drive the Maps app =====

  {
    name: "open_maps",
    description:
      "Open the Maps app on the user's desktop. Use when the user asks to open the map / Maps app, or before any show_on_map / draw_map_route if no Maps window is open.",
    clientAction: true,
    parameters: [],
    handler: async () => ({ action: "open_maps" }),
  },

  {
    name: "show_on_map",
    description:
      "Center the Maps app on a location (lat/lon) at a given zoom level, optionally with a label. Use after geocode to show a city/landmark the user asked about. If no Maps window is open, one is opened.",
    clientAction: true,
    parameters: [
      { name: "lat", type: "number", description: "Latitude to center on.", required: true },
      { name: "lon", type: "number", description: "Longitude to center on.", required: true },
      { name: "zoom", type: "number", description: "Zoom level (0-20, default 13). Higher = more detail." },
      { name: "label", type: "string", description: "Optional label for the location." },
    ],
    handler: async (args) => ({
      action: "show_on_map",
      lat: Number(args.lat),
      lon: Number(args.lon),
      zoom: args.zoom !== undefined ? Number(args.zoom) : 13,
      ...(args.label ? { label: String(args.label) } : {}),
    }),
  },

  {
    name: "add_map_marker",
    description:
      "Add a marker (POI / landmark) to the map. Use after search_places or find_nearby_pois to display a point of interest. The marker shows the title + optional description + category color. Pair with a description in your reply so the user learns about the point of interest.",
    clientAction: true,
    parameters: [
      { name: "lat", type: "number", description: "Marker latitude.", required: true },
      { name: "lon", type: "number", description: "Marker longitude.", required: true },
      { name: "title", type: "string", description: "Marker title (e.g. 'Sněžka', 'Pramen Labe').", required: true },
      { name: "description", type: "string", description: "Optional description shown in the marker popup." },
      { name: "category", type: "string", description: "Category for color coding: 'water' | 'sleeping' | 'landmarks' | 'amenities' | 'poi'." },
    ],
    handler: async (args) => ({
      action: "add_map_marker",
      lat: Number(args.lat),
      lon: Number(args.lon),
      title: String(args.title ?? ""),
      ...(args.description ? { description: String(args.description) } : {}),
      ...(args.category ? { category: String(args.category) } : {}),
    }),
  },

  {
    name: "draw_map_route",
    description:
      "Draw a planned route on the map with its waypoints and POIs. Call this after plan_route to display the route. Pass the geometry (array of [lat, lon]), waypoints, and pois from plan_route. The route is drawn as a colored line; waypoints and POIs are rendered as markers.",
    clientAction: true,
    parameters: [
      {
        name: "geometry",
        type: "array",
        description: "Route geometry as an array of [lat, lon] points (from plan_route).",
        items: { type: "number" },
        required: true,
      },
      { name: "type", type: "string", description: "Route type: 'hiking' | 'bicycle' | 'car'." },
      { name: "distanceM", type: "number", description: "Total distance in meters (shown in the route panel)." },
      { name: "durationS", type: "number", description: "Estimated duration in seconds." },
      {
        name: "waypoints",
        type: "array",
        description: "Waypoints: [{ name, lat, lon, type? }].",
        items: { type: "object", properties: [
          { name: "name", type: "string", description: "Waypoint name" }, { name: "lat", type: "number", description: "Latitude" }, { name: "lon", type: "number", description: "Longitude" }, { name: "type", type: "string", description: "Optional type label" }
        ] },
      },
      {
        name: "pois",
        type: "array",
        description: "Points of interest to render as markers: [{ name, lat, lon, category, description? }].",
        items: { type: "object", properties: [
          { name: "name", type: "string", description: "POI name" }, { name: "lat", type: "number", description: "Latitude" }, { name: "lon", type: "number", description: "Longitude" }, { name: "category", type: "string", description: "Category (water/sleeping/landmarks/amenities)" }, { name: "description", type: "string", description: "Optional description" }
        ] },
      },
    ],
    handler: async (args) => ({
      action: "draw_map_route",
      geometry: (args.geometry as [number, number][]) ?? [],
      ...(args.type ? { type: String(args.type) } : {}),
      ...(args.distanceM !== undefined ? { distanceM: Number(args.distanceM) } : {}),
      ...(args.durationS !== undefined ? { durationS: Number(args.durationS) } : {}),
      ...(args.waypoints ? { waypoints: args.waypoints } : {}),
      ...(args.pois ? { pois: args.pois } : {}),
    }),
  },

  {
    name: "show_map_pois",
    description:
      "Render a set of POIs as markers on the map (e.g. all water sources near a route). Use after find_nearby_pois to display the results. Each POI needs name, lat, lon, and optionally category + description.",
    clientAction: true,
    parameters: [
      {
        name: "pois",
        type: "array",
        description: "POIs to render: [{ name, lat, lon, category, description? }].",
        items: { type: "object", properties: [
          { name: "name", type: "string", description: "POI name" }, { name: "lat", type: "number", description: "Latitude" }, { name: "lon", type: "number", description: "Longitude" }, { name: "category", type: "string", description: "Category (water/sleeping/landmarks/amenities)" }, { name: "description", type: "string", description: "Optional description" }
        ] },
        required: true,
      },
    ],
    handler: async (args) => ({
      action: "show_map_pois",
      pois: (args.pois as any[]) ?? [],
    }),
  },

  {
    name: "open_trip",
    description:
      "Open a saved trip in the Maps app — loads its route geometry, waypoints, and POIs onto the map. Use the trip id from list_trips.",
    clientAction: true,
    parameters: [{ name: "tripId", type: "string", description: "Trip id to open.", required: true }],
    handler: async (args) => ({ action: "open_trip", tripId: String(args.tripId ?? "") }),
  },

  // ===== Status helper =====

  {
    name: "mapy_status",
    description:
      "Check whether the user has configured their mapy.cz API key (required for all map tools). Returns { configured: boolean }. If not configured, tell the user to add their key in Settings → Integrations (get one at developer.mapy.com).",
    parameters: [],
    handler: safe(async (_args, { userId }) => {
      const configured = await hasApiKey(userId);
      return { configured };
    }),
  },
];
