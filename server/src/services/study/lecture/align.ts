// ===== Lecture pipeline: transcript-to-slide alignment =====
// Maps transcript segments to slide intervals based on timestamps.

import type { TranscriptSegment } from "./transcribe";
import type { SlideKeyframe } from "./slides";

export interface AlignedSlide {
  /** Slide keyframe data. */
  slide: SlideKeyframe;
  /** Transcript segments that overlap with this slide's time interval. */
  segments: TranscriptSegment[];
  /** Combined transcript text for this slide. */
  transcriptText: string;
}

/**
 * Align transcript segments to slide keyframes.
 * Each segment is assigned to the slide whose interval [startSec, nextSlideStartSec)
 * it overlaps with. Segments before the first slide are assigned to slide 0.
 */
export function alignTranscriptToSlides(
  slides: SlideKeyframe[],
  segments: TranscriptSegment[]
): AlignedSlide[] {
  if (slides.length === 0) {
    // No slides detected — return everything as one "slide".
    return [{
      slide: { index: 0, timestampSec: 0, startSec: 0, frameCount: 0 },
      segments,
      transcriptText: segments.map((s) => s.text).join(" "),
    }];
  }

  // Build interval boundaries: each slide starts at slide.startSec and ends
  // where the next slide begins (or at infinity for the last).
  const intervals = slides.map((s, i) => ({
    slide: s,
    start: s.startSec,
    end: i + 1 < slides.length ? slides[i + 1].startSec : Infinity,
  }));

  // For each slide, collect overlapping segments.
  const aligned: AlignedSlide[] = intervals.map(({ slide }) => ({
    slide,
    segments: [],
    transcriptText: "",
  }));

  for (const seg of segments) {
    // Find the slide whose interval contains the segment's midpoint.
    const mid = (seg.start + seg.end) / 2;
    let bestIdx = 0;
    for (let i = 0; i < intervals.length; i++) {
      if (mid >= intervals[i].start && mid < intervals[i].end) {
        bestIdx = i;
        break;
      }
      // If midpoint is before all slides, assign to first.
      if (mid < intervals[0].start) {
        bestIdx = 0;
        break;
      }
    }
    aligned[bestIdx].segments.push(seg);
  }

  // Build combined text.
  for (const a of aligned) {
    a.transcriptText = a.segments.map((s) => s.text).join(" ").trim();
  }

  return aligned;
}

/** Format seconds as MM:SS or H:MM:SS. */
export function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
