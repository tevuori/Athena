// ===== Animated backgrounds — canvas-based, self-contained =====
// Each animation runs on a single <canvas> covering the full viewport.
// All animations use requestAnimationFrame and clean up on unmount.
// When `bgId` is "none", nothing is rendered (static wallpaper shows through).

import { useEffect, useRef } from "react";
import type { AnimatedBgId } from "../store/settings";

// ===== Animation registry =====
// Each animation is a function that sets up a canvas animation loop.
// It receives the canvas 2D context, the canvas element, and a resize function.
// It returns a cleanup function called on unmount / background change.

interface AnimCtx {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

type AnimSetup = (ctx: AnimCtx) => () => void;

// ===== Helper: resize canvas to full viewport =====
function fullSize(canvas: HTMLCanvasElement): { w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return { w, h };
}

// ===== Individual animations =====

const starfield: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const stars: { x: number; y: number; z: number; size: number }[] = [];
  const NUM = 400;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    if (stars.length === 0) {
      for (let i = 0; i < NUM; i++) stars.push({
        x: Math.random() * w, y: Math.random() * h,
        z: Math.random() * 0.8 + 0.2, size: Math.random() * 1.5 + 0.3,
      });
    }
  };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(10, 10, 25, 0.15)";
    ctx.fillRect(0, 0, w, h);
    for (const s of stars) {
      s.x -= s.z * 0.5;
      if (s.x < 0) s.x = w;
      ctx.fillStyle = `rgba(255, 255, 255, ${s.z})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const particles: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const dots: { x: number; y: number; vx: number; vy: number; r: number; hue: number }[] = [];
  const NUM = 80;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    if (dots.length === 0) {
      for (let i = 0; i < NUM; i++) dots.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1, hue: Math.random() * 60 + 200,
      });
    }
  };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(10, 15, 30, 0.08)";
    ctx.fillRect(0, 0, w, h);
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > w) d.vx *= -1;
      if (d.y < 0 || d.y > h) d.vy *= -1;
      ctx.fillStyle = `hsla(${d.hue}, 70%, 60%, 0.8)`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Connect nearby dots
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.strokeStyle = `rgba(100, 150, 255, ${(1 - dist / 120) * 0.15})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const matrix: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const fontSize = 14;
  let columns = 0;
  let drops: number[] = [];
  const chars = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789ABCDEF";
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    columns = Math.floor(w / fontSize);
    drops = new Array(columns).fill(0).map(() => Math.random() * -50);
  };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#0f0";
    ctx.font = `${fontSize}px monospace`;
    for (let i = 0; i < drops.length; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(ch, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > h && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = resize;
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const auroraWaves: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  let t = 0;
  const resize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.clearRect(0, 0, w, h);
    const bands = [
      { hue: 260, amp: 80, speed: 0.6, offset: 0 },
      { hue: 200, amp: 60, speed: 0.4, offset: 100 },
      { hue: 180, amp: 70, speed: 0.8, offset: 200 },
    ];
    for (const band of bands) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `hsla(${band.hue}, 80%, 50%, 0)`);
      grad.addColorStop(0.5, `hsla(${band.hue}, 80%, 50%, 0.15)`);
      grad.addColorStop(1, `hsla(${band.hue}, 80%, 50%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 5) {
        const y = h / 2 + Math.sin((x + t * band.speed * 100 + band.offset) * 0.005) * band.amp
          + Math.sin((x + t * band.speed * 50) * 0.01) * 30;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    t += 0.01;
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = resize;
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const bubbles: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const bubbles: { x: number; y: number; r: number; vy: number; hue: number }[] = [];
  const NUM = 50;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    if (bubbles.length === 0) {
      for (let i = 0; i < NUM; i++) bubbles.push({
        x: Math.random() * w, y: Math.random() * h + h,
        r: Math.random() * 20 + 5, vy: Math.random() * 0.5 + 0.2,
        hue: Math.random() * 60 + 180,
      });
    }
  };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(5, 10, 25, 0.1)";
    ctx.fillRect(0, 0, w, h);
    for (const b of bubbles) {
      b.y -= b.vy;
      b.x += Math.sin(b.y * 0.02) * 0.3;
      if (b.y < -b.r) { b.y = h + b.r; b.x = Math.random() * w; }
      ctx.fillStyle = `hsla(${b.hue}, 60%, 50%, 0.15)`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `hsla(${b.hue}, 60%, 70%, 0.3)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const geometric: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  let t = 0;
  const resize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(15, 15, 30, 0.1)";
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const sides = 6;
    const layers = 5;
    for (let l = 0; l < layers; l++) {
      const r = 50 + l * 60 + Math.sin(t + l) * 20;
      const rot = t * (l % 2 === 0 ? 0.3 : -0.3);
      ctx.strokeStyle = `hsla(${260 + l * 20}, 70%, 60%, ${0.3 - l * 0.04})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2 + rot;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    t += 0.008;
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = resize;
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const fireflies: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const flies: { x: number; y: number; vx: number; vy: number; phase: number; r: number }[] = [];
  const NUM = 60;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    if (flies.length === 0) {
      for (let i = 0; i < NUM; i++) flies.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        phase: Math.random() * Math.PI * 2, r: Math.random() * 2 + 1,
      });
    }
  };
  resize();
  let raf = 0;
  let t = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(5, 10, 5, 0.1)";
    ctx.fillRect(0, 0, w, h);
    for (const f of flies) {
      f.x += f.vx + Math.sin(t + f.phase) * 0.2;
      f.y += f.vy + Math.cos(t + f.phase * 1.3) * 0.2;
      if (f.x < 0) f.x = w; if (f.x > w) f.x = 0;
      if (f.y < 0) f.y = h; if (f.y > h) f.y = 0;
      const glow = (Math.sin(t * 2 + f.phase) + 1) / 2;
      ctx.fillStyle = `rgba(180, 255, 100, ${glow * 0.8})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.5 + glow), 0, Math.PI * 2);
      ctx.fill();
      // Glow halo
      ctx.fillStyle = `rgba(180, 255, 100, ${glow * 0.1})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    t += 0.02;
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const rain: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const drops: { x: number; y: number; len: number; speed: number }[] = [];
  const NUM = 200;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    if (drops.length === 0) {
      for (let i = 0; i < NUM; i++) drops.push({
        x: Math.random() * w, y: Math.random() * h,
        len: Math.random() * 15 + 10, speed: Math.random() * 6 + 4,
      });
    }
  };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(10, 15, 30, 0.1)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(100, 150, 255, 0.4)";
    ctx.lineWidth = 1;
    for (const d of drops) {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + d.len);
      ctx.stroke();
      d.y += d.speed;
      if (d.y > h) { d.y = -d.len; d.x = Math.random() * w; }
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const plasma: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  let t = 0;
  // Low-res for performance
  const SCALE = 8;
  let imgData: ImageData | null = null;
  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    const lw = Math.ceil(w / SCALE), lh = Math.ceil(h / SCALE);
    offCanvas = document.createElement("canvas");
    offCanvas.width = lw; offCanvas.height = lh;
    offCtx = offCanvas.getContext("2d")!;
    imgData = offCtx.createImageData(lw, lh);
  };
  resize();
  let raf = 0;
  const loop = () => {
    if (!offCtx || !imgData || !offCanvas) { raf = requestAnimationFrame(loop); return; }
    const lw = offCanvas.width, lh = offCanvas.height;
    const data = imgData.data;
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const i = (y * lw + x) * 4;
        const v = Math.sin(x * 0.04 + t) + Math.sin(y * 0.04 + t * 1.3) +
          Math.sin((x + y) * 0.03 + t * 0.7) + Math.sin(Math.sqrt(x * x + y * y) * 0.03 + t);
        const r = Math.sin(v * Math.PI) * 127 + 128;
        const g = Math.sin(v * Math.PI + 2) * 127 + 128;
        const b = Math.sin(v * Math.PI + 4) * 127 + 128;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 60;
      }
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(offCanvas, 0, 0, w, h);
    t += 0.02;
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = resize;
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const constellation: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const stars: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
  const NUM = 120;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    if (stars.length === 0) {
      for (let i = 0; i < NUM; i++) stars.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
        r: Math.random() * 1.2 + 0.3,
      });
    }
  };
  resize();
  let raf = 0;
  let mx = -1000, my = -1000;
  const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
  window.addEventListener("mousemove", onMove);
  const loop = () => {
    ctx.fillStyle = "rgba(5, 5, 20, 0.1)";
    ctx.fillRect(0, 0, w, h);
    for (const s of stars) {
      s.x += s.vx; s.y += s.vy;
      if (s.x < 0 || s.x > w) s.vx *= -1;
      if (s.y < 0 || s.y > h) s.vy *= -1;
    }
    // Connect nearby stars
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.strokeStyle = `rgba(100, 130, 255, ${(1 - dist / 100) * 0.2})`;
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.moveTo(stars[i].x, stars[i].y);
          ctx.lineTo(stars[j].x, stars[j].y);
          ctx.stroke();
        }
      }
      // Connect to mouse
      const dxm = stars[i].x - mx, dym = stars[i].y - my;
      const dm = Math.sqrt(dxm * dxm + dym * dym);
      if (dm < 150) {
        ctx.strokeStyle = `rgba(150, 180, 255, ${(1 - dm / 150) * 0.4})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(stars[i].x, stars[i].y);
        ctx.lineTo(mx, my);
        ctx.stroke();
      }
      // Draw star
      ctx.fillStyle = "rgba(200, 220, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(stars[i].x, stars[i].y, stars[i].r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); window.removeEventListener("mousemove", onMove); };
};

