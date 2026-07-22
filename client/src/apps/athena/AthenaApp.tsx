import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square, Sparkles, Loader2, Wrench, AlertCircle, Save, FolderOpen, LayoutGrid } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  streamAthenaChat,
  type AthenaMessage,
  type AthenaToolEvent,
  type AthenaClientAction,
  type AthenaWindowState,
} from "../../services/athena";
import { useWindows, type AppId, type WindowRect } from "../../store/windows";
import type { WindowInstance } from "../../store/windows";

interface ChatTurn extends AthenaMessage {
  tools?: AthenaToolEvent[];
  pending?: boolean;
  error?: string;
}

const SUGGESTIONS = [
  "Create a task: review lecture notes, due Friday",
  "What are my most recent files?",
  "Start a pomodoro focus session",
  "List my courses and grades",
  "Open notes and tasks side by side",
  "Save my current workspace as 'Study Mode'",
];

// AppId → icon name (must match registry icons)
const APP_ICONS: Record<string, string> = {
  notes: "StickyNote",
  tasks: "CheckSquare",
  files: "Folder",
  music: "Music",
  settings: "Settings",
  terminal: "Terminal",
  pomodoro: "Timer",
  flashcards: "Brain",
  grades: "GraduationCap",
  vut: "GraduationCap",
  editor: "Code",
  viewer: "Image",
  athena: "Sparkles",
};

