// ===== Lecture Video → Notes API client =====

import { api } from "./api";

export interface LectureJob {
  id: string;
  videoFileId: string;
  style: string;
  detail: string;
  language: string;
  videoType: string;
  status: "queued" | "processing" | "completed" | "failed";
  stage: string;
  progress: number;
  error: string;
  noteId: string | null;
  folderId: string | null;
  slideCount: number;
  durationSec: number;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const lecturesApi = {
  /** Start processing from an existing video file. */
  start: (opts: {
    videoFileId: string;
    style?: string;
    detail?: string;
    language?: string;
    videoType?: string;
  }) => api.post<{ job: LectureJob }>("/api/study/lectures/start", opts),

  /** Upload a video and start processing. */
  upload: (
    file: File,
    opts: {
      style?: string;
      detail?: string;
      language?: string;
      videoType?: string;
      folderId?: string;
    }
  ) => {
    const form = new FormData();
    form.append("video", file);
    if (opts.style) form.append("style", opts.style);
    if (opts.detail) form.append("detail", opts.detail);
    if (opts.language) form.append("language", opts.language);
    if (opts.videoType) form.append("videoType", opts.videoType);
    if (opts.folderId) form.append("folderId", opts.folderId);
    return api.post<{ job: LectureJob; file: any }>("/api/study/lectures/upload", form);
  },

  /** Poll the status of a job. */
  status: (jobId: string) =>
    api.get<{ job: LectureJob }>(`/api/study/lectures/status/${jobId}`),

  /** List all lecture jobs. */
  list: () => api.get<{ jobs: LectureJob[] }>("/api/study/lectures"),

  /** Delete a completed/failed job record. */
  remove: (jobId: string) =>
    api.delete<{ ok: boolean }>(`/api/study/lectures/${jobId}`),

  /** Retry a failed job. */
  retry: (jobId: string) =>
    api.post<{ job: LectureJob }>(`/api/study/lectures/retry/${jobId}`),
};
