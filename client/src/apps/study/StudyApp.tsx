// ===== AI Study Hub app =====
// Purpose-built AI study workflows on top of the Athena LLM infrastructure.

import { useState, useEffect } from "react";
import {
  Brain,
  FileText,
  HelpCircle,
  Lightbulb,
  BookOpen,
  ListTodo,
  History,
  GraduationCap,
  Home,
} from "lucide-react";
import type { WindowInstance } from "../../store/windows";
import type { SourceDescriptor, SourceKind } from "../../services/study";
import CollapsibleSidebar from "../../wm/CollapsibleSidebar";
import GenerateFlashcards from "./GenerateFlashcards";
import Summarize from "./Summarize";
import Explain from "./Explain";
import StudyGuide from "./StudyGuide";
import SyllabusTasks from "./SyllabusTasks";
import QuizMe from "./QuizMe";
import RecentActivity from "./RecentActivity";
import StudyHome from "./StudyHome";

type Mode =
  | "home"
  | "flashcards"
  | "summarize"
  | "explain"
  | "study_guide"
  | "quiz"
  | "syllabus"
  | "recent";

const MODES: { id: Mode; label: string; icon: typeof Brain; desc: string }[] = [
  { id: "home", label: "Home", icon: Home, desc: "Overview & quick actions" },
  { id: "flashcards", label: "Flashcards", icon: Brain, desc: "Generate Q/A cards from a source" },
  { id: "summarize", label: "Summarize", icon: FileText, desc: "TL;DR, outline, or key points" },
  { id: "quiz", label: "Quiz Me", icon: HelpCircle, desc: "Test yourself with AI-graded questions" },
  { id: "explain", label: "Explain", icon: Lightbulb, desc: "Get a concept explained at any depth" },
  { id: "study_guide", label: "Study Guide", icon: BookOpen, desc: "Consolidate notes into a cheat sheet" },
  { id: "syllabus", label: "Syllabus → Tasks", icon: ListTodo, desc: "Extract tasks from a syllabus" },
  { id: "recent", label: "Recent", icon: History, desc: "Your study activity" },
];

export default function StudyApp({ win }: { win: WindowInstance }) {
  const [mode, setMode] = useState<Mode>("home");
  const [initialSource, setInitialSource] = useState<SourceDescriptor | null>(null);
  const [appendDeck, setAppendDeck] = useState<{ id: string; name: string } | null>(null);
  const [preloadedQuizId, setPreloadedQuizId] = useState<string | null>(null);

  // Honor a payload sent when opening (e.g. from Athena's open_study_hub or
  // start_quiz tool).
  useEffect(() => {
    const p = win.payload;
    if (!p) return;
    if (typeof p.mode === "string") {
      const m = MODES.find((x) => x.id === p.mode);
      if (m) setMode(m.id);
    }
    const sk = p.sourceKind as SourceKind | undefined;
    if (sk && p.sourceId && typeof p.sourceId === "string") {
      setInitialSource({ kind: sk, id: p.sourceId });
    } else if (sk === "paste" && typeof p.text === "string") {
      setInitialSource({ kind: "paste", text: p.text });
    }
    if (typeof p.appendDeckId === "string" && typeof p.appendDeckName === "string") {
      setAppendDeck({ id: p.appendDeckId, name: p.appendDeckName });
    }
    // start_quiz tool pre-generates the quiz on the server and passes the id
    // so QuizMe can jump straight into the answering phase.
    if (typeof p.quizId === "string") {
      setPreloadedQuizId(p.quizId);
    }
  }, [win.payload]);

  return (
    <div className="relative flex h-full bg-surface">
      {/* Sidebar — inline @4xl+, overlay when narrow */}
      <CollapsibleSidebar
        side="left"
        width="w-52"
        showAt="@4xl"
        panelClassName="bg-surface-2/50"
        toggleIcon={<GraduationCap size={14} />}
        toggleLabel="Menu"
      >
        <div className="flex items-center gap-2 border-b border-edge px-3 py-3">
          <GraduationCap size={16} className="text-accent" />
          <span className="text-sm font-semibold text-ink">Study Hub</span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition ${
                  active ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-3 hover:text-ink"
                }`}
              >
                <Icon size={15} className="mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium">{m.label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{m.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </CollapsibleSidebar>

      {/* Main */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-none @5xl:max-w-2xl">
          {mode === "home" && <StudyHome onPickMode={(m) => setMode(m as Mode)} />}
          {mode === "flashcards" && <GenerateFlashcards initialSource={initialSource} appendDeck={appendDeck} />}
          {mode === "summarize" && <Summarize initialSource={initialSource} />}
          {mode === "explain" && <Explain initialSource={initialSource} />}
          {mode === "study_guide" && <StudyGuide />}
          {mode === "quiz" && <QuizMe initialSource={initialSource} preloadedQuizId={preloadedQuizId} />}
          {mode === "syllabus" && <SyllabusTasks initialSource={initialSource} />}
          {mode === "recent" && <RecentActivity />}
        </div>
      </div>
    </div>
  );
}
