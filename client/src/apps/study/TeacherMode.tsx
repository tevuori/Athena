// ===== Study Hub: Interactive Teacher ("Teach Me" mode) =====
// A live, voice-ready tutoring session. Athena teaches from the selected
// sources, opening / scrolling / highlighting passages in the existing
// Notes/Editor/Viewer/Browser apps as she speaks, and checks comprehension
// interactively.
//
// Architecture:
//  - Session CRUD + SSE streaming via services/teacher.ts (mirrors athena.ts)
//  - Server uses the teacher system prompt + ALL_TOOLS (incl. teacher tools)
//  - client_action events are dispatched HERE (not in AthenaApp) via a
//    dedicated teacher dispatcher that handles show_source / show_command /
//    focus_source / close_source / check_comprehension
//  - Source-history is tracked in local state and sent back to the server on
//    each turn so Athena can resolve "go back to the first file"

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles, Send, Square, Plus, Trash2,
  ChevronDown, GraduationCap, MessageSquare, BookOpen, Check,
  FileText, File as FileIcon, Link2, ClipboardPaste,
  Volume2, VolumeX, Mic, MicOff,
} from "lucide-react";
import {
  teacherApi,
  streamTeacherTurn,
  type TeacherSession,
  type TeacherMessage,
  type TeacherSourceHistoryEntry,
  type TeacherSessionState,
  type TeacherChatHandle,
} from "../../services/teacher";
import { studySourcesApi, type StudySource } from "../../services/study-sources";
import WorkspaceSourceSelector from "./WorkspaceSourceSelector";
import CitationMarkdown from "./CitationMarkdown";
import { ActionButton, ErrorBanner, Loading } from "./ui";
import { useWindows } from "../../store/windows";
import { useShowControl } from "../../store/showControl";
import { useTeacherTts } from "./useTeacherTts";
import { isSpeechRecognitionSupported, createTranscriber, type SpeechTranscriber } from "../../services/speech";
import type { AthenaClientAction, AthenaToolEvent, AthenaWindowState } from "../../services/athena";

const KIND_ICON: Record<string, typeof FileText> = {
  note: FileText,
  file: FileIcon,
  paste: ClipboardPaste,
  moodle: GraduationCap,
  url: Link2,
};

