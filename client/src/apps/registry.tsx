import { lazy, type ComponentType } from "react";
import type { AppId, WindowInstance } from "../store/windows";

// All app components are lazy-loaded via React.lazy() so they split into
// separate chunks. The app metadata (id, name, icon) is eager so the taskbar,
// start menu, and desktop icons render instantly — only the app *content*
// loads on demand when a window is opened.
const NotesApp = lazy(() => import("./notes/NotesApp"));
const TasksApp = lazy(() => import("./tasks/TasksApp"));
const FilesApp = lazy(() => import("./files/FilesApp"));
const SettingsApp = lazy(() => import("./settings/SettingsApp"));
const PomodoroApp = lazy(() => import("./pomodoro/PomodoroApp"));
const FlashcardsApp = lazy(() => import("./flashcards/FlashcardsApp"));
const GradesApp = lazy(() => import("./grades/GradesApp"));
const VUTApp = lazy(() => import("./vut/VUTApp"));
const EditorApp = lazy(() => import("./editor/EditorApp"));
const ViewerApp = lazy(() => import("./viewer/ViewerApp"));
const AthenaApp = lazy(() => import("./athena/AthenaApp"));
const StudyApp = lazy(() => import("./study/StudyApp"));
const TodayApp = lazy(() => import("./today/TodayApp"));
const CalendarApp = lazy(() => import("./calendar/CalendarApp"));
const HabitsApp = lazy(() => import("./habits/HabitsApp"));
const WhiteboardApp = lazy(() => import("./whiteboard/WhiteboardApp"));
const NtfyApp = lazy(() => import("./ntfy/NtfyApp"));
const VoiceApp = lazy(() => import("./voice/VoiceApp"));
const BrowserApp = lazy(() => import("./browser/BrowserApp"));
const RemindersApp = lazy(() => import("./reminders/RemindersApp"));
const AnalyticsApp = lazy(() => import("./analytics/AnalyticsApp"));
const MoodleApp = lazy(() => import("./moodle/MoodleApp"));
const MapsApp = lazy(() => import("./maps/MapsApp"));

export interface AppDefinition {
  id: AppId;
  name: string;
  icon: string; // lucide icon name
  component: ComponentType<{ win: WindowInstance }>;
  pinnedToDesktop?: boolean;
  /** On mobile, render the app full-bleed without the standard MobileAppFrame
   *  header (the app provides its own chrome). Used by Viewer, Whiteboard. */
  fullscreenOnMobile?: boolean;
  /** Hide from the mobile app drawer (e.g. internal/secondary apps opened
   *  only via deep links). */
  hideOnMobile?: boolean;
}

export const APPS: AppDefinition[] = [
  { id: "notes", name: "Notes", icon: "StickyNote", component: NotesApp, pinnedToDesktop: true },
  { id: "tasks", name: "Tasks", icon: "CheckSquare", component: TasksApp, pinnedToDesktop: true },
  { id: "files", name: "Files", icon: "Folder", component: FilesApp, pinnedToDesktop: true },
  { id: "editor", name: "Editor", icon: "Code2", component: EditorApp, pinnedToDesktop: true, hideOnMobile: true },
  { id: "viewer", name: "Viewer", icon: "Eye", component: ViewerApp, pinnedToDesktop: false, fullscreenOnMobile: true, hideOnMobile: true },
  { id: "pomodoro", name: "Pomodoro", icon: "Timer", component: PomodoroApp, pinnedToDesktop: true },
  { id: "flashcards", name: "Flashcards", icon: "Brain", component: FlashcardsApp, pinnedToDesktop: true },
  { id: "grades", name: "Grades", icon: "GraduationCap", component: GradesApp, pinnedToDesktop: true },
  { id: "vut", name: "VUT", icon: "GraduationCap", component: VUTApp, pinnedToDesktop: true },
  { id: "settings", name: "Settings", icon: "Settings", component: SettingsApp, pinnedToDesktop: false },
  { id: "athena", name: "Mavino", icon: "Sparkles", component: AthenaApp, pinnedToDesktop: true },
  { id: "study", name: "Study Hub", icon: "GraduationCap", component: StudyApp, pinnedToDesktop: true },
  { id: "today", name: "Today", icon: "CalendarCheck", component: TodayApp, pinnedToDesktop: true },
  { id: "calendar", name: "Calendar", icon: "Calendar", component: CalendarApp, pinnedToDesktop: true },
  { id: "habits", name: "Habits", icon: "Flame", component: HabitsApp, pinnedToDesktop: true },
  { id: "whiteboard", name: "Whiteboard", icon: "PenTool", component: WhiteboardApp, pinnedToDesktop: true, fullscreenOnMobile: true },
  { id: "ntfy", name: "Ntfy", icon: "Bell", component: NtfyApp, pinnedToDesktop: false },
  { id: "voice", name: "Voice Notes", icon: "Mic", component: VoiceApp, pinnedToDesktop: true },
  { id: "browser", name: "Browser", icon: "Globe", component: BrowserApp, pinnedToDesktop: true },
  { id: "reminders", name: "Reminders", icon: "BellRing", component: RemindersApp, pinnedToDesktop: false },
  { id: "analytics", name: "Analytics", icon: "BarChart3", component: AnalyticsApp, pinnedToDesktop: true },
  { id: "moodle", name: "Moodle", icon: "GraduationCap", component: MoodleApp, pinnedToDesktop: true },
  { id: "maps", name: "Maps", icon: "Map", component: MapsApp, pinnedToDesktop: true },
];

export const APP_MAP: Record<AppId, AppDefinition> = Object.fromEntries(
  APPS.map((a) => [a.id, a])
) as Record<AppId, AppDefinition>;
