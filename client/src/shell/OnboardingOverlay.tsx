import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles, StickyNote, CheckSquare, Calendar, Settings as SettingsIcon,
  Palette, Plug, ArrowRight, ArrowLeft, X, Check, Lightbulb,
  Keyboard, Music, GraduationCap, Brain, Folder, Timer, Flame, PenTool, Mic, Globe,
} from "lucide-react";
import { useWindows } from "../store/windows";
import { useSettings } from "../store/settings";
import { APP_MAP } from "../apps/registry";

// ===== Onboarding step definitions =====

interface StepDef {
  id: string;
  /** Whether this step shows a centered modal (true) or a bottom panel (false). */
  centered?: boolean;
  /** Optional: open an app window when this step becomes active. */
  openApp?: { appId: string; section?: string; rect?: { x: number; y: number; width: number; height: number } };
}

const STEPS: StepDef[] = [
  { id: "welcome", centered: true },
  { id: "desktop", centered: true },
  { id: "notes", openApp: { appId: "notes", rect: { x: 80, y: 60, width: 720, height: 480 } } },
  { id: "tasks", openApp: { appId: "tasks", rect: { x: 120, y: 80, width: 760, height: 460 } } },
  { id: "athena", openApp: { appId: "athena", rect: { x: 160, y: 60, width: 680, height: 520 } } },
  { id: "calendar", openApp: { appId: "calendar", rect: { x: 100, y: 60, width: 820, height: 520 } } },
  { id: "more-apps", centered: true },
  { id: "llm-setup", openApp: { appId: "settings", section: "athena", rect: { x: 200, y: 80, width: 760, height: 560 } } },
  { id: "appearance", openApp: { appId: "settings", section: "appearance", rect: { x: 200, y: 80, width: 760, height: 560 } } },
  { id: "integrations", openApp: { appId: "settings", section: "integrations", rect: { x: 200, y: 80, width: 760, height: 560 } } },
  { id: "shortcuts", centered: true },
  { id: "complete", centered: true },
];

