import { useRef, useState } from "react";
import { ArrowUp, Sparkles, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamAthenaChat, type AthenaMessage } from "../services/athena";

export default function MobileAthena() {
  const [messages, setMessages] = useState<AthenaMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const send = () => {
    const content = draft.trim();
    if (!content || streaming) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setDraft("");
    setStreaming(true);
    const handle = streamAthenaChat(next, {
      onContent: (text) => setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: message.content + text } : message)),
      onError: (message) => setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, content: message } : item)),
      onDone: () => setStreaming(false),
    });
    abortRef.current = handle.abort;
    void handle.done.finally(() => setStreaming(false));
  };
  return (
    <div className="mx-auto flex min-h-full min-w-0 max-w-md flex-col px-5 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-indigo-300">
          <Sparkles size={17} />
          <span className="text-sm font-medium">Your study copilot</span>
        </div>
        <h1 className="mt-1 text-3xl font-bold text-white">Athena</h1>
      </header>
      <div className="flex flex-1 flex-col gap-3">
        {messages.length === 0 && (
          <div className="mt-8 rounded-3xl border border-indigo-300/15 bg-indigo-500/10 p-5">
            <p className="font-semibold text-white">What are you working on?</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Ask me to make a plan, clarify a concept, turn a syllabus into tasks, or help you get unstuck.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Plan my study session", "Explain this simply", "What should I do today?"].map((prompt) => (
                <button key={prompt} type="button" onClick={() => setDraft(prompt)} className="rounded-full border border-white/10 px-3 py-2 text-xs text-indigo-200">{prompt}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-indigo-500 text-white" : "border border-white/10 bg-white/[.06] text-slate-200"}`}>
            {message.role === "assistant" && message.content ? (
              <div className="selectable markdown-body prose-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              </div>
            ) : message.content ? (
              message.content
            ) : streaming ? (
              <span className="animate-pulse text-slate-400">Thinking…</span>
            ) : null}
          </div>
        ))}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); send(); }} className="mt-4 flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[.06] p-2">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} rows={1} placeholder="Ask Athena anything…" className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500" />
        {streaming ? (
          <button type="button" onClick={() => abortRef.current?.()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white">
            <Square size={16} />
          </button>
        ) : (
          <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white">
            <ArrowUp size={19} />
          </button>
        )}
      </form>
    </div>
  );
}
