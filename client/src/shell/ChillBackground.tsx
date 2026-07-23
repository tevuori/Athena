// ===== ChillBackground — beat-reactive animated canvas background =====
// Captures system audio via getDisplayMedia (PipeWire on Fedora) and runs
// it through a Web Audio AnalyserNode for real-time beat detection.
// Renders floating color orbs, a particle field, edge glow pulses on beats,
// and mirrored frequency bars — all driven by the actual audio frequencies
// and colored from the album art's extracted palette.
//
// Design principle: all visual elements stay at the screen periphery.
// The center stays clear for lyrics + album art. Beats cause smooth
// brightness flashes (decaying over ~300ms) rather than expanding shapes.
//
// If audio capture is denied or fails, falls back to a simulated mode
// that pulses on lyric-line changes.

import { useEffect, useRef, useCallback } from "react";

export interface ChillColors {
  dominant: { r: number; g: number; b: number };
  accent: { r: number; g: number; b: number };
  secondary: { r: number; g: number; b: number };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  hue: number; // 0 = accent, 1 = secondary
}

interface Orb {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  radius: number;
  baseRadius: number;
  hue: number;
  phase: number;
  speed: number;
  brightness: number; // decays after beat
}

interface Props {
  colors: ChillColors | null;
  isPlaying: boolean;
  albumArt: string | undefined;
  /** Bumps (increments) when the active lyric line changes — used for
   *  fallback pulse when no audio stream is available. */
  lyricBeat: number;
}

