// ===== Quick Capture overlay =====
// Global Ctrl+Shift+N (Cmd+Shift+N on Mac) overlay that takes one line of
// input, sends it to /api/capture (which uses the per-user LLM to classify
// it as task / note / flashcard / athena), then dispatches the returned
// clientAction to open the relevant app. Modeled on CommandPalette.tsx.

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Zap, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useWindows, type AppId } from "../store/windows";
import { useNotifications } from "../store/notifications";
import { api } from "../services/api";

interface CaptureResponse {
  target: "task" | "note" | "flashcard" | "athena" | "study";
  created: { id: string; title?: string; deckId?: string } | null;
  clientAction: { tool: string; payload: Record<string, unknown> };
}

const TARGET_LABELS: Record<string, string> = {
  task: "Task",
  note: "Note",
  flashcard: "Flashcard",
  athena: "Athena",
  study: "Study Hub",
};

export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { open: openWindow } = useWindows();
  const pushNotification = useNotifications((s) => s.push);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === "KeyN" || e.key === "N" || e.key === "n")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setText("");
      setFeedback(null);
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const dispatch = (res: CaptureResponse) => {
    const p = res.clientAction.payload as Record<string, any>;
    const tool = res.clientAction.tool;
    if (tool === "open_app") {
      openWindow({
        appId: p.appId as AppId,
        title: p.title ?? p.appId,
        icon: "AppWindow",
        payload: p.noteId ? { noteId: p.noteId } : p.deckId ? { deckId: p.deckId } : undefined,
      });
    } else if (tool === "open_study_hub") {
      openWindow({
        appId: "study",
        title: "Study Hub",
        icon: "GraduationCap",
        payload: {
          mode: p.mode,
          sourceKind: p.sourceKind,
          text: p.text,
          sourceId: p.sourceId,
        },
      });
    } else if (tool === "open_athena") {
      // Open Athena window; the prompt is dispatched via the Athena app's
      // own client_action handler when the user is already in Athena. For
      // the quick-capture flow we open Athena and rely on the payload.
      openWindow({
        appId: "athena",
        title: "Athena",
        icon: "Sparkles",
        payload: p.prompt ? { prompt: p.prompt } : undefined,
      });
    }
  };

  const submit = async () => {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.post<CaptureResponse>("/api/capture", { text: content });
      const label = TARGET_LABELS[res.target] ?? "Item";
      const msg = res.created?.title
        ? `${label} created: ${res.created.title}`
        : `Sent to ${label}`;
      setFeedback({ ok: true, msg });
      pushNotification({
        app: "Quick Capture",
        title: label,
        body: msg,
      });
      dispatch(res);
      // Close shortly after success so the user sees the confirmation.
      setTimeout(() => setOpen(false), 700);
    } catch (e) {
      setFeedback({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          style={{ paddingTop: "20vh" }}
        >
          <motion.div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl"
            initial={{ scale: 0.96, y: -10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: -10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-edge px-3 py-2 text-accent">
              <Zap size={16} />
              <span className="text-xs font-semibold uppercase tracking-wide">Quick Capture</span>
              <span className="ml-auto text-[10px] text-ink-muted">Ctrl+Shift+N · Esc to close</span>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  disabled={busy}
                  className="flex-1 rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
                  placeholder="Type anything — a task, idea, question… Athena will route it."
                />
                <button
                  onClick={submit}
                  disabled={busy || !text.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Capture
                </button>
              </div>
              {feedback && (
                <div
                  className={`mt-2 flex items-center gap-1.5 text-xs ${
                    feedback.ok ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {feedback.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {feedback.msg}
                </div>
              )}
              <p className="mt-2 text-[11px] text-ink-muted">
                The AI classifies your input and creates a Task, Note, Flashcard, or opens Athena — then opens the result.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
