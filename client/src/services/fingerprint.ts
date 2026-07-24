/**
 * Browser fingerprint utility — computes a stable hash from a set of
 * client-side signals (User-Agent, language, screen, timezone, canvas,
 * WebGL). Used to bind refresh tokens to a device so a stolen refresh
 * token can't be replayed from a different browser/environment.
 *
 * The fingerprint is NOT a security boundary on its own (it can be
 * spoofed), but it raises the bar and lets us detect token replay from
 * a different client. The result is cached in localStorage.
 */

const FP_KEY = "athena.fp";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canvasSignal(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Athena-fp-Ω≈ç√∫", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("Athena-fp-Ω≈ç√∫", 4, 17);
    return canvas.toDataURL();
  } catch {
    return "canvas-blocked";
  }
}

function webglSignal(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "no-webgl";
    const ext = gl.getExtension("debug_renderer_info");
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${vendor}~${renderer}`;
  } catch {
    return "webgl-blocked";
  }
}

let cached: string | null = null;

/** Compute (and cache) the device fingerprint hash. */
export async function getFingerprint(): Promise<string> {
  if (cached) return cached;
  const stored = localStorage.getItem(FP_KEY);
  if (stored) {
    cached = stored;
    return stored;
  }
  const signals = [
    navigator.userAgent,
    navigator.language,
    navigator.languages?.join(",") ?? "",
    String(screen.width) + "x" + String(screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? 0),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0),
    String(navigator.platform ?? ""),
    canvasSignal(),
    webglSignal(),
  ].join("||");
  const hash = await sha256Hex(signals);
  localStorage.setItem(FP_KEY, hash);
  cached = hash;
  return hash;
}
