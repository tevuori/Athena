// ===== Lecture pipeline: slide deduplication via dHash =====
// Reads the tiny 9×8 grayscale PGM frames output by ffmpeg, computes a
// difference hash (dHash), groups consecutive frames with matching hashes
// (within a Hamming distance threshold), and returns the timestamp of the
// last frame in each stable group — yielding deduplicated "slide change"
// keyframes.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface SlideKeyframe {
  /** 0-based index of this slide. */
  index: number;
  /** Timestamp (seconds) of the last frame in this stable group — the most
   *  complete version of the slide (captures bullet builds). */
  timestampSec: number;
  /** Timestamp of the first frame in the group (slide appeared). */
  startSec: number;
  /** How many consecutive frames this slide was stable for. */
  frameCount: number;
}

/** Parse a PGM (P5 binary) file into an array of pixel values. */
function parsePgm(buf: Buffer): Uint8Array {
  // P5 format: "P5\n<width> <height>\n<maxval>\n<binary pixels>"
  let offset = 0;
  // Skip "P5\n"
  while (offset < buf.length && buf[offset] !== 0x0a) offset++;
  offset++; // skip first \n
  // Skip comments
  while (offset < buf.length && buf[offset] === 0x23) {
    while (offset < buf.length && buf[offset] !== 0x0a) offset++;
    offset++;
  }
  // Read width height
  let numStr = "";
  while (offset < buf.length && buf[offset] !== 0x0a) {
    numStr += String.fromCharCode(buf[offset]);
    offset++;
  }
  offset++; // skip \n
  // Read maxval
  let maxStr = "";
  while (offset < buf.length && buf[offset] !== 0x0a) {
    maxStr += String.fromCharCode(buf[offset]);
    offset++;
  }
  offset++; // skip \n
  // Remaining bytes are the pixel data.
  return new Uint8Array(buf.buffer, buf.byteOffset + offset, buf.length - offset);
}

/**
 * Compute a 64-bit difference hash (dHash) for a 9×8 grayscale image.
 * Each bit is 1 if the pixel to the right is brighter than the current pixel.
 * Returns the hash as a BigInt.
 */
function dHash(pixels: Uint8Array): bigint {
  // pixels is 9 columns × 8 rows = 72 bytes, row-major.
  let hash = 0n;
  let bit = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col;
      if (pixels[idx] < pixels[idx + 1]) {
        hash |= 1n << BigInt(bit);
      }
      bit++;
    }
  }
  return hash;
}

/** Hamming distance between two 64-bit hashes. */
function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/**
 * Read all PGM frames from a directory, compute dHashes, and group into
 * stable runs. Returns deduplicated slide keyframes.
 *
 * @param framesDir Directory containing frame_NNNNNN.pgm files.
 * @param sampleFps The fps at which frames were sampled (for timestamp calc).
 * @param threshold Hamming distance threshold (default 10 for screen capture;
 *                  use ~16 for camera footage with more visual noise).
 * @param minFrames Minimum consecutive frames to count as a "slide" (default 2;
 *                  filters out brief transitions).
 */
export async function deduplicateSlides(
  framesDir: string,
  sampleFps: number,
  threshold = 10,
  minFrames = 2
): Promise<SlideKeyframe[]> {
  const files = (await readdir(framesDir))
    .filter((f) => f.endsWith(".pgm"))
    .sort(); // lexicographic = chronological (frame_000001, ...)

  if (files.length === 0) return [];

  // Compute hashes for all frames.
  const hashes: bigint[] = [];
  for (const file of files) {
    const buf = await readFile(path.join(framesDir, file));
    const pixels = parsePgm(buf);
    hashes.push(dHash(pixels));
  }

  // Group consecutive frames with similar hashes.
  const groups: { startIdx: number; endIdx: number }[] = [];
  let groupStart = 0;

  for (let i = 1; i < hashes.length; i++) {
    const dist = hammingDistance(hashes[i], hashes[groupStart]);
    if (dist > threshold) {
      groups.push({ startIdx: groupStart, endIdx: i - 1 });
      groupStart = i;
    }
  }
  // Close the last group.
  groups.push({ startIdx: groupStart, endIdx: hashes.length - 1 });

  // Filter out brief transitions and build keyframes.
  const keyframes: SlideKeyframe[] = [];
  let slideIdx = 0;
  for (const g of groups) {
    const frameCount = g.endIdx - g.startIdx + 1;
    if (frameCount < minFrames) continue;
    keyframes.push({
      index: slideIdx,
      // Last frame of the group = most complete slide.
      timestampSec: g.endIdx / sampleFps,
      startSec: g.startIdx / sampleFps,
      frameCount,
    });
    slideIdx++;
  }

  // Cap at 120 slides to bound cost.
  if (keyframes.length > 120) {
    return keyframes.slice(0, 120);
  }

  return keyframes;
}
