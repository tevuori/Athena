import { useEffect, useState } from "react";
import type { SnapZone } from "../store/windows";

/** Listens for "snap-preview" custom events and shows a highlight overlay. */
export default function SnapPreview() {
  const [zone, setZone] = useState<SnapZone>("none");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SnapZone>).detail;
      setZone(detail ?? "none");
    };
    document.addEventListener("snap-preview", handler);
    return () => document.removeEventListener("snap-preview", handler);
  }, []);

  if (zone === "none") return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight - 48;
  const halfW = Math.floor(vw / 2);
  const halfH = Math.floor(vh / 2);

  const style: React.CSSProperties = (() => {
    switch (zone) {
      case "maximized":
        return { left: 0, top: 0, width: vw, height: vh };
      case "left":
        return { left: 0, top: 0, width: halfW, height: vh };
      case "right":
        return { left: halfW, top: 0, width: vw - halfW, height: vh };
      case "top-left":
        return { left: 0, top: 0, width: halfW, height: halfH };
      case "top-right":
        return { left: halfW, top: 0, width: vw - halfW, height: halfH };
      case "bottom-left":
        return { left: 0, top: halfH, width: halfW, height: vh - halfH };
      case "bottom-right":
        return { left: halfW, top: halfH, width: vw - halfW, height: vh - halfH };
      default:
        return { display: "none" };
    }
  })();

  return (
    <div
      className="pointer-events-none fixed z-[9999] rounded-lg border-2 border-accent bg-accent/20 transition-all duration-100"
      style={style}
    />
  );
}
