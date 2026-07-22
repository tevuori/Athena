import type { ComponentType } from "react";
import type { AppId, WindowInstance } from "../store/windows";
import NotesApp from "./notes/NotesApp";
import TasksApp from "./tasks/TasksApp";
import FilesApp from "./files/FilesApp";
import MusicApp from "./music/MusicApp";
import SettingsApp from "./settings/SettingsApp";
import PomodoroApp from "./pomodoro/PomodoroApp";
import FlashcardsApp from "./flashcards/FlashcardsApp";
import GradesApp from "./grades/GradesApp";
import VUTApp from "./vut/VUTApp";

export interface AppDefinition {
  id: AppId;
  name: string;
  icon: string; // lucide icon name
  component: ComponentType<{ win: WindowInstance }>;
  pinnedToDesktop?: boolean;
}

export const APPS: AppDefinition[] = [
  { id: "notes", name: "Notes", icon: "StickyNote", component: NotesApp, pinnedToDesktop: true },
  { id: "tasks", name: "Tasks", icon: "CheckSquare", component: TasksApp, pinnedToDesktop: true },
  { id: "files", name: "Files", icon: "Folder", component: FilesApp, pinnedToDesktop: true },
  { id: "music", name: "Music", icon: "Music", component: MusicApp, pinnedToDesktop: true },
  { id: "pomodoro", name: "Pomodoro", icon: "Timer", component: PomodoroApp, pinnedToDesktop: true },
  { id: "flashcards", name: "Flashcards", icon: "Brain", component: FlashcardsApp, pinnedToDesktop: true },
  { id: "grades", name: "Grades", icon: "GraduationCap", component: GradesApp, pinnedToDesktop: true },
  { id: "vut", name: "VUT", icon: "GraduationCap", component: VUTApp, pinnedToDesktop: true },
  { id: "settings", name: "Settings", icon: "Settings", component: SettingsApp, pinnedToDesktop: false },
];

export const APP_MAP: Record<AppId, AppDefinition> = Object.fromEntries(
  APPS.map((a) => [a.id, a])
) as Record<AppId, AppDefinition>;
