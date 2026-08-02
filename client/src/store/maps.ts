import { create } from "zustand";

// ===== Maps state shared between the Maps app and Athena =====
// Mirrors store/browser.ts: a per-window command channel so Athena's
// client_action dispatch can drive the map (center, add markers, draw routes,
// show POIs, open a saved trip), and a centers map so the Athena chat context
// can report where the map is currently focused.

export type MapCommandKind =
  | "show" // center on lat/lon at zoom (optional label)
  | "add_marker" // add a single marker
  | "draw_route" // draw a route + its waypoints + POIs
  | "show_pois" // render a set of POI markers
  | "open_trip" // load a saved trip by id
  | "clear"; // clear markers + routes

export interface MapPoi {
  name: string;
  lat: number;
  lon: number;
  category?: string;
  description?: string;
}

export interface MapWaypoint {
  name: string;
  lat: number;
  lon: number;
  type?: string;
}

export interface MapCommand {
  seq: number;
  kind: MapCommandKind;
  lat?: number;
  lon?: number;
  zoom?: number;
  label?: string;
  title?: string;
  description?: string;
  category?: string;
  geometry?: [number, number][];
  waypoints?: MapWaypoint[];
  pois?: MapPoi[];
  type?: string;
  distanceM?: number;
  durationS?: number;
  tripId?: string;
}

interface MapsState {
  /** Pending command per Maps window id (consumed by MapsApp via useEffect). */
  commands: Record<string, MapCommand>;
  /** Current map center per Maps window id (reported by MapsApp). */
  centers: Record<string, { lat: number; lon: number; zoom: number }>;
  /** Issue a command for a window (called by Athena dispatch). */
  issueCommand: (windowId: string, kind: MapCommandKind, payload?: Partial<Omit<MapCommand, "seq" | "kind">>) => void;
  /** Report the current map center for a window (called by MapsApp). */
  setCenter: (windowId: string, lat: number, lon: number, zoom: number) => void;
  /** Remove all state for a window (on close). */
  removeWindow: (windowId: string) => void;
}

let cmdCounter = 0;

export const useMaps = create<MapsState>((set) => ({
  commands: {},
  centers: {},
  issueCommand: (windowId, kind, payload = {}) =>
    set((s) => ({
      commands: {
        ...s.commands,
        [windowId]: { seq: ++cmdCounter, kind, ...payload },
      },
    })),
  setCenter: (windowId, lat, lon, zoom) =>
    set((s) => ({ centers: { ...s.centers, [windowId]: { lat, lon, zoom } } })),
  removeWindow: (windowId) =>
    set((s) => {
      const commands = { ...s.commands };
      const centers = { ...s.centers };
      delete commands[windowId];
      delete centers[windowId];
      return { commands, centers };
    }),
}));
