import type { ComponentType } from "react";
import type { AppId, WindowInstance } from "../store/windows";
import NotesApp from "./notes/NotesApp";
import TasksApp from "./tasks/TasksApp";
import FilesApp from "./files/FilesApp";
import SettingsApp from "./settings/SettingsApp";
import PomodoroApp from "./pomodoro/PomodoroApp";
import FlashcardsApp from "./flashcards/FlashcardsApp";
import GradesApp from "./grades/GradesApp";
import VUTApp from "./vut/VUTApp";
import EditorApp from "./editor/EditorApp";
import ViewerApp from "./viewer/ViewerApp";
import AthenaApp from "./athena/AthenaApp";
import StudyApp from "./study/StudyApp";
import TodayApp from "./today/TodayApp";
import CalendarApp from "./calendar/CalendarApp";
import HabitsApp from "./habits/HabitsApp";
import WhiteboardApp from "./whiteboard/WhiteboardApp";
import NtfyApp from "./ntfy/NtfyApp";
import VoiceApp from "./voice/VoiceApp";
import BrowserApp from "./browser/BrowserApp";

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
  { id: "editor", name: "Editor", icon: "Code2", component: EditorApp, pinnedToDesktop: true },
  { id: "viewer", name: "Viewer", icon: "Eye", component: ViewerApp, pinnedToDesktop: false },
  { id: "pomodoro", name: "Pomodoro", icon: "Timer", component: PomodoroApp, pinnedToDesktop: true },
  { id: "flashcards", name: "Flashcards", icon: "Brain", component: FlashcardsApp, pinnedToDesktop: true },
  { id: "grades", name: "Grades", icon: "GraduationCap", component: GradesApp, pinnedToDesktop: true },
  { id: "vut", name: "VUT", icon: "GraduationCap", component: VUTApp, pinnedToDesktop: true },
  { id: "settings", name: "Settings", icon: "Settings", component: SettingsApp, pinnedToDesktop: false },
  { id: "athena", name: "Athena", icon: "Sparkles", component: AthenaApp, pinnedToDesktop: true },
  { id: "study", name: "Study Hub", icon: "GraduationCap", component: StudyApp, pinnedToDesktop: true },
  { id: "today", name: "Today", icon: "CalendarCheck", component: TodayApp, pinnedToDesktop: true },
  { id: "calendar", name: "Calendar", icon: "Calendar", component: CalendarApp, pinnedToDesktop: true },
  { id: "habits", name: "Habits", icon: "Flame", component: HabitsApp, pinnedToDesktop: true },
  { id: "whiteboard", name: "Whiteboard", icon: "PenTool", component: WhiteboardApp, pinnedToDesktop: true },
  { id: "ntfy", name: "Ntfy", icon: "Bell", component: NtfyApp, pinnedToDesktop: false },
  { id: "voice", name: "Voice Notes", icon: "Mic", component: VoiceApp, pinnedToDesktop: true },
  { id: "browser", name: "Browser", icon: "Globe", component: BrowserApp, pinnedToDesktop: true },
];

export const APP_MAP: Record<AppId, AppDefinition> = Object.fromEntries(
  APPS.map((a) => [a.id, a])
) as Record<AppId, AppDefinition>;
