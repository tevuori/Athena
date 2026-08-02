import { api } from "./api";

// ===== Mapy.cz API client (mirrors services/browser.ts pattern) =====

export interface GeocodeItem {
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
  geometry: [number, number][]; // [lat, lon]
  parts: { length: number; duration: number }[];
}

export interface PoiItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
  description: string;
  permalink?: string;
}

export interface TripSummary {
  id: string;
  name: string;
  type: string;
  distanceM: number;
  durationS: number;
  ascentM: number;
  createdAt: string;
}

export interface TripDetail extends TripSummary {
  descentM: number;
  geometry: [number, number][];
  waypoints: { name: string; lat: number; lon: number; type?: string }[];
  pois: { name: string; lat: number; lon: number; category: string; description?: string }[];
  summary: string;
  tourId?: string | null;
  dayNumber?: number | null;
  updatedAt: string;
}

export interface TripInput {
  name: string;
  type: "hiking" | "bicycle" | "car";
  distanceM: number;
  durationS: number;
  ascentM?: number;
  descentM?: number;
  geometry: [number, number][];
  waypoints?: { name: string; lat: number; lon: number; type?: string }[];
  pois?: { name: string; lat: number; lon: number; category: string; description?: string }[];
  summary?: string;
}

export const mapyApi = {
  // ===== Credentials =====
  credentialsStatus: () => api.get<{ configured: boolean }>("/api/mapy/credentials/status"),
  setApiKey: (apiKey: string) => api.put<{ ok: boolean }>("/api/mapy/credentials", { apiKey }),
  deleteApiKey: () => api.delete<{ ok: boolean }>("/api/mapy/credentials"),
  /** Decrypted key — needed to init the Leaflet tile layer (tiles load via <img>). */
  getApiKey: () => api.get<{ apiKey: string }>("/api/mapy/credentials/key"),

  // ===== Geocoding =====
  geocode: (query: string, limit = 10, lang = "en") =>
    api.get<{ items: GeocodeItem[] }>(
      `/api/mapy/geocode?query=${encodeURIComponent(query)}&limit=${limit}&lang=${lang}`
    ),
  reverse: (lat: number, lon: number, lang = "en") =>
    api.get<{ items: GeocodeItem[] }>(
      `/api/mapy/reverse?lat=${lat}&lon=${lon}&lang=${lang}`
    ),

  // ===== Routing =====
  route: (params: {
    startLat: number;
    startLon: number;
    endLat: number;
    endLon: number;
    mode?: "hiking" | "bicycle" | "car";
    waypoints?: [number, number][];
    lang?: string;
  }) => {
    const sp = new URLSearchParams({
      startLat: String(params.startLat),
      startLon: String(params.startLon),
      endLat: String(params.endLat),
      endLon: String(params.endLon),
    });
    if (params.mode) sp.set("mode", params.mode);
    if (params.lang) sp.set("lang", params.lang);
    if (params.waypoints) {
      for (const w of params.waypoints) sp.append("waypoints", `${w[0]},${w[1]}`);
    }
    return api.get<RouteResult>(`/api/mapy/route?${sp.toString()}`);
  },

  // ===== POI search =====
  searchPois: (params: { query: string; lat?: number; lon?: number; radius?: number; limit?: number; lang?: string }) => {
    const sp = new URLSearchParams({ query: params.query });
    if (params.lat !== undefined) sp.set("lat", String(params.lat));
    if (params.lon !== undefined) sp.set("lon", String(params.lon));
    if (params.radius !== undefined) sp.set("radius", String(params.radius));
    if (params.limit !== undefined) sp.set("limit", String(params.limit));
    if (params.lang) sp.set("lang", params.lang);
    return api.get<{ items: PoiItem[] }>(`/api/mapy/pois?${sp.toString()}`);
  },
  findNearby: (params: { lat: number; lon: number; radius?: number; categories?: string; limit?: number; lang?: string }) => {
    const sp = new URLSearchParams({ lat: String(params.lat), lon: String(params.lon) });
    if (params.radius !== undefined) sp.set("radius", String(params.radius));
    if (params.categories) sp.set("categories", params.categories);
    if (params.limit !== undefined) sp.set("limit", String(params.limit));
    if (params.lang) sp.set("lang", params.lang);
    return api.get<{ items: PoiItem[] }>(`/api/mapy/nearby?${sp.toString()}`);
  },

  // ===== Trips CRUD =====
  listTrips: () => api.get<{ trips: TripSummary[] }>("/api/mapy/trips"),
  getTrip: (id: string) => api.get<{ trip: TripDetail }>(`/api/mapy/trips/${id}`),
  saveTrip: (trip: TripInput) => api.post<{ trip: TripDetail }>("/api/mapy/trips", trip),
  updateTrip: (id: string, trip: Partial<TripInput>) => api.put<{ trip: TripDetail }>(`/api/mapy/trips/${id}`, trip),
  deleteTrip: (id: string) => api.delete<{ ok: boolean }>(`/api/mapy/trips/${id}`),
  /** GPX download URL for a single trip (opens as a file download). */
  tripGpxUrl: (id: string) => `/api/mapy/trips/${id}/gpx`,
};

