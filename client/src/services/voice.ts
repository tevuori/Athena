// ===== Voice Notes API client =====
// Saves a recorded audio blob to the backend, which transcribes it (Whisper),
// optionally cleans up the transcript (LLM), and creates a linked Note.

import { api } from "./api";
import type { Note, VFile } from "../types";

export interface VoiceNoteResult {
  file: VFile;
  note: Note;
  transcript: string;
  transcribed: boolean;
  cleaned: boolean;
}

export interface TranscribeResult {
  note: Note;
  transcript: string;
  transcribed: boolean;
  cleaned: boolean;
}

export const voiceApi = {
  /** Save a recording: audio → VFS file + transcribe + linked Note. */
  save: (
    blob: Blob,
    opts?: { title?: string; folderId?: string | null; cleanup?: boolean }
  ) => {
    const fd = new FormData();
    fd.append("audio", blob, `voice-${Date.now()}.webm`);
    if (opts?.title) fd.append("title", opts.title);
    if (opts?.folderId) fd.append("folderId", opts.folderId);
    if (opts?.cleanup === false) fd.append("cleanup", "false");
    return api.post<VoiceNoteResult>("/api/voice", fd);
  },

  /** Re-transcribe an existing audio file; updates (or creates) the linked note. */
  transcribe: (fileId: string, opts?: { cleanup?: boolean }) => {
    const qs = opts?.cleanup === false ? "?cleanup=false" : "";
    return api.post<TranscribeResult>(`/api/voice/transcribe/${fileId}${qs}`, {});
  },
};