const APP_ICONS: Record<string, string> = {
  notes: "StickyNote", editor: "Code", viewer: "Image", browser: "Globe",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface ComprehensionCheck {
  id: string;
  question: string;
  expectedConcept?: string;
  answered: boolean;
  answer?: string;
}

interface Props {
  initialSessionId?: string | null;
  language?: "en" | "cs";
}

export default function TeacherMode({ initialSessionId, language = "en" }: Props) {
  const [sessions, setSessions] = useState<TeacherSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [session, setSession] = useState<TeacherSession | null>(null);
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [loadingSession, setLoadingSession] = useState(false);

  // Source library + selection (for creating a new session)
  const [library, setLibrary] = useState<StudySource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [showSourcePanel, setShowSourcePanel] = useState(true);
  const [studentLevel, setStudentLevel] = useState<"beginner" | "intermediate" | "advanced">("intermediate");

  // Teacher-specific state
  const [sourceHistory, setSourceHistory] = useState<TeacherSourceHistoryEntry[]>([]);
  const [comprehensionChecks, setComprehensionChecks] = useState<ComprehensionCheck[]>([]);
  const [comprehensionLog, setComprehensionLog] = useState<{ concept: string; passed: boolean }[]>([]);
  const [listOpen, setListOpen] = useState(false);

  // Voice: TTS (Athena speaks) + STT (student speaks)
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const tts = useTeacherTts();
  const transcriberRef = useRef<SpeechTranscriber | null>(null);
  const sttSupported = isSpeechRecognitionSupported();

  const openWindow = useWindows((s) => s.open);
  const closeWindow = useWindows((s) => s.close);
  const focusWindow = useWindows((s) => s.focus);
  const minimizeWindow = useWindows((s) => s.minimize);
  const windows = useWindows((s) => s.windows);
  const focusedId = useWindows((s) => s.focusedId);
  const issueShowCommand = useShowControl((s) => s.issueCommand);

  const handleRef = useRef<TeacherChatHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const streamTextRef = useRef("");
  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;

  const selectedSources = [...selectedSourceIds]
    .map((id) => library.find((s) => s.id === id))
    .filter((s): s is StudySource => s !== undefined);

  // ----- session + library loading -----

  const refreshLists = useCallback(async () => {
    const [s, lib] = await Promise.all([
      teacherApi.list().then((r) => r.sessions).catch(() => [] as TeacherSession[]),
      studySourcesApi.list().then((r) => r.sources).catch(() => [] as StudySource[]),
    ]);
    setSessions(s);
    setLibrary(lib);
  }, []);

  useEffect(() => { void refreshLists(); }, [refreshLists]);

  const loadSession = useCallback(async (id: string) => {
    setLoadingSession(true);
    setError("");
    try {
      const { session: loaded } = await teacherApi.get(id);
      setSession(loaded);
      setSessionId(loaded.id);
      setMessages(loaded.messages ?? []);
      setSourceHistory(loaded.state?.sourceHistory ?? []);
      setComprehensionLog(loaded.state?.comprehensionLog ?? []);
      const need = loaded.sourceIds.filter((sid) => !library.some((s) => s.id === sid));
      let extra: StudySource[] = [];
      if (need.length > 0) {
        const fetched = await Promise.all(need.map((sid) => studySourcesApi.get(sid).catch(() => null)));
        extra = fetched.filter((x): x is StudySource => x !== null);
      }
      setLibrary((prev) => [...prev, ...extra.filter((e) => !prev.some((p) => p.id === e.id))]);
      setSelectedSourceIds(new Set(loaded.sourceIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setLoadingSession(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library]);

  useEffect(() => {
    if (initialSessionId) void loadSession(initialSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  const startNewSession = useCallback(async () => {
    if (selectedSourceIds.size === 0) {
      setError("Select at least one source to start a Teach Me session.");
      return;
    }
    setError("");
    setLoadingSession(true);
    try {
      const { session: created } = await teacherApi.create({
        sourceIds: [...selectedSourceIds],
        studentLevel,
      });
      setSession(created);
      setSessionId(created.id);
      setMessages([]);
      setSourceHistory([]);
      setComprehensionChecks([]);
      void refreshLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setLoadingSession(false);
    }
  }, [selectedSourceIds, studentLevel, refreshLists]);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await teacherApi.delete(id);
      if (sessionId === id) {
        setSession(null);
        setSessionId(null);
        setMessages([]);
        setSourceHistory([]);
      }
      void refreshLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete session");
    }
  }, [sessionId, refreshLists]);

  // ----- teacher client_action dispatcher -----

  /** Build an AthenaWindowState[] snapshot for the server (so tools like
   *  list_open_windows work during a teacher turn). */
  const windowSnapshot = useCallback((): AthenaWindowState[] => {
    return windowsRef.current.map((w) => ({
      id: w.id,
      appId: w.appId,
      title: w.title,
      rect: w.rect,
      minimized: w.minimized,
      focused: w.id === focusedId,
    }));
  }, [focusedId]);

  /** Find an open source window by sourceRef (note/file id or url). */
  const findSourceWindow = useCallback((sourceRef: string): string | null => {
    const w = windowsRef.current.find((x) => {
      const p = x.payload as Record<string, unknown> | undefined;
      return p?.noteId === sourceRef || p?.fileId === sourceRef || p?.url === sourceRef;
    });
    return w?.id ?? null;
  }, []);

  /** Dispatch a teacher client_action (show_source, show_command, etc.). */
  const dispatchTeacherAction = useCallback((action: AthenaClientAction) => {
    const p = action.payload as Record<string, any>;
    const act = p.action as string;
    switch (act) {
      case "show_source": {
        // Open the source app, then issue a show-control command to highlight.
        const appId = p.appId as string;
        const openPayload = p.openPayload as Record<string, unknown> | undefined;
        const sourceRef = String(p.sourceRef ?? "");
        const existing = findSourceWindow(sourceRef);
        let winId = existing;
        if (!winId) {
          openWindow({
            appId: appId as any,
            title: String(p.title ?? "Source"),
            icon: APP_ICONS[appId] ?? "BookOpen",
            payload: openPayload,
          });
          // The new window id isn't known synchronously; we'll issue the
          // show command on next tick by matching the payload.
          setTimeout(() => {
            const newWinId = findSourceWindow(sourceRef);
            if (newWinId) {
              issueShowForHighlight(newWinId, p.highlight);
              // Track in source history.
              setSourceHistory((prev) => {
                if (prev.some((h) => h.windowId === newWinId)) return prev;
                return [...prev, {
                  windowId: newWinId,
                  index: prev.length + 1,
                  name: String(p.title ?? "Source"),
                  kind: String(p.sourceKind ?? ""),
                  refId: sourceRef,
                  lastHighlight: p.highlight?.text as string | undefined,
                }];
              });
            }
          }, 200);
        } else {
          focusWindow(winId);
          if (windowsRef.current.find((w) => w.id === winId)?.minimized) minimizeWindow(winId);
          issueShowForHighlight(winId, p.highlight);
          setSourceHistory((prev) =>
            prev.map((h) => h.windowId === winId ? { ...h, lastHighlight: p.highlight?.text as string | undefined } : h)
          );
        }
        break;
      }
      case "show_command": {
        const winId = String(p.windowId ?? "");
        const kind = p.kind as "scroll_to" | "highlight" | "clear_highlight";
        if (kind === "clear_highlight") {
          issueShowCommand(winId, "clear_highlight");
        } else if (kind === "highlight") {
          issueShowCommand(winId, "highlight", {
            text: p.text,
            lineStart: p.lineStart,
            lineEnd: p.lineEnd,
          });
        } else {
          issueShowCommand(winId, "scroll_to", {
            text: p.text,
            line: p.line,
          });
        }
        if (kind === "highlight" && p.text) {
          setSourceHistory((prev) =>
            prev.map((h) => h.windowId === winId ? { ...h, lastHighlight: p.text as string } : h)
          );
        }
        break;
      }
      case "focus_source": {
        focusWindow(String(p.windowId ?? ""));
        const w = windowsRef.current.find((x) => x.id === p.windowId);
        if (w?.minimized) minimizeWindow(w.id);
        break;
      }
      case "close_source": {
        closeWindow(String(p.windowId ?? ""));
        setSourceHistory((prev) => prev.filter((h) => h.windowId !== p.windowId));
        break;
      }
      case "check_comprehension": {
        const id = `comp-${Date.now()}`;
        setComprehensionChecks((prev) => [...prev, {
          id,
          question: String(p.question ?? ""),
          expectedConcept: p.expectedConcept,
          answered: false,
        }]);
        break;
      }
      default:
        // Other client_actions (open_app, etc.) — pass through to a basic
        // open handler so non-teacher tools still work.
        if (act === "open_app" && p.appId) {
          openWindow({
            appId: p.appId as any,
            title: String(p.title ?? p.appId),
            icon: APP_ICONS[p.appId] ?? "AppWindow",
            payload: p.noteId ? { noteId: p.noteId } : p.fileId ? { fileId: p.fileId } : p.url ? { url: p.url } : undefined,
          });
        }
        break;
    }
  }, [openWindow, closeWindow, focusWindow, minimizeWindow, findSourceWindow, issueShowCommand]);

  /** Issue a show-control highlight/scroll command from a show_source highlight payload. */
  function issueShowForHighlight(winId: string, highlight: any) {
    if (!highlight) {
      issueShowCommand(winId, "scroll_to");
      return;
    }
    if (highlight.text) {
      issueShowCommand(winId, "highlight", { text: highlight.text });
    } else if (typeof highlight.line === "number") {
      issueShowCommand(winId, "highlight", {
        lineStart: highlight.line,
        lineEnd: typeof highlight.lineEnd === "number" ? highlight.lineEnd : highlight.line,
      });
    } else {
      issueShowCommand(winId, "scroll_to");
    }
  }

  // ----- streaming a teacher turn -----

  const send = useCallback((text: string) => {
    if (!sessionId || !text.trim() || streaming) return;
    setError("");
    setInput("");
    setStreaming(true);
    setStreamText("");
    streamTextRef.current = "";
    setComprehensionChecks([]);

    const userMsg: TeacherMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    const state: TeacherSessionState = {
      studentLevel,
      sourceHistory,
      coveredConcepts: [],
      comprehensionLog,
    };

    handleRef.current = streamTeacherTurn(
      sessionId,
      text,
      {
        onContent: (t) => {
          streamTextRef.current += t;
          setStreamText((prev) => prev + t);
        },
        onTool: (ev: AthenaToolEvent) => { /* could render tool chips */ },
        onClientAction: (action) => dispatchTeacherAction(action),
        onError: (msg) => { setError(msg); setStreaming(false); },
        onDone: () => {
          setStreaming(false);
          const finalText = streamTextRef.current;
          setStreamText("");
          // Reload session to pick up persisted assistant message.
          void loadSession(sessionId);
          // Auto-speak the assistant's response if enabled.
          if (autoSpeak && finalText.trim()) {
            void tts.speak(finalText);
          }
        },
      },
      { windows: windowSnapshot(), sourceHistory, state, language }
    );
  }, [sessionId, streaming, studentLevel, sourceHistory, language, dispatchTeacherAction, windowSnapshot, loadSession, autoSpeak, tts, comprehensionLog]);

  const stop = useCallback(() => {
    handleRef.current?.abort();
    setStreaming(false);
  }, []);

  // ----- STT (student voice input) -----

  const startListening = useCallback(() => {
    if (!sttSupported || listening) return;
    try {
      const transcriber = createTranscriber();
      transcriberRef.current = transcriber;
      let finalText = "";
      transcriber.onUpdate(({ interim, final: fin }) => {
        if (fin) finalText += fin;
        setInterimText(interim);
      });
      transcriber.onEnd(() => {
        setListening(false);
        setInterimText("");
        if (finalText.trim()) send(finalText.trim());
      });
      transcriber.onError(() => {
        setListening(false);
        setInterimText("");
      });
      transcriber.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [sttSupported, listening, send]);

  const stopListening = useCallback(() => {
    transcriberRef.current?.stop();
    setListening(false);
  }, []);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  // ----- comprehension check handlers -----

  const answerComprehension = useCallback((id: string, answer: string) => {
    setComprehensionChecks((prev) => prev.map((c) => c.id === id ? { ...c, answered: true, answer } : c));
    // Log the comprehension check outcome (the teacher will assess quality
    // in the next turn and can adjust its teaching accordingly).
    const check = comprehensionChecks.find((c) => c.id === id);
    if (check?.expectedConcept) {
      setComprehensionLog((prev) => [...prev, { concept: check.expectedConcept!, passed: true }]);
    }
    // Feed the answer back as a user message.
    if (answer.trim()) send(answer.trim());
  }, [send, comprehensionChecks]);

  // ----- citation open handler -----

  const openCitation = useCallback((index: number) => {
    const entry = sourceHistory.find((h) => h.index === index);
    if (entry) {
      focusWindow(entry.windowId);
      const w = windowsRef.current.find((x) => x.id === entry.windowId);
      if (w?.minimized) minimizeWindow(w.id);
    }
  }, [sourceHistory, focusWindow, minimizeWindow]);

  const citationMeta = sourceHistory.map((h) => ({ index: h.index, name: h.name, kind: h.kind, refId: h.refId }));

  // ----- render -----

  if (loadingSession && !session) {
    return <div className="flex h-full items-center justify-center"><Loading label="Loading session…" /></div>;
  }

  return (
    <div className="flex h-full gap-3">
      {/* Session list — inline @4xl+ */}
      <div className="hidden w-56 shrink-0 flex-col @4xl:flex">
        <div className="flex items-center justify-between border-b border-edge px-1 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sessions</span>
          <button
            onClick={() => { setSession(null); setSessionId(null); setMessages([]); setSourceHistory([]); setShowSourcePanel(true); }}
            className="flex items-center gap-1 rounded-md border border-edge px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-surface-2 hover:text-ink"
            title="New session"
          >
            <Plus size={10} /> New
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-ink-muted">No sessions yet.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition ${
                  sessionId === s.id ? "border-accent/40 bg-accent/10" : "border-transparent hover:bg-surface-2"
                }`}
              >
                <button onClick={() => void loadSession(s.id)} className="flex flex-1 flex-col items-start text-left">
                  <span className="truncate text-ink">{s.title}</span>
                  <span className="text-[10px] text-ink-muted">{s.sourceIds.length} src · {timeAgo(s.updatedAt)}</span>
                </button>
                <button
                  onClick={() => void deleteSession(s.id)}
                  className="shrink-0 rounded p-0.5 text-ink-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  title="Delete session"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Mobile session list dropdown */}
        <div className="flex items-center gap-2 @4xl:hidden">
          <div className="relative flex-1">
            <button
              onClick={() => setListOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-md border border-edge bg-surface-2 px-3 py-2 text-xs text-ink hover:bg-surface-3"
            >
              <span className="flex items-center gap-2 truncate">
                <MessageSquare size={13} className="shrink-0 text-accent" />
                <span className="truncate">{session?.title ?? "Start a Teach Me session"}</span>
              </span>
              <ChevronDown size={13} className="shrink-0 text-ink-muted" />
            </button>
            {listOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-edge bg-surface py-1 shadow-window">
                <button
                  onClick={() => { setListOpen(false); setSession(null); setSessionId(null); setMessages([]); setSourceHistory([]); setShowSourcePanel(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-accent hover:bg-surface-2"
                >
                  <Plus size={13} /> New session
                </button>
                {sessions.map((s) => (
                  <div key={s.id} className={`group flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-2 ${sessionId === s.id ? "bg-surface-2" : ""}`}>
                    <button onClick={() => { setListOpen(false); void loadSession(s.id); }} className="flex flex-1 flex-col items-start text-left">
                      <span className="truncate text-ink">{s.title}</span>
                      <span className="text-[10px] text-ink-muted">{s.sourceIds.length} src · {timeAgo(s.updatedAt)}</span>
                    </button>
                    <button onClick={() => void deleteSession(s.id)} className="shrink-0 rounded p-0.5 text-ink-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Source selection (only when no active session) */}
        {!session && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowSourcePanel((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted hover:text-ink"
              >
                <ChevronDown size={12} className={`transition ${showSourcePanel ? "" : "-rotate-90"}`} />
                Sources {selectedSourceIds.size > 0 && `(${selectedSourceIds.size})`}
              </button>
            </div>
            {showSourcePanel && (
              <WorkspaceSourceSelector
                selectedIds={selectedSourceIds}
                onToggle={(id) => setSelectedSourceIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
                disabled={false}
                onSourceAdded={(s) => setLibrary((prev) => [s, ...prev.filter((x) => x.id !== s.id)])}
              />
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">Level:</span>
              {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setStudentLevel(lvl)}
                  className={`rounded-md px-2 py-1 text-[11px] capitalize transition ${
                    studentLevel === lvl ? "bg-accent/15 text-accent" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {lvl}
                </button>
              ))}
              <ActionButton onClick={() => void startNewSession()} variant="primary">
                <Sparkles size={13} /> Start Teaching
              </ActionButton>
            </div>
          </div>
        )}

        {error && <ErrorBanner message={error} />}

        {/* Messages */}
        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {messages.length === 0 && !streamText && session && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-ink-muted">
              <GraduationCap size={40} className="opacity-30" />
              <p className="text-sm">Ask Athena to teach you something from your sources.</p>
              <p className="text-xs">e.g. "Teach me about gradient descent" or "Explain the first chapter"</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`group max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-accent/15 text-ink"
                  : "bg-surface-2 text-ink"
              }`}>
                {m.role === "assistant" ? (
                  <>
                    <CitationMarkdown
                      content={m.content}
                      citations={citationMeta}
                      onOpenCitation={openCitation}
                    />
                    {tts.supported && (
                      <button
                        onClick={() => void tts.speak(m.content)}
                        className="mt-1 flex items-center gap-1 text-[10px] text-ink-muted opacity-0 transition hover:text-accent group-hover:opacity-100"
                        title="Read aloud"
                      >
                        <Volume2 size={11} /> Read aloud
                      </button>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))}
          {streamText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <CitationMarkdown
                  content={streamText}
                  citations={citationMeta}
                  onOpenCitation={openCitation}
                />
                <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-accent align-middle" />
              </div>
            </div>
          )}

          {/* Comprehension check chips */}
          {comprehensionChecks.filter((c) => !c.answered).map((c) => (
            <ComprehensionChip key={c.id} check={c} onAnswer={(ans) => answerComprehension(c.id, ans)} />
          ))}
        </div>

        {/* Input */}
        <div className="flex flex-col gap-2 border-t border-edge pt-2">
          {/* Voice controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoSpeak((v) => !v)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition ${
                autoSpeak ? "bg-accent/15 text-accent" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
              title={autoSpeak ? "Auto-speak on (Athena will read her replies aloud)" : "Auto-speak off"}
            >
              {autoSpeak ? <Volume2 size={12} /> : <VolumeX size={12} />}
              Auto-speak ({tts.provider === "elevenlabs" ? "ElevenLabs" : tts.provider === "webspeech" ? "Web Speech" : "off"})
            </button>
            {tts.playing && (
              <button onClick={tts.stop} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink">
                <Square size={11} /> Stop voice
              </button>
            )}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={listening ? interimText || "Listening…" : input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={session ? "Ask Athena to teach you…" : "Select sources and start a session first"}
              disabled={!session || streaming || listening}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent/50 disabled:opacity-50"
            />
            {sttSupported && session && (
              <button
                onClick={listening ? stopListening : startListening}
                disabled={streaming}
                className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition disabled:opacity-40 ${
                  listening ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "border border-edge text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
                title={listening ? "Stop listening" : "Speak your question"}
              >
                {listening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            )}
            {streaming ? (
              <button onClick={stop} className="flex items-center gap-1 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-400 hover:bg-red-500/30">
                <Square size={14} /> Stop
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                disabled={!session || !input.trim()}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-40"
              >
                <Send size={14} /> Send
              </button>
            )}
          </div>
        </div>

        {/* Active source-history indicator */}
        {sourceHistory.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-ink-muted">Open sources:</span>
            {sourceHistory.map((h) => {
              const Icon = KIND_ICON[h.kind] ?? FileText;
              return (
                <button
                  key={h.windowId}
                  onClick={() => openCitation(h.index)}
                  className="flex items-center gap-1 rounded-md border border-edge bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-surface-3 hover:text-ink"
                  title={`Focus ${h.name}`}
                >
                  <Icon size={10} /> {h.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Comprehension check chip -----

function ComprehensionChip({
  check,
  onAnswer,
}: {
  check: ComprehensionCheck;
  onAnswer: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-accent">
          <BookOpen size={13} /> Comprehension Check
        </div>
        <p className="mb-2 text-ink">{check.question}</p>
        <div className="flex items-end gap-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (answer.trim()) onAnswer(answer.trim());
              }
            }}
            placeholder="Your answer…"
            rows={1}
            className="flex-1 resize-none rounded-md border border-edge bg-surface px-2 py-1.5 text-xs text-ink outline-none placeholder:text-ink-muted focus:border-accent/50"
          />
          <button
            onClick={() => answer.trim() && onAnswer(answer.trim())}
            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1.5 text-xs text-white hover:bg-accent/90"
          >
            <Check size={12} /> Answer
          </button>
        </div>
      </div>
    </div>
  );
}