// ===== Multi-day hiking tours =====

export type TourMode = "hub" | "through";
export type TourDifficulty = "easy" | "medium" | "hard" | "expert";

export interface TourDay {
  dayNumber: number;
  name: string;
  distanceM: number;
  durationS: number;
  ascentM: number;
  descentM: number;
  geometry: [number, number][];
  waypoints: { name: string; lat: number; lon: number; type?: string }[];
  pois: { name: string; lat: number; lon: number; category: string; description?: string }[];
  overnight?: { name: string; lat: number; lon: number; description?: string };
  wildCamp?: boolean;
  hardDay?: boolean;
  narration?: string;
}

export interface GeneratedTour {
  mode: TourMode;
  baseLat: number;
  baseLon: number;
  baseName: string;
  endLat?: number;
  endLon?: number;
  endName?: string;
  numDays: number;
  difficulty: TourDifficulty;
  days: TourDay[];
  totalDistanceM: number;
  totalAscentM: number;
  totalDurationS: number;
  summary: string;
}

export interface TourGenerateInput {
  mode: TourMode;
  baseLat: number;
  baseLon: number;
  baseName: string;
  endLat?: number;
  endLon?: number;
  endName?: string;
  numDays: number;
  difficulty: TourDifficulty;
  notes?: string;
}

export interface TourSummary {
  id: string;
  name: string;
  mode: TourMode;
  baseName: string;
  numDays: number;
  difficulty: TourDifficulty;
  totalDistanceM: number;
  totalAscentM: number;
  createdAt: string;
}

export interface TourDetail {
  tour: {
    id: string;
    name: string;
    mode: TourMode;
    baseLat: number;
    baseLon: number;
    baseName: string;
    endLat: number | null;
    endLon: number | null;
    endName: string | null;
    numDays: number;
    difficulty: TourDifficulty;
    totalDistanceM: number;
    totalAscentM: number;
    totalDurationS: number;
    summary: string;
    createdAt: string;
    updatedAt: string;
  };
  days: TripDetail[];
}

export interface TourSaveInput extends GeneratedTour {
  name: string;
}

export const tourApi = {
  generate: (input: TourGenerateInput) =>
    api.post<{ tour: GeneratedTour }>("/api/mapy/tours/generate", input),
  save: (input: TourSaveInput) => api.post<TourDetail>("/api/mapy/tours", input),
  list: () => api.get<{ tours: TourSummary[] }>("/api/mapy/tours"),
  get: (id: string) => api.get<TourDetail>(`/api/mapy/tours/${id}`),
  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/mapy/tours/${id}`),
  regenerateDay: (id: string, day: number) =>
    api.post<{ day: TourDay }>(`/api/mapy/tours/${id}/regenerate/${day}`),
  /** GPX download URL for a whole tour (one track per day). */
  tourGpxUrl: (id: string) => `/api/mapy/tours/${id}/gpx`,
};
