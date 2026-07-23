// Vector element model for the Whiteboard canvas.
// All elements are plain serializable objects so they can be stored as JSON
// in the backend `Whiteboard.content` column and round-tripped losslessly.

export type Tool =
  | "select"
  | "pen"
  | "line"
  | "rect"
  | "ellipse"
  | "arrow"
  | "text"
  | "eraser";

export interface BaseEl {
  id: string;
}
export interface PathEl extends BaseEl {
  type: "path";
  points: [number, number][];
  stroke: string;
  strokeWidth: number;
}
export interface LineEl extends BaseEl {
  type: "line";
  x1: number; y1: number; x2: number; y2: number;
  stroke: string;
  strokeWidth: number;
}
export interface RectEl extends BaseEl {
  type: "rect";
  x: number; y: number; w: number; h: number;
  stroke: string;
  strokeWidth: number;
  fill: string; // "none" or color
}
export interface EllipseEl extends BaseEl {
  type: "ellipse";
  x: number; y: number; w: number; h: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
}
export interface ArrowEl extends BaseEl {
  type: "arrow";
  x1: number; y1: number; x2: number; y2: number;
  stroke: string;
  strokeWidth: number;
}
export interface TextEl extends BaseEl {
  type: "text";
  x: number; y: number;
  text: string;
  color: string;
  fontSize: number;
}
export interface ImageEl extends BaseEl {
  type: "image";
  x: number; y: number; w: number; h: number;
  href: string; // data URL
}

export type WhiteboardElement =
  | PathEl
  | LineEl
  | RectEl
  | EllipseEl
  | ArrowEl
  | TextEl
  | ImageEl;

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

let idCounter = 0;
export function newId(): string {
  return `el-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

export function bboxOf(el: WhiteboardElement): BBox {
  switch (el.type) {
    case "path": {
      if (el.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of el.points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case "line":
    case "arrow": {
      const minX = Math.min(el.x1, el.x2);
      const minY = Math.min(el.y1, el.y2);
      return { x: minX, y: minY, w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
    }
    case "rect":
    case "ellipse":
    case "image":
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    case "text": {
      // Approximate text metrics; refined on render via measurement is overkill
      // for hit-testing — a generous box is fine for selection.
      const w = Math.max(8, el.text.length * el.fontSize * 0.55);
      return { x: el.x, y: el.y - el.fontSize, w, h: el.fontSize * 1.3 };
    }
  }
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTest(el: WhiteboardElement, x: number, y: number, tol = 6): boolean {
  switch (el.type) {
    case "path": {
      const r = el.strokeWidth / 2 + tol;
      for (let i = 1; i < el.points.length; i++) {
        const [ax, ay] = el.points[i - 1];
        const [bx, by] = el.points[i];
        if (distToSegment(x, y, ax, ay, bx, by) <= r) return true;
      }
      // single point
      if (el.points.length === 1) {
        const [ax, ay] = el.points[0];
        return Math.hypot(x - ax, y - ay) <= r;
      }
      return false;
    }
    case "line":
    case "arrow":
      return distToSegment(x, y, el.x1, el.y1, el.x2, el.y2) <= el.strokeWidth / 2 + tol;
    case "rect": {
      const inOuter =
        x >= el.x - tol && x <= el.x + el.w + tol &&
        y >= el.y - tol && y <= el.y + el.h + tol;
      if (el.fill && el.fill !== "none") return inOuter;
      // outline only: near border
      const inInner =
        x >= el.x + tol && x <= el.x + el.w - tol &&
        y >= el.y + tol && y <= el.y + el.h - tol;
      return inOuter && !inInner;
    }
    case "ellipse": {
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      const rx = el.w / 2;
      const ry = el.h / 2;
      if (rx <= 0 || ry <= 0) return false;
      const nx = (x - cx) / (rx + tol);
      const ny = (y - cy) / (ry + tol);
      const outer = nx * nx + ny * ny <= 1;
      if (el.fill && el.fill !== "none") return outer;
      const ix = (x - cx) / Math.max(1, rx - tol);
      const iy = (y - cy) / Math.max(1, ry - tol);
      const inner = ix * ix + iy * iy <= 1;
      return outer && !inner;
    }
    case "text": {
      const b = bboxOf(el);
      return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
    }
    case "image":
      return x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h;
  }
}

export function moveEl(el: WhiteboardElement, dx: number, dy: number): WhiteboardElement {
  switch (el.type) {
    case "path":
      return { ...el, points: el.points.map(([px, py]) => [px + dx, py + dy] as [number, number]) };
    case "line":
    case "arrow":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "rect":
    case "ellipse":
    case "image":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "text":
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

/** Scale an element from its current bbox into a new bbox (used for resize). */
export function scaleElToBbox(el: WhiteboardElement, oldB: BBox, newB: BBox): WhiteboardElement {
  const sx = oldB.w > 0 ? newB.w / oldB.w : 1;
  const sy = oldB.h > 0 ? newB.h / oldB.h : 1;
  const tx = (v: number) => newB.x + (v - oldB.x) * sx;
  const ty = (v: number) => newB.y + (v - oldB.y) * sy;
  switch (el.type) {
    case "path":
      return { ...el, points: el.points.map(([px, py]) => [tx(px), ty(py)] as [number, number]) };
    case "line":
    case "arrow":
      return { ...el, x1: tx(el.x1), y1: ty(el.y1), x2: tx(el.x2), y2: ty(el.y2) };
    case "rect":
    case "ellipse":
    case "image":
      return { ...el, x: newB.x, y: newB.y, w: Math.max(2, newB.w), h: Math.max(2, newB.h) };
    case "text": {
      const fs = Math.max(6, el.fontSize * (Math.abs(sx) + Math.abs(sy)) / 2);
      return { ...el, x: tx(el.x), y: ty(el.y), fontSize: fs };
    }
  }
}

export function serialize(els: WhiteboardElement[]): string {
  return JSON.stringify(els);
}

export function deserialize(raw: string): WhiteboardElement[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WhiteboardElement[];
  } catch {
    return [];
  }
}

/** Downscale a data-URL image so pasted/dropped images don't bloat the DB. */
export function downscaleDataUrl(dataUrl: string, maxDim = 1600): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(dataUrl);
        return;
      }
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
