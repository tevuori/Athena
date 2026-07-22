// ===== Shared domain types (mirror server models) =====

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
}

export interface NoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string;
  folderId: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  recurring: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface VFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface VFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storageKey: string;
  folderId: string | null;
  createdAt: string;
}

export interface LyricsLine {
  time: number; // seconds
  text: string;
}

export interface LyricsResult {
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  syncedLyrics: string;
  plainLyrics: string;
  instrumental: boolean;
}

// ===== Flashcards =====

export interface FlashcardDeck {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  _count?: { cards: number };
}

export interface Flashcard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueDate: string;
  lastReviewed: string | null;
}

// ===== Grades =====

export interface Course {
  id: string;
  name: string;
  code: string;
  semester: string;
  credits: number;
  color: string;
  assignments: Assignment[];
}

export interface Assignment {
  id: string;
  courseId: string;
  name: string;
  score: number;
  maxScore: number;
  weight: number;
  category: string;
}

// ===== VUT =====

export interface VutGrade {
  courseName: string;
  courseCode: string;
  credits: string;
  semester: string;
  grade: string;
  ectsGrade: string;
  completionType: string;
  score: string;
  attempt: string;
}

export interface VutTimetableSlot {
  day: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  courseName: string;
  courseCode: string;
  room: string;
  teacher: string;
  type: string;
  weekType: string;
  date: string;
  faculty: string;
  color?: string;
}

export interface VutSubjectUpdate {
  subjectName: string;
  subjectCode: string;
  date: string;
  title: string;
  content: string;
  author: string;
}
