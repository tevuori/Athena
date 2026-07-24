import { create } from "zustand";

/**
 * Form-factor detection + manual override.
 *
 * Resolves the current shell mode ("phone" | "tablet" | "desktop") based on
 * pointer type + viewport width, with an optional user override persisted to
 * localStorage. The shell (App.tsx) branches on `mode` to render either the
 * desktop DesktopEnvironment or the mobile MobileShell.
 *
 * Breakpoints:
 *   - phone   = coarse pointer AND max-width 820px
 *   - tablet  = coarse pointer AND wider than 820px
 *   - desktop = fine pointer (mouse) OR override
 */

export type FormFactorMode = "phone" | "tablet" | "desktop";
export type FormFactorOverride = "auto" | FormFactorMode;

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface FormFactorState {
  /** Resolved mode after applying override. */
  mode: FormFactorMode;
  /** What the device actually is (ignoring override). */
  detected: FormFactorMode;
  /** User override ("auto" = use detected). */
  override: FormFactorOverride;
  isTouch: boolean;
  isNarrow: boolean; // viewport <= 820px
  safeArea: SafeAreaInsets;
  setOverride: (o: FormFactorOverride) => void;
  /** Recompute detected mode + safe-area insets. Called on resize/orientation. */
  refresh: () => void;
}

const STORAGE_KEY = "athena.formfactor";

function loadOverride(): FormFactorOverride {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "auto" || raw === "phone" || raw === "tablet" || raw === "desktop") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "auto";
}

function persistOverride(o: FormFactorOverride) {
  try {
    localStorage.setItem(STORAGE_KEY, o);
  } catch {
    /* ignore */
  }
}

/** Read env(safe-area-inset-*) via a temporary element measurement. */
function readSafeArea(): SafeAreaInsets {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "env(safe-area-inset-left)";
  el.style.top = "env(safe-area-inset-top)";
  el.style.right = "env(safe-area-inset-right)";
  el.style.bottom = "env(safe-area-inset-bottom)";
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  const rect = el.getBoundingClientRect();
  document.body.removeChild(el);
  // getBoundingClientRect of a 0-size box at the inset origin gives the inset
  // value as its left/top; right/bottom come from viewport - rect.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    top: Math.max(0, rect.top),
    bottom: Math.max(0, vh - rect.bottom),
    left: Math.max(0, rect.left),
    right: Math.max(0, vw - rect.right),
  };
}

function detectMode(): { mode: FormFactorMode; isTouch: boolean; isNarrow: boolean } {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const vw = window.innerWidth;
  const isNarrow = vw <= 820;
  let detected: FormFactorMode;
  if (coarse && isNarrow) detected = "phone";
  else if (coarse) detected = "tablet";
  else detected = "desktop";
  return { mode: detected, isTouch: coarse, isNarrow };
}

const initial = detectMode();
const initialOverride = loadOverride();
const initialMode: FormFactorMode = initialOverride === "auto" ? initial.mode : initialOverride;

export const useFormFactor = create<FormFactorState>((set, get) => ({
  mode: initialMode,
  detected: initial.mode,
  override: initialOverride,
  isTouch: initial.isTouch,
  isNarrow: initial.isNarrow,
  safeArea: readSafeArea(),

  setOverride: (override) => {
    persistOverride(override);
    const detected = get().detected;
    set({ override, mode: override === "auto" ? detected : override });
  },

  refresh: () => {
    const d = detectMode();
    const override = get().override;
    set({
      detected: d.mode,
      isTouch: d.isTouch,
      isNarrow: d.isNarrow,
      safeArea: readSafeArea(),
      mode: override === "auto" ? d.mode : override,
    });
  },
}));

/** Set up resize/orientation listeners + matchMedia change. Call once at app start. */
export function initFormFactorListeners() {
  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => useFormFactor.getState().refresh());
  };
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  // pointer-type can change (e.g. attaching a mouse to a tablet)
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener?.("change", schedule);
  return () => {
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    mq.removeEventListener?.("change", schedule);
    cancelAnimationFrame(raf);
  };
}
