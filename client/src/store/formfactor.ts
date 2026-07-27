import { create } from "zustand";

export type FormFactorMode = "phone" | "desktop";

interface FormFactorState {
  mode: FormFactorMode;
  refresh: () => void;
}

function detectMode(): FormFactorMode {
  return window.matchMedia("(pointer: coarse)").matches && window.innerWidth <= 820
    ? "phone"
    : "desktop";
}

export const useFormFactor = create<FormFactorState>((set) => ({
  mode: detectMode(),
  refresh: () => set({ mode: detectMode() }),
}));

export function initFormFactorListeners() {
  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => useFormFactor.getState().refresh());
  };
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener?.("change", schedule);
  return () => {
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    mq.removeEventListener?.("change", schedule);
    cancelAnimationFrame(raf);
  };
}
