// ===== Study Hub: Podcast / audio overview =====
// Generate a 2-host dialogue script from selected StudySources and play it
// back in-browser via the Web Speech API (usePodcastTts). The script is saved
// as a note (the persistent artifact). Audio is playback-only.

import { useState, useEffect, useCallback } from "react";
import {
  Mic, Play, Pause, Square, SkipForward, SkipBack, Sparkles, Trash2,
  FileText, Loader2, AlertCircle, Download, RefreshCw, Gauge,
} from "lucide-react";
import { studyPodcastsApi, type Podcast as PodcastRow } from "../../services/study-podcasts";
import { studySourcesApi, type StudySource } from "../../services/study-sources";
import { studyWorkspacesApi } from "../../services/study-workspaces";
import type { SourceDescriptor } from "../../services/study";
import SourcePicker from "./SourcePicker";
import CitationMarkdown from "./CitationMarkdown";
import { ActionButton, ErrorBanner, Loading, SuccessBanner } from "./ui";
import { usePodcastTts } from "./usePodcastTts";
import { useWindows } from "../../store/windows";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  initialPodcastId?: string | null;
  initialWorkspaceId?: string | null;
}

export default function Podcast({ initialPodcastId, initialWorkspaceId }: Props) {
  const [library, setLibrary] = useState<StudySource[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState<SourceDescriptor | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  const [podcasts, setPodcasts] = useState<PodcastRow[]>([]);
  const [active, setActive] = useState<PodcastRow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  const tts = usePodcastTts();
  const openWindow = useWindows((s) => s.open);

  const refresh = useCallback(async () => {
    const [s, p] = await Promise.all([
      studySourcesApi.list().then((r) => r.sources).catch(() => [] as StudySource[]),
      studyPodcastsApi.list().then((r) => r.podcasts).catch(() => [] as PodcastRow[]),
    ]);
    setLibrary(s);
    setPodcasts(p);
    setLoadingList(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Load an initial podcast (deep link).
  useEffect(() => {
    if (!initialPodcastId) return;
    void (async () => {
      try {
        const { podcast: p } = await studyPodcastsApi.get(initialPodcastId);
        setActive(p);
        if (p.script) tts.loadScript(p.script, p.host1Label, p.host2Label);
        setSelectedIds(new Set(p.sourceIds));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load podcast");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPodcastId]);

  // Preload sources from a workspace deep-link.
  useEffect(() => {
    if (!initialWorkspaceId) return;
    void (async () => {
      try {
        const { workspace } = await studyWorkspacesApi.get(initialWorkspaceId);
        // Make sure all workspace sources are in the library list.
        const need = workspace.sourceIds.filter((sid) => !library.some((s) => s.id === sid));
        if (need.length > 0) {
          const fetched = await Promise.all(need.map((sid) => studySourcesApi.get(sid).catch(() => null)));
          const extra = fetched.filter((x): x is StudySource => x !== null);
          setLibrary((prev) => [...prev, ...extra]);
        }
        setSelectedIds(new Set(workspace.sourceIds));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load workspace");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkspaceId]);

  const addPickerSource = async () => {
    if (!pickerValue) return;
    setAddingSource(true);
    try {
      const { source } = await studySourcesApi.create(pickerValue);
      setLibrary((prev) => [source, ...prev.filter((s) => s.id !== source.id)]);
      setSelectedIds((prev) => new Set([...prev, source.id]));
      setPickerValue(null);
      setShowPicker(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add source");
    } finally {
      setAddingSource(false);
    }
  };

  const toggleSource = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generate = async () => {
    if (selectedIds.size === 0) return;
    setGenerating(true);
    setError("");
    setSuccess("");
    tts.stop();
    try {
      const { podcast, noteId } = await studyPodcastsApi.generate({
        sourceIds: [...selectedIds],
      });
      setActive(podcast);
      tts.loadScript(podcast.script ?? "", podcast.host1Label, podcast.host2Label);
      setSuccess("Podcast script generated and saved as a note.");
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const openScriptNote = () => {
    if (!active?.scriptNoteId) return;
    openWindow({ appId: "notes", title: "Notes", icon: "StickyNote", payload: { noteId: active.scriptNoteId } });
  };

  const selectPodcast = async (p: PodcastRow) => {
    tts.stop();
    setError("");
    try {
      const { podcast: full } = await studyPodcastsApi.get(p.id);
      setActive(full);
      if (full.script) tts.loadScript(full.script, full.host1Label, full.host2Label);
      setSelectedIds(new Set(full.sourceIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load podcast");
    }
  };

  const deletePodcast = async (id: string) => {
    try {
      await studyPodcastsApi.remove(id);
      if (active?.id === id) {
        setActive(null);
        tts.stop();
      }
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!tts.supported && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
          <AlertCircle size={14} /> Your browser doesn't support speech synthesis. You can still generate and read scripts, but audio playback won't work.
        </div>
      )}

      {/* Source selection */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sources</span>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <Sparkles size={11} /> Add source
          </button>
        </div>
        {library.length === 0 ? (
          <p className="rounded-md border border-edge bg-surface-2 p-3 text-xs text-ink-muted">
            No sources in your library yet. Add a note, file (incl. PDF), URL, or paste text.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {library.map((s) => {
              const checked = selectedIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSource(s.id)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition ${
                    checked ? "border-accent bg-accent/10 text-accent" : "border-edge bg-surface-2 text-ink hover:bg-surface-3"
                  }`}
                >
                  <FileText size={13} className="shrink-0 opacity-70" />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 text-[10px] uppercase opacity-60">{s.kind}</span>
                </button>
              );
            })}
          </div>
        )}
        {showPicker && (
          <div className="flex flex-col gap-2 rounded-lg border border-edge bg-surface-2 p-3">
            <SourcePicker value={pickerValue} onChange={setPickerValue} />
            <div className="flex justify-end gap-2">
              <ActionButton onClick={() => { setShowPicker(false); setPickerValue(null); }} variant="ghost">
                Cancel
              </ActionButton>
              <ActionButton onClick={addPickerSource} disabled={!pickerValue} loading={addingSource}>
                Add
              </ActionButton>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ActionButton onClick={generate} disabled={selectedIds.size === 0 || generating} loading={generating}>
          <Mic size={13} /> Generate podcast
        </ActionButton>
        {selectedIds.size > 0 && (
          <span className="text-[11px] text-ink-muted">{selectedIds.size} source{selectedIds.size === 1 ? "" : "s"} selected</span>
        )}
      </div>

      {generating && <Loading label="Writing the dialogue script…" />}
      {error && <ErrorBanner message={error} />}
      {success && <SuccessBanner message={success} />}

      {/* Player */}
      {active && (
        <div className="flex flex-col gap-3 rounded-lg border border-edge bg-surface-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">{active.title}</span>
              <span className="text-[11px] text-ink-muted">
                {tts.turns.length} turns · ~{fmtDuration(active.durationEstimate)} · {active.host1Label} & {active.host2Label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={openScriptNote}
                className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-3 hover:text-ink"
                title="Open script note"
              >
                <FileText size={11} /> Script
              </button>
              <button
                onClick={() => void deletePodcast(active.id)}
                className="rounded-md border border-edge p-1.5 text-ink-muted hover:text-red-400"
                title="Delete podcast"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {/* Progress */}
          <div className="flex flex-col gap-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${tts.turns.length > 0 ? ((tts.current + 1) / tts.turns.length) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-ink-muted">
              <span>Turn {Math.min(tts.current + 1, tts.turns.length)} / {tts.turns.length}</span>
              <span>Audio is playback-only (browser TTS). The script note is downloadable.</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => tts.skip(-1)}
              disabled={tts.turns.length === 0}
              className="rounded-full border border-edge p-2 text-ink-muted hover:bg-surface-3 hover:text-ink disabled:opacity-40"
              title="Previous turn"
            >
              <SkipBack size={15} />
            </button>
            {tts.playing ? (
              <button
                onClick={tts.pause}
                disabled={!tts.supported || tts.turns.length === 0}
                className="rounded-full bg-accent p-3 text-accent-fg hover:opacity-90 disabled:opacity-40"
                title="Pause"
              >
                <Pause size={18} />
              </button>
            ) : (
              <button
                onClick={tts.play}
                disabled={!tts.supported || tts.turns.length === 0}
                className="rounded-full bg-accent p-3 text-accent-fg hover:opacity-90 disabled:opacity-40"
                title="Play"
              >
                <Play size={18} />
              </button>
            )}
            <button
              onClick={tts.stop}
              disabled={tts.turns.length === 0}
              className="rounded-full border border-edge p-2 text-ink-muted hover:bg-surface-3 hover:text-ink disabled:opacity-40"
              title="Stop"
            >
              <Square size={15} />
            </button>
            <button
              onClick={() => tts.skip(1)}
              disabled={tts.turns.length === 0}
              className="rounded-full border border-edge p-2 text-ink-muted hover:bg-surface-3 hover:text-ink disabled:opacity-40"
              title="Next turn"
            >
              <SkipForward size={15} />
            </button>
            <label className="ml-2 flex items-center gap-1 text-[11px] text-ink-muted" title="Playback speed">
              <Gauge size={12} />
              <select
                value={tts.rate}
                onChange={(e) => tts.setRate(Number(e.target.value))}
                className="rounded-md border border-edge bg-surface px-1.5 py-1 text-[11px] text-ink outline-none"
              >
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                  <option key={r} value={r}>{r}×</option>
                ))}
              </select>
            </label>
          </div>

          {/* Current turn text */}
          {tts.turns.length > 0 && tts.current < tts.turns.length && (
            <div className="rounded-md border border-edge bg-surface p-3 text-xs">
              <span className="font-semibold text-accent">{tts.turns[tts.current].host}: </span>
              <span className="text-ink">{tts.turns[tts.current].text}</span>
            </div>
          )}

          {/* Full script */}
          {active.script && (
            <details className="rounded-md border border-edge bg-surface">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink">
                Full script
              </summary>
              <div className="border-t border-edge p-3">
                <CitationMarkdown content={active.script} />
              </div>
            </details>
          )}
        </div>
      )}

      {/* Existing podcasts */}
      {podcasts.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Your podcasts</span>
          <div className="flex flex-col gap-1.5">
            {podcasts.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs ${
                  active?.id === p.id ? "border-accent bg-accent/10" : "border-edge bg-surface-2"
                }`}
              >
                <button onClick={() => selectPodcast(p)} className="flex flex-1 items-center gap-2 text-left">
                  <Mic size={14} className="shrink-0 text-accent" />
                  <div className="flex flex-1 flex-col">
                    <span className="truncate font-medium text-ink">{p.title}</span>
                    <span className="text-[10px] text-ink-muted">~{fmtDuration(p.durationEstimate)} · {p.sourceIds.length} sources</span>
                  </div>
                </button>
                <button
                  onClick={() => void deletePodcast(p.id)}
                  className="shrink-0 rounded p-0.5 text-ink-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