export default function OnboardingOverlay() {
  const [stepIdx, setStepIdx] = useState(0);
  const openWindow = useWindows((s) => s.open);
  const setHasOnboarded = useSettings((s) => s.setHasOnboarded);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  // Open app window when entering a step that has one
  useEffect(() => {
    if (step.openApp) {
      const app = APP_MAP[step.openApp.appId as keyof typeof APP_MAP];
      if (app) {
        openWindow({
          appId: app.id,
          title: app.name,
          icon: app.icon,
          payload: step.openApp.section ? { section: step.openApp.section } : undefined,
          rect: step.openApp.rect,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  const next = useCallback(() => {
    if (isLast) {
      setHasOnboarded(true);
    } else {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }
  }, [isLast, setHasOnboarded]);

  const back = useCallback(() => {
    setStepIdx((i) => Math.max(i - 1, 0));
  }, []);

  const skip = useCallback(() => {
    setHasOnboarded(true);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {step.centered ? (
        <CenteredModal
          key={step.id}
          stepId={step.id}
          stepIdx={stepIdx}
          totalSteps={STEPS.length}
          onNext={next}
          onBack={back}
          onSkip={skip}
          isLast={isLast}
        />
      ) : (
        <BottomPanel
          key={step.id}
          stepId={step.id}
          stepIdx={stepIdx}
          totalSteps={STEPS.length}
          onNext={next}
          onBack={back}
          onSkip={skip}
        />
      )}
    </AnimatePresence>
  );
}

// ===== Step content =====

function StepContent({ stepId }: { stepId: string }) {
  switch (stepId) {
    case "welcome":
      return <WelcomeStep />;
    case "desktop":
      return <DesktopStep />;
    case "notes":
      return <TourStep
        icon={<StickyNote size={20} />}
        title="Notes"
        description="A Markdown editor with live preview, full LaTeX math support, folders, tags, and auto-save. Export to Markdown or PDF. Write notes, lecture summaries, or study guides."
        tips={["Type $...$ for inline math, $$...$$ for display math", "Ctrl+S to save, auto-saves as you type", "Organize with folders and tags"]}
      />;
    case "tasks":
      return <TourStep
        icon={<CheckSquare size={20} />}
        title="Tasks"
        description="A Kanban board (To Do / In Progress / Done) with drag-and-drop, priority tags, and due dates. Athena can create tasks for you automatically."
        tips={["Drag cards between columns", "Set priorities and due dates", "Athena AI can create tasks via chat"]}
      />;
    case "athena":
      return <TourStep
        icon={<Sparkles size={20} />}
        title="Athena — Your AI Assistant"
        description="Chat with Athena to get help with your studies. It can read your notes, create tasks, run code, search the web, manage your calendar, and much more. It has access to all your apps."
        tips={["Ask Athena to summarize your notes", "It can run Python/JS code in a sandbox", "It can create tasks, events, and flashcards for you"]}
      />;
    case "calendar":
      return <TourStep
        icon={<Calendar size={20} />}
        title="Calendar"
        description="A full calendar with month/week/day views. Import ICS files, drag tasks to schedule them, and sync with Microsoft Outlook. Athena can create and manage events."
        tips={["Drag tasks onto the calendar to schedule them", "Sync with Microsoft Calendar in Settings", "Import .ics files from your university"]}
      />;
    case "more-apps":
      return <MoreAppsStep />;
    case "llm-setup":
      return <SettingsGuideStep
        icon={<Sparkles size={20} />}
        title="Connect Your AI Provider"
        section="athena"
        description="Athena needs an LLM to work. Enter your API key for OpenAI, DeepSeek, Anthropic, Groq, or any OpenAI-compatible endpoint. Without a key, Athena's chat and AI features won't be available."
        tips={[
          "Popular affordable options: Groq (fast + free tier), DeepSeek, OpenRouter",
          "Your key is encrypted (AES-256-GCM) and stored only on the server",
          "You can change or remove your key anytime in Settings \u2192 Athena Assistant",
        ]}
      />;
    case "appearance":
      return <SettingsGuideStep
        icon={<Palette size={20} />}
        title="Customize Your Desktop"
        section="appearance"
        description="Make Athena yours. Choose a light or dark theme, pick an accent color, select a wallpaper, or add an animated background (starfield, matrix rain, aurora, and more)."
        tips={["Try the 14 animated backgrounds", "Your wallpaper and theme persist across sessions", "Change these anytime in Settings"]}
      />;
    case "integrations":
      return <SettingsGuideStep
        icon={<Plug size={20} />}
        title="Connect External Services"
        section="integrations"
        description="Each user configures their own integrations independently. Connect Spotify for the Music Widget, VUT Studis for grades and timetable, Microsoft Calendar for sync, and Ntfy for push notifications."
        tips={["Spotify powers the Music Widget & Chill mode", "VUT integration also enables Moodle access", "Ntfy lets Athena send you push notifications and you can message Athena from your phone"]}
      />;
    case "shortcuts":
      return <ShortcutsStep />;
    case "complete":
      return <CompleteStep />;
    default:
      return null;
  }
}

// ===== Individual step components =====

function WelcomeStep() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <Sparkles size={32} />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-ink">Welcome to Athena</h2>
      <p className="mb-1 text-lg text-ink-muted">Student OS — your desktop for learning</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
        A desktop-environment-style productivity dashboard with notes, tasks, an AI assistant,
        calendar, flashcards, grades tracker, and more — all in your browser.
      </p>
      <p className="mt-4 text-sm text-ink-muted">
        Let's take a quick tour and set up your workspace.
      </p>
    </div>
  );
}

function DesktopStep() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <Lightbulb size={32} />
      </div>
      <h2 className="mb-3 text-xl font-bold text-ink">Your Desktop</h2>
      <div className="mx-auto max-w-md space-y-3 text-left">
        <FeatureRow icon={<Folder size={16} />} text="Double-click desktop icons to open apps" />
        <FeatureRow icon={<SettingsIcon size={16} />} text="Use the taskbar at the bottom to launch apps and check the clock" />
        <FeatureRow icon={<Keyboard size={16} />} text="Drag windows by their title bar. Snap to edges with Win+Arrow keys" />
        <FeatureRow icon={<Sparkles size={16} />} text="Press Ctrl+Space anytime for the command palette (Spotlight search)" />
      </div>
      <p className="mt-4 text-sm text-ink-muted">Now let's explore some apps...</p>
    </div>
  );
}

function TourStep({ icon, title, description, tips }: {
  icon: React.ReactNode; title: string; description: string; tips: string[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent">
          {icon}
        </div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      <p className="mb-3 text-sm text-ink-muted">{description}</p>
      <ul className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-ink-muted">
            <Check size={14} className="mt-0.5 shrink-0 text-accent" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted/70">Try it out — the window is open behind this panel.</p>
    </div>
  );
}

function MoreAppsStep() {
  const apps = [
    { icon: <Folder size={18} />, name: "Files", desc: "Virtual file system with drag-drop, ZIP, search" },
    { icon: <Brain size={18} />, name: "Flashcards", desc: "SM-2 spaced repetition with 3D flip cards" },
    { icon: <GraduationCap size={18} />, name: "Grades", desc: "GPA calculator with weighted assignments" },
    { icon: <GraduationCap size={18} />, name: "Study Hub", desc: "AI-powered flashcards, quizzes, summaries" },
    { icon: <Timer size={18} />, name: "Pomodoro", desc: "Focus timer with DND and session stats" },
    { icon: <Flame size={18} />, name: "Habits", desc: "Habit tracker with streaks and heatmap" },
    { icon: <PenTool size={18} />, name: "Whiteboard", desc: "SVG canvas with shapes, export to PNG" },
    { icon: <Mic size={18} />, name: "Voice Notes", desc: "Record + Whisper transcription → Note" },
    { icon: <Globe size={18} />, name: "Browser", desc: "In-app browser, Athena can read pages" },
    { icon: <Music size={18} />, name: "Music Widget", desc: "Spotify player with synced lyrics + Chill mode" },
  ];
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <Sparkles size={28} />
      </div>
      <h2 className="mb-1 text-xl font-bold text-ink">And Much More</h2>
      <p className="mb-4 text-sm text-ink-muted">10+ apps to power your studies. Open them anytime from the taskbar or command palette.</p>
      <div className="grid grid-cols-2 gap-2 text-left">
        {apps.map((a) => (
          <div key={a.name} className="flex items-start gap-2 rounded-lg border border-edge bg-surface-2 p-2">
            <div className="mt-0.5 text-accent">{a.icon}</div>
            <div>
              <p className="text-xs font-medium text-ink">{a.name}</p>
              <p className="text-[11px] text-ink-muted">{a.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsGuideStep({ icon, title, section, description, tips }: {
  icon: React.ReactNode; title: string; section: string; description: string; tips: string[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent">
          {icon}
        </div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      <p className="mb-3 text-sm text-ink-muted">{description}</p>
      <p className="mb-2 text-xs font-medium text-ink">The Settings window is open — configure it now or skip for later.</p>
      <ul className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-ink-muted">
            <Check size={14} className="mt-0.5 shrink-0 text-accent" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShortcutsStep() {
  const shortcuts = [
    { keys: "Ctrl+Space", desc: "Command palette (search apps, notes, tasks, calculate)" },
    { keys: "Win+Y", desc: "Toggle Athena quick panel" },
    { keys: "Ctrl+Shift+N", desc: "Quick capture — new note from anywhere" },
    { keys: "Win+← / →", desc: "Snap window to left/right half" },
    { keys: "Win+↑", desc: "Maximize window" },
    { keys: "Win+W", desc: "Close focused window" },
    { keys: "Alt+Tab", desc: "Switch between windows" },
  ];
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <Keyboard size={28} />
      </div>
      <h2 className="mb-1 text-xl font-bold text-ink">Handy Shortcuts</h2>
      <p className="mb-4 text-sm text-ink-muted">Learn these to navigate Athena like a pro.</p>
      <div className="space-y-2 text-left">
        {shortcuts.map((s) => (
          <div key={s.keys} className="flex items-center justify-between rounded-lg border border-edge bg-surface-2 px-3 py-2">
            <span className="text-xs text-ink-muted">{s.desc}</span>
            <kbd className="rounded border border-edge bg-surface-3 px-2 py-0.5 text-[11px] font-mono text-ink">{s.keys}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompleteStep() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <Check size={32} />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-ink">You're All Set!</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
        Your workspace is ready. Start exploring — open apps from the taskbar, ask Athena for help,
        or press Ctrl+Space to search.
      </p>
      <p className="mt-4 text-xs text-ink-muted/70">
        You can revisit settings anytime by opening the Settings app.
      </p>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-edge bg-surface-2 px-3 py-2">
      <span className="text-accent">{icon}</span>
      <span className="text-sm text-ink-muted">{text}</span>
    </div>
  );
}

// ===== Layout wrappers =====

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === current ? "w-6 bg-accent" : i < current ? "w-1.5 bg-accent/60" : "w-1.5 bg-surface-3"
          }`}
        />
      ))}
    </div>
  );
}

function CenteredModal({ stepId, stepIdx, totalSteps, onNext, onBack, onSkip, isLast }: {
  stepId: string; stepIdx: number; totalSteps: number;
  onNext: () => void; onBack: () => void; onSkip: () => void; isLast: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[18000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ type: "spring", duration: 0.3 }}
        className="relative w-full max-w-lg rounded-2xl border border-edge bg-surface shadow-2xl"
      >
        {/* Skip button */}
        {!isLast && (
          <button
            onClick={onSkip}
            className="absolute right-3 top-3 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
          >
            <X size={14} /> Skip
          </button>
        )}
        {/* Content */}
        <div className="p-8">
          <StepContent stepId={stepId} />
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-edge px-6 py-4">
          <ProgressBar current={stepIdx} total={totalSteps} />
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted hover:bg-surface-3"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button
              onClick={onNext}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              {isLast ? "Finish" : stepIdx === 0 ? "Start Tour" : "Next"}
              {!isLast && <ArrowRight size={14} />}
              {isLast && <Check size={14} />}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BottomPanel({ stepId, stepIdx, totalSteps, onNext, onBack, onSkip }: {
  stepId: string; stepIdx: number; totalSteps: number;
  onNext: () => void; onBack: () => void; onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", duration: 0.3 }}
      className="fixed bottom-4 left-1/2 z-[18000] w-full max-w-md -translate-x-1/2 rounded-2xl border border-edge bg-surface/95 shadow-2xl backdrop-blur-xl"
    >
      {/* Skip button */}
      <button
        onClick={onSkip}
        className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
      >
        <X size={14} /> Skip
      </button>
      {/* Content */}
      <div className="p-5 pr-12">
        <StepContent stepId={stepId} />
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between border-t border-edge px-5 py-3">
        <ProgressBar current={stepIdx} total={totalSteps} />
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg border border-edge px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-3"
          >
            <ArrowLeft size={12} /> Back
          </button>
          <button
            onClick={onNext}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
          >
            Next <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
