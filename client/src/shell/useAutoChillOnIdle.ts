// ===== useAutoChillOnIdle =====
// When enabled in Settings, enters the Spotify fullscreen "chill" view after
// the user has been inactive for over 10 minutes while music is playing.
// Any user input (mouse move, key, click, scroll, touch) exits the view.

import { useEffect, useRef } from "react";
import { useMusic } from "../store/music";
import { useSettings } from "../store/settings";

const IDLE_THRESHOLD = 10 * 60 * 1000; // 10 minutes
const CHECK_INTERVAL = 10_000; // 10s

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "wheel",
  "touchstart",
];

export function useAutoChillOnIdle() {
  const chilling = useMusic((s) => s.chilling);
  const setChilling = useMusic((s) => s.setChilling);
  const enabled = useSettings((s) => s.autoChillOnIdle);

  const lastActivity = useRef<number>(Date.now());
  const autoEntered = useRef<boolean>(false);

  // Reset the idle timer whenever the feature is toggled off.
  useEffect(() => {
    if (!enabled) {
      lastActivity.current = Date.now();
      autoEntered.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const onActivity = () => {
      lastActivity.current = Date.now();
      // If we auto-entered chill mode, any activity exits it.
      if (autoEntered.current) {
        autoEntered.current = false;
        if (useMusic.getState().chilling) setChilling(false);
      }
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }

    const id = window.setInterval(() => {
      // Already in chill mode (manual or auto) — nothing to do.
      if (useMusic.getState().chilling) return;
      const state = useMusic.getState().state;
      if (!state?.is_playing) return;
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_THRESHOLD) {
        autoEntered.current = true;
        setChilling(true);
      }
    }, CHECK_INTERVAL);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
      clearInterval(id);
    };
  }, [enabled, setChilling]);

  // If the user manually exits chill while autoEntered is set, clear the flag.
  useEffect(() => {
    if (!chilling && autoEntered.current) {
      autoEntered.current = false;
    }
  }, [chilling]);
}