const neonGrid: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  let t = 0;
  const resize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(10, 5, 20, 0.15)";
    ctx.fillRect(0, 0, w, h);
    const horizon = h * 0.5;
    const vanishX = w / 2;
    // Vertical lines converging to vanishing point
    const numV = 20;
    for (let i = -numV; i <= numV; i++) {
      const xBottom = vanishX + i * (w / numV);
      ctx.strokeStyle = `rgba(255, 0, 200, 0.3)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xBottom, h);
      ctx.lineTo(vanishX, horizon);
      ctx.stroke();
    }
    // Horizontal lines scrolling toward viewer
    const numH = 15;
    for (let i = 0; i < numH; i++) {
      const progress = ((i / numH) + t) % 1;
      const y = horizon + progress * progress * (h - horizon);
      const alpha = progress * 0.5;
      ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Sun
    const sunGrad = ctx.createRadialGradient(vanishX, horizon, 0, vanishX, horizon, 120);
    sunGrad.addColorStop(0, "rgba(255, 100, 150, 0.4)");
    sunGrad.addColorStop(1, "rgba(255, 100, 150, 0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(vanishX, horizon, 120, 0, Math.PI * 2);
    ctx.fill();
    t += 0.005;
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = resize;
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const bokeh: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const circles: { x: number; y: number; r: number; vx: number; vy: number; hue: number; alpha: number }[] = [];
  const NUM = 30;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    if (circles.length === 0) {
      for (let i = 0; i < NUM; i++) circles.push({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 60 + 20,
        vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
        hue: Math.random() * 40 + 180, alpha: Math.random() * 0.15 + 0.05,
      });
    }
  };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(10, 15, 30, 0.05)";
    ctx.fillRect(0, 0, w, h);
    for (const c of circles) {
      c.x += c.vx; c.y += c.vy;
      if (c.x < -c.r) c.x = w + c.r; if (c.x > w + c.r) c.x = -c.r;
      if (c.y < -c.r) c.y = h + c.r; if (c.y > h + c.r) c.y = -c.r;
      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      grad.addColorStop(0, `hsla(${c.hue}, 70%, 60%, ${c.alpha})`);
      grad.addColorStop(1, `hsla(${c.hue}, 70%, 60%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const snow: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  const flakes: { x: number; y: number; r: number; vy: number; sway: number; phase: number }[] = [];
  const NUM = 150;
  const resize = () => {
    const s = fullSize(canvas);
    w = s.w; h = s.h;
    if (flakes.length === 0) {
      for (let i = 0; i < NUM; i++) flakes.push({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 2.5 + 0.5, vy: Math.random() * 0.5 + 0.3,
        sway: Math.random() * 1 + 0.5, phase: Math.random() * Math.PI * 2,
      });
    }
  };
  resize();
  let raf = 0;
  let t = 0;
  const loop = () => {
    ctx.fillStyle = "rgba(15, 20, 40, 0.1)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    for (const f of flakes) {
      f.y += f.vy;
      f.x += Math.sin(t + f.phase) * f.sway * 0.3;
      if (f.y > h) { f.y = -5; f.x = Math.random() * w; }
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    t += 0.01;
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

const waves: AnimSetup = ({ ctx, canvas }) => {
  let w = 0, h = 0;
  let t = 0;
  const resize = () => { const s = fullSize(canvas); w = s.w; h = s.h; };
  resize();
  let raf = 0;
  const loop = () => {
    ctx.clearRect(0, 0, w, h);
    const layers = [
      { hue: 220, amp: 40, speed: 0.5, yOff: 0.3, alpha: 0.1 },
      { hue: 200, amp: 50, speed: 0.7, yOff: 0.5, alpha: 0.08 },
      { hue: 180, amp: 35, speed: 0.3, yOff: 0.7, alpha: 0.06 },
    ];
    for (const layer of layers) {
      ctx.fillStyle = `hsla(${layer.hue}, 70%, 50%, ${layer.alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, h);
      const baseY = h * layer.yOff;
      for (let x = 0; x <= w; x += 4) {
        const y = baseY + Math.sin((x + t * layer.speed * 100) * 0.008) * layer.amp
          + Math.sin((x + t * layer.speed * 50) * 0.02) * 15;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    t += 0.01;
    raf = requestAnimationFrame(loop);
  };
  loop();
  const onResize = resize;
  window.addEventListener("resize", onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
};

// ===== Registry =====

const ANIMATIONS: Record<Exclude<AnimatedBgId, "none">, AnimSetup> = {
  starfield,
  particles,
  matrix,
  "aurora-waves": auroraWaves,
  bubbles,
  geometric,
  fireflies,
  rain,
  plasma,
  constellation,
  "neon-grid": neonGrid,
  bokeh,
  snow,
  waves,
};

// ===== Component =====

export default function AnimatedBackground({ bgId }: { bgId: AnimatedBgId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (bgId === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setup = ANIMATIONS[bgId];
    if (!setup) return;

    const cleanup = setup({ ctx, canvas, width: 0, height: 0 });
    return cleanup;
  }, [bgId]);

  if (bgId === "none") return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ pointerEvents: "none" }}
    />
  );
}

// ===== Metadata for the picker UI =====

export interface AnimatedBgMeta {
  id: AnimatedBgId;
  name: string;
  category: string;
  tags: string[];
  description: string;
  previewColors: string[]; // for the picker thumbnail gradient
}

export const ANIMATED_BG_CATALOG: AnimatedBgMeta[] = [
  { id: "none", name: "None", category: "Basic", tags: ["static", "off", "none"], description: "Use the static gradient wallpaper instead.", previewColors: ["#1e293b", "#0f172a"] },
  { id: "starfield", name: "Starfield", category: "Space", tags: ["stars", "space", "warp", "flight", "sci-fi"], description: "Flying through a field of stars at warp speed.", previewColors: ["#0a0a1a", "#ffffff"] },
  { id: "constellation", name: "Constellation", category: "Space", tags: ["stars", "interactive", "mouse", "connect", "space"], description: "Floating stars that connect into constellations. Lines follow your mouse.", previewColors: ["#050514", "#6478ff"] },
  { id: "particles", name: "Particle Network", category: "Abstract", tags: ["particles", "network", "connect", "dots", "tech"], description: "Floating particles connected by proximity lines.", previewColors: ["#0a0f1e", "#4096ff"] },
  { id: "matrix", name: "Matrix Rain", category: "Retro", tags: ["matrix", "rain", "code", "green", "hacker", "cyberpunk"], description: "Classic falling green code characters.", previewColors: ["#000000", "#00ff00"] },
  { id: "neon-grid", name: "Neon Grid", category: "Retro", tags: ["synthwave", "retro", "80s", "grid", "sun", "vaporwave", "neon"], description: "Synthwave sunset with a scrolling neon grid.", previewColors: ["#0a0514", "#ff00aa", "#00ffff"] },
  { id: "aurora-waves", name: "Aurora Waves", category: "Nature", tags: ["aurora", "northern lights", "waves", "colorful", "sky"], description: "Gentle flowing aurora-like color waves.", previewColors: ["#0a0a2a", "#6366f1", "#06b6d4"] },
  { id: "waves", name: "Ocean Waves", category: "Nature", tags: ["ocean", "waves", "water", "blue", "calm", "sea"], description: "Layered ocean waves gently rolling.", previewColors: ["#0c4a6e", "#14b8a6"] },
  { id: "bubbles", name: "Bubbles", category: "Abstract", tags: ["bubbles", "floating", "playful", "round", "soft"], description: "Soft translucent bubbles floating upward.", previewColors: ["#050a19", "#0ea5e9"] },
  { id: "geometric", name: "Geometric Pulse", category: "Abstract", tags: ["geometric", "hexagon", "pulse", "shapes", "mandala"], description: "Concentric rotating hexagons that pulse.", previewColors: ["#0f0f1e", "#8b5cf6"] },
  { id: "fireflies", name: "Fireflies", category: "Nature", tags: ["fireflies", "glow", "green", "night", "forest", "summer"], description: "Glowing fireflies drifting in the dark.", previewColors: ["#050a05", "#b4ff64"] },
  { id: "rain", name: "Rain", category: "Weather", tags: ["rain", "drops", "blue", "weather", "melancholy"], description: "Falling rain drops against a dark sky.", previewColors: ["#0a0f1e", "#6496ff"] },
  { id: "snow", name: "Snowfall", category: "Weather", tags: ["snow", "winter", "flakes", "white", "cold", "christmas"], description: "Gentle snowflakes drifting down.", previewColors: ["#0f1428", "#ffffff"] },
  { id: "plasma", name: "Plasma", category: "Abstract", tags: ["plasma", "psychedelic", "colorful", "trippy", "lava"], description: "Psychedelic plasma color field.", previewColors: ["#ff00ff", "#00ffff", "#ffff00"] },
  { id: "bokeh", name: "Bokeh Lights", category: "Abstract", tags: ["bokeh", "lights", "soft", "blur", "dreamy", "warm"], description: "Soft out-of-focus light circles.", previewColors: ["#0a0f1e", "#06b6d4", "#8b5cf6"] },
];
