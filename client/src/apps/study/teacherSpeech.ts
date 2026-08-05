// ===== Teach Me speech preparation (pure, unit-tested) =====
// Turns an assistant message into:
//   - `chunks`: the strings that are actually sent to the TTS provider
//   - `segments`: sentence-level metadata (citation indices, quoted passage)
//
// Both share ONE coordinate space: every cleaned sentence is separated by a
// single space, so a sentence's charStart equals the sum of the previous
// sentences' lengths (+1 each). The TTS hook advances its char offset by
// `chunk.length + 1` per chunk, and chunks are built by joining the same
// sentences with single spaces — so word-boundary offsets coming back from the
// provider land inside the matching segment. That is what makes speech-synced
// source highlighting possible.

/** A spoken sentence plus what it refers to in the sources. */
export interface SpeechSegment {
  text: string;
  /** Inclusive char offset of the segment in the spoken text. */
  charStart: number;
  /** Exclusive char offset of the segment in the spoken text. */
  charEnd: number;
  /** Citation indices (`[2]`) found in the sentence, in order of appearance. */
  citations: number[];
  /** A verbatim passage quoted in the sentence, if any (best highlight target). */
  quote?: string;
}

export interface PreparedSpeech {
  chunks: string[];
  segments: SpeechSegment[];
}

const MAX_CHUNK_CHARS = 250;
/** Quotes shorter than this are usually a single word — a poor highlight target. */
const MIN_QUOTE_CHARS = 8;
const MAX_QUOTE_CHARS = 160;

/** Strip markdown decoration from a sentence without changing word order. */
function cleanSentence(raw: string): string {
  return raw
    // Drop citation markers whole — stripping only the brackets would make the
    // narrator read "[2]" out loud as "two".
    .replace(/\[\d{1,2}\]/g, "")
    .replace(/[#*_`~[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract `[1]`-style citation indices from a raw (uncleaned) sentence. */
export function extractCitations(raw: string): number[] {
  const out: number[] = [];
  for (const m of raw.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Extract the longest quoted passage from a raw sentence, if any. */
export function extractQuote(raw: string): string | undefined {
  const candidates: string[] = [];
  for (const m of raw.matchAll(/[""]([^""]+)[""]|"([^"]+)"/g)) {
    const q = (m[1] ?? m[2] ?? "").trim();
    if (q.length >= MIN_QUOTE_CHARS && q.length <= MAX_QUOTE_CHARS) candidates.push(q);
  }
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => b.length - a.length)[0];
}

/**
 * Prepare an assistant message for narration.
 * Code blocks are replaced by a short spoken placeholder (reading code aloud
 * is useless); citation markers are removed from the spoken text but kept as
 * segment metadata.
 */
export function prepareSpeech(text: string, maxChunkChars = MAX_CHUNK_CHARS): PreparedSpeech {
  const flat = text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/\n+/g, " ");
  const rawSentences = flat.match(/[^.!?]+[.!?]*/g) ?? [flat];

  const segments: SpeechSegment[] = [];
  const chunks: string[] = [];
  let offset = 0;
  let buf = "";

  for (const raw of rawSentences) {
    const spoken = cleanSentence(raw);
    if (!spoken) continue;
    segments.push({
      text: spoken,
      charStart: offset,
      charEnd: offset + spoken.length,
      citations: extractCitations(raw),
      quote: extractQuote(raw),
    });
    offset += spoken.length + 1;
    // Group sentences into provider-sized chunks (joined with single spaces,
    // which is exactly the separator the offsets above assume).
    if (buf && (buf.length + 1 + spoken.length) > maxChunkChars) {
      chunks.push(buf);
      buf = spoken;
    } else {
      buf = buf ? `${buf} ${spoken}` : spoken;
    }
  }
  if (buf) chunks.push(buf);
  return { chunks, segments };
}

/** Split text into the chunks that get synthesized (chunking only). */
export function splitIntoSpeechChunks(text: string, maxChunkChars = MAX_CHUNK_CHARS): string[] {
  return prepareSpeech(text, maxChunkChars).chunks;
}

/** The segment containing a char offset reported by the TTS provider. */
export function segmentAtOffset(segments: SpeechSegment[], charStart: number): SpeechSegment | null {
  for (const seg of segments) {
    if (charStart >= seg.charStart && charStart < seg.charEnd + 1) return seg;
  }
  return null;
}
