import { describe, expect, it } from "bun:test";
import {
  extractCitations,
  extractQuote,
  prepareSpeech,
  segmentAtOffset,
  splitIntoSpeechChunks,
} from "./teacherSpeech";

describe("teacherSpeech", () => {
  it("keeps chunks within the limit and aligns segment coordinates", () => {
    const prepared = prepareSpeech(
      'First concept [1]. "A quoted passage long enough." Next idea [2]. Final point.',
      35
    );
    const spoken = prepared.chunks.join(" ");

    expect(prepared.chunks.every((chunk) => chunk.length <= 35)).toBe(true);
    for (const segment of prepared.segments) {
      expect(spoken.slice(segment.charStart, segment.charEnd)).toBe(segment.text);
      expect(spoken.indexOf(segment.text, segment.charStart)).toBe(segment.charStart);
    }
  });

  it("allows one sentence longer than the chunk limit", () => {
    const prepared = prepareSpeech("This single sentence is deliberately longer than ten characters.", 10);
    expect(prepared.chunks).toHaveLength(1);
    expect(prepared.chunks[0].length).toBeGreaterThan(10);
  });

  it("extracts ordered unique citation indices and ignores invalid markers", () => {
    expect(extractCitations("See [2], then [1], [2], [0], and [123].")).toEqual([2, 1]);
  });

  it("returns the longest bounded quote and undefined when none qualifies", () => {
    expect(
      extractQuote('He said "short" and then "This is the longest quoted passage.".')
    ).toBe("This is the longest quoted passage.");
    expect(extractQuote('"tiny" and "'.padEnd(180, "x") + '"')).toBeUndefined();
  });

  it("finds the segment at an offset and returns null outside the speech", () => {
    const prepared = prepareSpeech("First sentence. Second sentence.");
    const first = prepared.segments[0];
    const second = prepared.segments[1];
    expect(segmentAtOffset(prepared.segments, first.charStart + 2)).toBe(first);
    expect(segmentAtOffset(prepared.segments, second.charStart)).toBe(second);
    expect(segmentAtOffset(prepared.segments, -1)).toBeNull();
    expect(segmentAtOffset(prepared.segments, 999)).toBeNull();
  });

  it("uses the same chunking through splitIntoSpeechChunks", () => {
    const text = "One sentence. Another sentence that is a little longer.";
    expect(splitIntoSpeechChunks(text, 25)).toEqual(prepareSpeech(text, 25).chunks);
  });
});
