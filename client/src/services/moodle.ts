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

  resource: (url: string) =>
    api.post<MoodleResourceContent>("/api/moodle/resource", { url }),
};