export default function ChillBackground({ colors, isPlaying, albumArt, lyricBeat }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const hasAudioRef = useRef(false);

  // Keep latest props in refs for the animation loop
  const colorsRef = useRef(colors);
  const isPlayingRef = useRef(isPlaying);
  const lyricBeatRef = useRef(lyricBeat);
  const lastLyricBeatRef = useRef(0);

  useEffect(() => { colorsRef.current = colors; }, [colors]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { lyricBeatRef.current = lyricBeat; }, [lyricBeat]);

  // ===== Audio capture =====
  const startAudioCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints,
      });

      stream.getVideoTracks().forEach((t) => t.stop());

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;
      source.connect(analyser);

      freqDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      hasAudioRef.current = true;

      audioTracks[0].addEventListener("ended", () => {
        hasAudioRef.current = false;
        cleanupAudio();
      });
    } catch {
      hasAudioRef.current = false;
    }
  }, []);

  const cleanupAudio = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    freqDataRef.current = null;
  }, []);

  // ===== Animation loop =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let particles: Particle[] = [];
    let orbs: Orb[] = [];

    // Beat detection state
    let bassHistory: number[] = [];
    const BASS_HISTORY_LEN = 43;
    let lastBeatTime = 0;
    let beatCooldown = 0;
    let energySmoothed = 0;

    // Smooth beat envelope — rises to 1 on beat, decays to 0 over ~300ms
    let beatEnvelope = 0;

    // Resize handler
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize particles — soft bokeh dots
    const initParticles = () => {
      particles = [];
      const count = 50;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          size: 0,
          baseSize: 1.5 + Math.random() * 3,
          hue: Math.random(),
        });
      }
    };
    initParticles();

    // Initialize orbs — positioned toward screen edges, not center
    const initOrbs = () => {
      orbs = [];
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Place orbs around the periphery — corners + edges
      const positions = [
        { x: w * 0.1, y: h * 0.15 },   // top-left
        { x: w * 0.9, y: h * 0.2 },    // top-right
        { x: w * 0.15, y: h * 0.85 },  // bottom-left
        { x: w * 0.85, y: h * 0.8 },   // bottom-right
        { x: w * 0.5, y: h * 0.1 },    // top-center
        { x: w * 0.5, y: h * 0.92 },   // bottom-center
      ];
      for (let i = 0; i < positions.length; i++) {
        orbs.push({
          x: positions[i].x,
          y: positions[i].y,
          baseX: positions[i].x,
          baseY: positions[i].y,
          radius: 0,
          baseRadius: 150 + Math.random() * 180,
          hue: i / positions.length,
          phase: Math.random() * Math.PI * 2,
          speed: 0.0002 + Math.random() * 0.0004,
          brightness: 0,
        });
      }
    };
    initOrbs();

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const lerpColor = (c1: {r:number;g:number;b:number}, c2: {r:number;g:number;b:number}, t: number) => ({
      r: Math.round(lerp(c1.r, c2.r, t)),
      g: Math.round(lerp(c1.g, c2.g, t)),
      b: Math.round(lerp(c1.b, c2.b, t)),
    });

    const getColors = (): { dom: {r:number;g:number;b:number}; acc: {r:number;g:number;b:number}; sec: {r:number;g:number;b:number} } => {
      const c = colorsRef.current;
      if (c) return { dom: c.dominant, acc: c.accent, sec: c.secondary };
      return { dom: {r:15,g:15,b:25}, acc: {r:99,g:102,b:241}, sec: {r:168,g:85,b:247} };
    };

    const animate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const time = performance.now();

      // ===== Read audio data =====
      let bass = 0;
      let mid = 0;
      let treble = 0;
      let volume = 0;
      let beatDetected = false;

      if (hasAudioRef.current && analyserRef.current && freqDataRef.current) {
        analyserRef.current.getByteFrequencyData(freqDataRef.current as Uint8Array<ArrayBuffer>);
        const data = freqDataRef.current;
        const bins = data.length;

        const bassEnd = Math.floor(bins * 0.08);
        const midEnd = Math.floor(bins * 0.25);
        const trebleEnd = Math.floor(bins * 0.6);

        for (let i = 0; i < bassEnd; i++) bass += data[i];
        for (let i = bassEnd; i < midEnd; i++) mid += data[i];
        for (let i = midEnd; i < trebleEnd; i++) treble += data[i];

        bass /= bassEnd;
        mid /= (midEnd - bassEnd);
        treble /= (trebleEnd - midEnd);
        volume = (bass + mid + treble) / 3;

        // ===== Beat detection =====
        bassHistory.push(bass);
        if (bassHistory.length > BASS_HISTORY_LEN) bassHistory.shift();

        const avgBass = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;
        const variance = bassHistory.reduce((a, b) => a + (b - avgBass) ** 2, 0) / bassHistory.length;
        const threshold = avgBass * 1.35 + Math.sqrt(variance) * 0.5;

        beatCooldown--;
        if (
          isPlayingRef.current &&
          bass > threshold &&
          bass > 100 &&
          beatCooldown <= 0 &&
          time - lastBeatTime > 200
        ) {
          beatDetected = true;
          lastBeatTime = time;
          beatCooldown = 6;
        }

        energySmoothed = lerp(energySmoothed, volume / 255, 0.1);
      } else {
        // ===== Fallback: simulated mode =====
        if (lyricBeatRef.current !== lastLyricBeatRef.current) {
          lastLyricBeatRef.current = lyricBeatRef.current;
          if (isPlayingRef.current) {
            beatDetected = true;
            lastBeatTime = time;
          }
        }

        if (isPlayingRef.current) {
          volume = 80 + Math.sin(time * 0.002) * 20 + Math.sin(time * 0.005) * 10;
          bass = 60 + Math.sin(time * 0.003) * 30;
          energySmoothed = lerp(energySmoothed, 0.35, 0.05);
        } else {
          volume = 20;
          energySmoothed = lerp(energySmoothed, 0.1, 0.05);
        }
      }

      // ===== Update beat envelope =====
      // Rises to 1 instantly on beat, decays smoothly to 0
      if (beatDetected) {
        beatEnvelope = 1;
      } else {
        beatEnvelope *= 0.92; // ~300ms decay
      }

      // ===== Draw =====
      const { dom, acc, sec } = getColors();
      const playMul = isPlayingRef.current ? 1 : 0.3;

      // Clear with dark base — gently breathes with energy
      const breath = 0.5 + energySmoothed * 0.15;
      ctx.fillStyle = `rgb(${Math.round(dom.r * breath)}, ${Math.round(dom.g * breath)}, ${Math.round(dom.b * breath)})`;
      ctx.fillRect(0, 0, w, h);

      // ===== Orbs: floating color blobs at the periphery =====
      for (const orb of orbs) {
        orb.phase += orb.speed * (1 + energySmoothed * 2) * playMul;
        const wobble = Math.sin(orb.phase) * 50;
        const wobbleY = Math.cos(orb.phase * 0.7) * 35;
        orb.x = orb.baseX + wobble;
        orb.y = orb.baseY + wobbleY;

        // Size pulses with energy + beat envelope (smooth)
        const targetRadius = orb.baseRadius * (1 + energySmoothed * 0.4 + beatEnvelope * 0.15);
        orb.radius = lerp(orb.radius, targetRadius, 0.12);

        // Brightness flashes on beat, decays smoothly
        const targetBrightness = 0.12 + energySmoothed * 0.08 + beatEnvelope * 0.15;
        orb.brightness = lerp(orb.brightness, targetBrightness, 0.15);

        const color = orb.hue < 0.5 ? acc : sec;
        const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
        grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${orb.brightness})`);
        grad.addColorStop(0.4, `rgba(${color.r}, ${color.g}, ${color.b}, ${orb.brightness * 0.3})`);
        grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== Edge glow: soft glow from screen edges on beats =====
      // Stays at periphery, never reaches center — doesn't collide with text
      if (beatEnvelope > 0.01) {
        const edgeColor = acc;
        const edgeAlpha = beatEnvelope * 0.12;

        // Top edge
        const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.3);
        topGrad.addColorStop(0, `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, ${edgeAlpha})`);
        topGrad.addColorStop(1, `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, 0)`);
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, w, h * 0.3);

        // Bottom edge
        const botGrad = ctx.createLinearGradient(0, h, 0, h * 0.7);
        botGrad.addColorStop(0, `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, ${edgeAlpha})`);
        botGrad.addColorStop(1, `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, 0)`);
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, h * 0.7, w, h * 0.3);

        // Left edge
        const leftGrad = ctx.createLinearGradient(0, 0, w * 0.25, 0);
        leftGrad.addColorStop(0, `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, ${edgeAlpha * 0.7})`);
        leftGrad.addColorStop(1, `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, 0)`);
        ctx.fillStyle = leftGrad;
        ctx.fillRect(0, 0, w * 0.25, h);

        // Right edge
        const rightGrad = ctx.createLinearGradient(w, 0, w * 0.75, 0);
        rightGrad.addColorStop(0, `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, ${edgeAlpha * 0.7})`);
        rightGrad.addColorStop(1, `rgba(${edgeColor.r}, ${edgeColor.g}, ${edgeColor.b}, 0)`);
        ctx.fillStyle = rightGrad;
        ctx.fillRect(w * 0.75, 0, w * 0.25, h);
      }

      // ===== Particles: soft bokeh floating dots =====
      const particleSpeed = 0.3 + energySmoothed * 1.5;
      const particleSizeMul = 1 + energySmoothed * 1.2 + beatEnvelope * 0.5;
      const particleAlpha = 0.2 + energySmoothed * 0.35 + beatEnvelope * 0.15;

      for (const p of particles) {
        p.x += p.vx * particleSpeed * playMul;
        p.y += p.vy * particleSpeed * playMul;

        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        p.size = lerp(p.size, p.baseSize * particleSizeMul, 0.12);

        const color = p.hue < 0.5 ? acc : sec;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${particleAlpha})`);
        grad.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${particleAlpha * 0.3})`);
        grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== Mirrored frequency bars at the bottom =====
      // Elegant reflection style — bars grow upward from the very bottom,
      // fading as they rise. Mirrored below for a water-reflection look.
      if (hasAudioRef.current && freqDataRef.current) {
        const data = freqDataRef.current;
        const barCount = 80;
        const barWidth = w / barCount;
        const maxBarHeight = 100;
        const baseY = h - 20; // sit just above the very bottom

        for (let i = 0; i < barCount; i++) {
          const dataIdx = Math.floor((i / barCount) * (data.length * 0.5));
          const value = data[dataIdx] / 255;
          const barHeight = value * maxBarHeight;
          const color = lerpColor(acc, sec, i / barCount);

          // Upward bar (main)
          const upGrad = ctx.createLinearGradient(0, baseY - barHeight, 0, baseY);
          upGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
          upGrad.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.1 + value * 0.15})`);
          upGrad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.2 + value * 0.25})`);
          ctx.fillStyle = upGrad;
          ctx.fillRect(i * barWidth + 1, baseY - barHeight, barWidth - 2, barHeight);

          // Downward reflection (faded mirror)
          const reflectHeight = barHeight * 0.4;
          const downGrad = ctx.createLinearGradient(0, baseY, 0, baseY + reflectHeight);
          downGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.1 + value * 0.1})`);
          downGrad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
          ctx.fillStyle = downGrad;
          ctx.fillRect(i * barWidth + 1, baseY, barWidth - 2, reflectHeight);
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // ===== Start audio capture on mount =====
  useEffect(() => {
    startAudioCapture();
    return () => cleanupAudio();
  }, [startAudioCapture, cleanupAudio]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: "none" }}
    />
  );
}
