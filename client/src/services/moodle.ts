// ===== Moodle API client =====

import { api } from "./api";

export interface MoodleCourse {
  id: string;
  name: string;
  url: string;
  code?: string;
}

export interface MoodleActivity {
  id: string;
  name: string;
  url: string;
  modType: string;
  typeLabel: string;
  fetchable: boolean;
  dueDate?: string;
  description?: string;
}

export interface MoodleAssignment {
  id: string;
  name: string;
  url: string;
  dueDate?: string;
  description?: string;
}

export interface MoodleSyncState {
  courseId: string;
  courseName: string;
  lastSyncAt: string;
  assignmentCount: number;
  materialCount: number;
}

export interface MoodleSyncResult {
  courseId: string;
  courseName: string;
  assignments: number;
  materials: number;
  tasksCreated: number;
  eventsCreated: number;
  filesCreated: number;
  skippedNoDueDate: number;
}

export interface MoodleSection {
  name: string;
  activities: MoodleActivity[];
}

export interface MoodleCourseContents {
  courseId: string;
  courseName: string;
  sections: MoodleSection[];
}

export interface MoodleResourceContent {
  name: string;
  text: string;
  type: string;
  externalUrl?: string;
}

export const moodleApi = {
  status: () => api.get<{ configured: boolean; authenticated: boolean; username?: string }>("/api/moodle/status"),

  login: () => api.post<{ ok: boolean }>("/api/moodle/login"),

  courses: () => api.get<{ courses: MoodleCourse[] }>("/api/moodle/courses"),

  courseContents: (courseId: string) =>
    api.get<MoodleCourseContents>(`/api/moodle/courses/${courseId}/contents`),

  assignments: (courseId: string) =>
    api.get<{ courseId: string; courseName: string; assignments: MoodleAssignment[] }>(
      `/api/moodle/courses/${courseId}/assignments`
    ),

  resource: (url: string) =>
    api.post<MoodleResourceContent>("/api/moodle/resource", { url }),

  // ===== Sync (assignments → Tasks/Calendar, materials → virtual Files) =====
  syncStatus: () => api.get<{ synced: MoodleSyncState[] }>("/api/moodle/sync"),

  syncCourse: (courseId: string) =>
    api.post<MoodleSyncResult>(`/api/moodle/sync/${courseId}`),

  desyncCourse: (courseId: string) =>
    api.delete<{ removed: boolean }>(`/api/moodle/sync/${courseId}`),
};