export default function AthenaApp({ win }: { win: WindowInstance }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const handleRef = useRef<{ abort: () => void; done: Promise<void> } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const windows = useWindows((s) => s.windows);
  const focusedId = useWindows((s) => s.focusedId);
  const openWindow = useWindows((s) => s.open);
  const closeWindow = useWindows((s) => s.close);
  const focusWindow = useWindows((s) => s.focus);
  const minimizeWindow = useWindows((s) => s.minimize);
  const setRect = useWindows((s) => s.setRect);
  const closeAll = useWindows((s) => s.closeAll);

  // Build the window state snapshot to send with each chat request.
  const buildWindowState = useCallback((): AthenaWindowState[] => {
    return windows.map((w) => ({
      id: w.id,
      appId: w.appId,
      title: w.title,
      rect: { x: w.rect.x, y: w.rect.y, width: w.rect.width, height: w.rect.height },
      minimized: w.minimized,
      focused: focusedId === w.id,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows, focusedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    return () => handleRef.current?.abort();
  }, []);

  // ===== Client-action dispatcher =====
  // Handles all client_action SSE events from the server (window mgmt,
  // pomodoro, workspace restore).
  const dispatchClientAction = useCallback(
    (action: AthenaClientAction) => {
      const p = action.payload as Record<string, any>;
      switch (action.tool) {
        case "start_pomodoro": {
          openWindow({
            appId: "pomodoro",
            title: "Pomodoro",
            icon: "Timer",
            payload: {
              autoStart: true,
              phase: p.phase ?? "work",
              durationMinutes: p.durationMinutes ?? null,
            },
          });
          break;
        }
        case "open_app": {
          openWindow({
            appId: p.appId as AppId,
            title: p.title ?? p.appId,
            icon: APP_ICONS[p.appId] ?? "AppWindow",
            rect: p.rect as Partial<WindowRect> | undefined,
          });
          break;
        }
        case "close_window": {
          closeWindow(p.windowId);
          break;
        }
        case "focus_window": {
          focusWindow(p.windowId);
          break;
        }
        case "minimize_window": {
          minimizeWindow(p.windowId);
          break;
        }
        case "resize_window": {
          const w = windows.find((x) => x.id === p.windowId);
          if (w) setRect(p.windowId, { ...w.rect, width: p.width, height: p.height });
          break;
        }
        case "move_window": {
          const w = windows.find((x) => x.id === p.windowId);
          if (w) setRect(p.windowId, { ...w.rect, x: p.x, y: p.y });
          break;
        }
        case "tile_windows": {
          tileWindows(windows, setRect, p.layout ?? "grid");
          break;
        }
        case "open_workspace": {
          // Close all current windows, then reopen at saved positions.
          closeAll();
          const savedWindows = (p.windows as Array<{
            appId: string;
            title: string;
            rect: WindowRect;
          }>) ?? [];
          for (const sw of savedWindows) {
            openWindow({
              appId: sw.appId as AppId,
              title: sw.title,
              icon: APP_ICONS[sw.appId] ?? "AppWindow",
              rect: sw.rect,
            });
          }
          break;
        }
      }
    },
    [openWindow, closeWindow, focusWindow, minimizeWindow, setRect, windows, closeAll]
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || streaming) return;

      const history: AthenaMessage[] = [
        ...turns
          .filter((t) => !t.error && t.content.trim())
          .map((t) => ({ role: t.role, content: t.content })),
        { role: "user", content },
      ];

      const userTurn: ChatTurn = { role: "user", content };
      const assistantTurn: ChatTurn = {
        role: "assistant",
        content: "",
        tools: [],
        pending: true,
      };
      setTurns((prev) => [...prev, userTurn, assistantTurn]);
      setInput("");
      setStreaming(true);

      const winState = buildWindowState();

      handleRef.current = streamAthenaChat(
        history,
        {
          onContent: (chunk, done) => {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + chunk,
                  pending: !done && last.pending,
                };
              }
              return next;
            });
          },
          onReasoning: () => {},
          onTool: (ev) => {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                const tools = [...(last.tools ?? [])];
                const idx = tools.findIndex((t) => t.id === ev.id);
                if (idx >= 0) tools[idx] = ev;
                else tools.push(ev);
                next[next.length - 1] = { ...last, tools };
              }
              return next;
            });
          },
          onClientAction: (action) => dispatchClientAction(action),
          onError: (msg) => {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, error: msg, pending: false };
              }
              return next;
            });
          },
          onDone: () => {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, pending: false };
              }
              return next;
            });
          },
        },
        winState
      );

      handleRef.current.done.finally(() => setStreaming(false));
    },
    [turns, streaming, dispatchClientAction, buildWindowState]
  );

  const stop = () => {
    handleRef.current?.abort();
    setStreaming(false);
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && last.pending) {
        next[next.length - 1] = {
          ...last,
          pending: false,
          content: last.content || "_(stopped)_",
        };
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
        <Sparkles size={16} className="text-accent" />
        <span className="text-sm font-semibold text-ink">Athena</span>
        <span className="text-[11px] text-ink-muted">workspace assistant</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => send("Save my current workspace layout. Ask me for a name first.")}
            disabled={streaming}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            title="Save workspace"
          >
            <Save size={12} /> Save
          </button>
          <button
            onClick={() => send("List my saved workspaces")}
            disabled={streaming}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            title="List workspaces"
          >
            <FolderOpen size={12} /> Open
          </button>
          <button
            onClick={() => send("Tile my windows in a grid layout")}
            disabled={streaming}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            title="Tile windows"
          >
            <LayoutGrid size={12} /> Tile
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles size={32} className="text-accent opacity-60" />
            <p className="text-sm text-ink">
              Hi — I'm Athena. I can manage your tasks, files, notes, grades, focus timer,
              <br />
              and even control your windows and save workspace layouts.
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {turns.map((t, i) => (
              <TurnBubble key={i} turn={t} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-edge p-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask Athena to do something…"
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          {streaming ? (
            <button
              onClick={stop}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-ink-muted hover:bg-surface-3 hover:text-ink"
              title="Stop"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40"
              title="Send"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Window tiling helper =====

function tileWindows(
  windows: WindowInstance[],
  setRect: (id: string, rect: WindowRect) => void,
  layout: string
) {
  const visible = windows.filter((w) => !w.minimized);
  if (visible.length === 0) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight - 48;

  if (layout === "horizontal") {
    const w = Math.floor(vw / visible.length);
    visible.forEach((win, i) => {
      setRect(win.id, { x: i * w, y: 0, width: w, height: vh });
    });
  } else if (layout === "vertical") {
    const h = Math.floor(vh / visible.length);
    visible.forEach((win, i) => {
      setRect(win.id, { x: 0, y: i * h, width: vw, height: h });
    });
  } else {
    // grid
    const cols = Math.ceil(Math.sqrt(visible.length));
    const rows = Math.ceil(visible.length / cols);
    const cw = Math.floor(vw / cols);
    const ch = Math.floor(vh / rows);
    visible.forEach((win, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      setRect(win.id, { x: col * cw, y: row * ch, width: cw, height: ch });
    });
  }
}

// ===== UI components =====

function TurnBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        {!isUser && turn.tools && turn.tools.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {turn.tools.map((t) => (
              <ToolChip key={t.id} tool={t} />
            ))}
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm ${
            isUser
              ? "bg-accent text-accent-fg"
              : "bg-surface-2 text-ink border border-edge"
          }`}
        >
          {turn.content ? (
            isUser ? (
              <span className="whitespace-pre-wrap">{turn.content}</span>
            ) : (
              <div className="selectable markdown-body prose-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
              </div>
            )
          ) : turn.pending ? (
            <span className="flex items-center gap-1.5 text-ink-muted">
              <Loader2 size={13} className="animate-spin" /> thinking…
            </span>
          ) : null}
          {turn.error && (
            <span className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle size={12} /> {turn.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolChip({ tool }: { tool: AthenaToolEvent }) {
  const color =
    tool.state === "completed"
      ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
      : tool.state === "error"
      ? "text-red-400 border-red-500/30 bg-red-500/10"
      : tool.state === "canceled"
      ? "text-ink-muted border-edge bg-surface-3"
      : "text-accent border-accent/30 bg-accent/10";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${color}`}
    >
      <Wrench size={9} />
      {tool.name}
      {tool.state === "running" || tool.state === "preparing" ? (
        <Loader2 size={9} className="animate-spin" />
      ) : null}
      <span className="opacity-70">· {tool.state}</span>
    </span>
  );
}
