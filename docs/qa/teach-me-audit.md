# Teach Me — baseline feature audit

Environment: local dev (`bun run dev`, server :3001, client :5173), SQLite dev DB,
seeded `admin` user, OpenAI-compatible provider (`deepseek-v4-flash-free` via
`https://opencode.ai/zen/v1/`) configured through the server env fallback.

Fixtures used: a multi-paragraph note with a fenced Python block
("Gradient Descent Basics") plus a pasted-text source ("Momentum notes").

## What works today

| # | Feature | Result |
|---|---------|--------|
| 1 | Source library / workspace selection, add-source picker | OK |
| 2 | Session creation with a student level | OK (`POST /api/teacher` → 201) |
| 3 | Session list, load, delete; messages restore after reload | OK |
| 4 | SSE turn streaming (`content` / `tool` / `client_action` / `done`) | OK |
| 5 | `show_source` → Notes window opens, scrolls, highlights the passage | OK — verified `loss.backward()` highlighted inside the fenced block |
| 6 | Inline `[n]` citation chips render and are clickable | Renders, but the index mapping is wrong (see B1) |
| 7 | `check_comprehension` chip | Renders; grading is fake (see B2) |
| 8 | Auto-speak (Edge TTS) + STT mic button | Present; stop-only, no pause/resume, no per-message control |
| 9 | Mobile Teach Me | Not reachable — `MobileStudy` only exposes summarize/explain/study-guide/flashcards |

## Bugs and gaps confirmed live

* **B1 — citation indices are mis-mapped.** `citationMeta` is built from
  `sourceHistory` (the order in which windows were *opened*), while the model
  cites the `SOURCE [n]` labels from the session's `sourceIds` order. In the
  audit run the note was `SOURCE [2]` but its chip resolved to
  `Source [1]: Gradient Descent Basics`, and `[2]` pointed at nothing until the
  window happened to open. Citations must be derived from the session sources.
* **B2 — comprehension grading is fake.** `answerComprehension` records
  `passed: true` unconditionally and re-sends the answer as a plain user turn,
  so a wrong answer is logged as understood.
* **B3 — no tool-call feedback.** `onTool` is an empty callback. During the
  audit the UI sat with an empty bubble for ~20 s while `show_source` ran and
  the model retried; nothing indicated progress.
* **B4 — session title is the raw first message.**
  Session was titled `Teach me about the learning rate from my notes.`
* **B5 — speech-synced highlighting is dead code.** `useTeacherTts` fetches
  word boundaries from `/api/tts/synthesize/timed`, but `TeacherMode` never
  passes `onWordBoundary`, so the alignment data is discarded.
* **B6 — `coveredConcepts` is never populated**; the prompt always renders
  `CONCEPTS COVERED: (none yet)`, so pacing cannot adapt.
* **B7 — no mid-session source/level management.** The source panel disappears
  once a session exists; `loadSessionSources` only ever reads the row's
  `sourceIds` at turn time with no way to change them from the UI.
* **B8 — provider failures degrade badly.** With a flaky provider the turn
  died mid-sentence (`… Let me show you the loop in your notes [`) after
  `[503] The request queue is full`; the partial text is persisted as the
  assistant message and there is no retry affordance in the UI.
* **B9 — no export / no lesson structure / no replay.** Each turn is
  independent: no objectives, no recap, no way to turn a lesson into notes,
  flashcards, a quiz, or review tasks.
* **B10 — paste sources lose their name** (`POST /api/study/sources` with
  `kind: "paste"` + `name` stored as `Pasted text`), which makes citations and
  the source list ambiguous.

## Notes

* The free model is heavily queue-limited; `[teacher] transient upstream error`
  retries (2 s → 16 s backoff) are common and make long turns slow. Not a
  product bug, but it makes the missing tool/progress feedback (B3) much more
  visible.
