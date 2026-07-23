# Athena — Student OS

A desktop-environment-style productivity dashboard for students.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS 3, Zustand for state
- **Backend:** Bun + Hono
- **DB:** SQLite via Prisma
- **Infra:** Docker Compose (client on :5173, server on :3001)

## Quick start (local dev)

```bash
# Install all dependencies
bun install        # root (concurrently)
cd server && bun install && cd ..
cd client && bun install && cd ..

# Set up the database
cd server
ln -sf ../.env .env          # if not already linked
bunx prisma generate
bunx prisma migrate dev      # creates SQLite DB + migration
bun run src/db/seed.ts       # seeds admin/admin + demo data
cd ..

# Run both server + client (from root)
bun run dev
#   server → http://localhost:3001
#   client → http://localhost:5173
```

Open http://localhost:5173 → boot screen → login with `admin` / `admin`.

## Docker

```bash
cp .env.example .env   # fill in Spotify creds if you have them
docker compose up --build
#   server → http://localhost:3001
#   client → http://localhost:5173
```

## Commands

| Command | Description |
|---|---|
| `bun run dev` | Run server + client concurrently (hot reload) |
| `bun run dev:server` | Server only (Bun --hot) |
| `bun run dev:client` | Client only (Vite) |
| `bun run typecheck` | TypeScript check for both server + client |
| `bun run typecheck:server` | Server only |
| `bun run typecheck:client` | Client only |
| `bun run build` | Build both |
| `bun run db:generate` | Prisma client generation |
| `bun run db:migrate` | Prisma migrate dev |
| `bun run db:seed` | Seed demo data |
| `bun run docker:up` | Docker Compose up --build |
| `bun run docker:down` | Docker Compose down |

## Environment variables

See `.env.example`. Key ones:

- `SERVER_PORT` — server port (default 3001 in dev)
- `DATABASE_URL` — Prisma SQLite path
- `JWT_SECRET` — JWT signing secret
- `SEED_USERNAME` / `SEED_PASSWORD` — default user created by seed
- `VITE_API_URL` — backend URL for client (used by Vite proxy)
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REFRESH_TOKEN` — Spotify integration
- `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` / `MS_REFRESH_TOKEN` — Microsoft Calendar sync (Graph API, requires `Calendar.ReadWrite` + `offline_access` scopes)
- `OPENAI_PROVIDER` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` — Athena LLM server-wide fallback (per-user config in DB takes priority). Default provider `openai`, base URL `https://opencode.ai/zen/v1`, model `deepseek-v4-flash-free`.

## Project structure

```
Athena/
├── docker-compose.yml
├── .env / .env.example
├── server/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts              # Hono app entry
│       ├── db/{client.ts, seed.ts}
│       ├── routes/{auth, notes, tasks, files, spotify, lyrics, flashcards, grades, vut, ai, athena, conversations, study, moodle, calendar, habits, capture, microsoft}.ts
│       ├── services/{spotify.ts, lrclib.ts, jwt.ts, vut.ts, crypto.ts, moodle.ts, microsoft.ts}
│       ├── services/athena/{llm.ts, context.ts, tools/}  # multi-llm-ts client, system prompt, tool plugins
│       ├── services/study/{source, llm-json, prompts, quiz-store, logSession}.ts  # AI Study Hub helpers
│       └── middleware/auth.ts
└── client/
    └── src/
        ├── main.tsx, App.tsx, index.css
        ├── shell/                # BootScreen, LoginScreen, Wallpaper, AnimatedBackground, MusicWidget, ChillView, ChillBackground, Desktop,
        │                         # Taskbar, StartMenu, SystemTray, ContextMenu,
        │                         # DesktopEnvironment, CommandPalette (Spotlight),
        │                         # QuickCapture (Ctrl+Shift+N overlay)
        ├── wm/                   # Window, WindowLayer, SnapPreview, AltTabSwitcher
        ├── apps/
        │   ├── registry.tsx      # app manifest
        │   ├── notes/            # Notes (markdown editor)
        │   ├── tasks/            # Tasks (Kanban)
        │   ├── files/            # File Manager (virtual FS, tree sidebar, list/grid, multi-select, context menus, drag-drop, bulk zip)
        │   ├── editor/           # Code Editor (CodeMirror 6, 40+ languages, markdown live-preview, auto-save)
        │   ├── viewer/           # File Viewer (image zoom/pan, PDF, audio, video, fullscreen)
        │   ├── pomodoro/         # Pomodoro/Focus Timer (SVG ring, DND)
        │   ├── flashcards/       # Flashcards (SM-2, 3D flip review)
        │   ├── grades/           # Grade Tracker (GPA, weighted assignments)
        │   ├── vut/              # VUT Studis (grades, timetable, updates, web view)
        │   ├── athena/           # Athena assistant (chat UI, tool-call chips, SSE stream)
        │   ├── study/            # Study Hub (AI flashcards, summarize, quiz, explain, study guide, syllabus→tasks)
        │   ├── calendar/         # Calendar / Planner (month/week/day, ICS import/export, task drag-to-schedule)
        │   ├── habits/           # Habit Tracker (streaks, heatmap, auto-complete from Pomodoro)
        │   └── settings/         # Settings (Appearance, Wallpaper, Animated BG, Account, Sound & Athena, Athena Assistant, Integrations, Notifications, Users [admin], Data & Storage, About). Split into apps/settings/sections/*.tsx + ui.tsx shared helpers; SettingsApp.tsx is the shell with section nav (Users gated behind role=ADMIN).
        ├── store/                # Zustand stores (auth, windows, settings, music, notifications)
        ├── services/             # API clients (api, notes, tasks, files, spotify, lyrics, flashcards, grades, vut, athena, conversations, study, moodle, calendar, habits, microsoft, users)
        └── types/                # shared TS types
```

## Implemented features

### Desktop shell
- Animated boot screen → login → desktop
- Draggable / resizable windows with 8 resize handles
- Window controls: minimize, maximize/restore, close — all with animations
  - Open: scale-in + fade-up
  - Close: scale-down + fade-down
  - Minimize: shrink toward taskbar
- **Grid snapping:**
  - Drag to screen edges: left half, right half, top (maximize)
  - Drag to screen corners: top-left, top-right, bottom-left, bottom-right quadrants
  - Snap preview overlay highlights target zone during drag
  - **Hold Shift while resizing** to snap dimensions to a 20px grid
  - **Keyboard shortcuts** (Win/Cmd key):
    - `Win+←` / `Win+→` — snap to left/right half
    - `Win+↑` — maximize
    - `Win+Shift+↑` — toggle maximize/restore
    - `Win+Shift+←` / `Win+Shift+→` — snap to top-left/top-right quadrant
    - `Win+Shift+↓` — minimize
    - `Win+↓` — restore from snapped/maximized
    - `Win+W` — close focused window
    - `Win+Y` — toggle Athena quick panel (rolls in from the selected edge)
- Z-index focus management (click to focus)
- **Responsive window content (container queries):** The Window content div is a CSS `@container` (`wm/Window.tsx`). Each app uses Tailwind container-query breakpoints (`@sm`…`@7xl`, mapping to 384px…1280px) to adapt its layout to the **actual window width**, not the viewport. Sidebars collapse into toggleable overlays when narrow (`wm/CollapsibleSidebar.tsx` reusable component, or manual overlay pattern). Split-view modes auto-switch to single-pane below a threshold. `max-w-*` constraints on content relax to `max-w-none` when narrow. Tailwind safelist in `tailwind.config.js` covers the dynamically-constructed `@{breakpoint}:{utility}` classes used by `CollapsibleSidebar`.
- Alt+Tab window switcher (Shift+Alt+Tab for reverse)
- Start menu opens via the Start button (Win/Meta key is not bound — it triggers native OS shortcuts)
- Taskbar with running app indicators
- Start menu with app search
- System tray: clock, volume slider, notifications bell, DND toggle, mini-calendar
- Desktop right-click context menu (New Folder, Change Wallpaper, Animated Background, Refresh)
- Desktop icons for pinned apps
- Settings app: light/dark theme, accent color picker, wallpaper picker, **animated background picker** (14 canvas-based animations with category tabs + search), account info, notification preferences
- **Animated backgrounds** (`shell/AnimatedBackground.tsx`): 14 self-contained canvas animations (starfield, particle network, matrix rain, neon grid, aurora waves, ocean waves, bubbles, geometric pulse, fireflies, rain, plasma, constellation, bokeh, snowfall). Rendered on a `<canvas>` overlay above the static gradient wallpaper. Each animation uses `requestAnimationFrame`, handles resize + DPR scaling, and cleans up on unmount. The picker in Settings supports category filtering (Space, Nature, Abstract, Retro, Weather, Basic) + full-text search across names, tags, and descriptions. Also accessible via desktop right-click → "Animated Background" submenu. Selection persisted in `localStorage` via `settings.animatedBg`.

### Apps
1. **Notes** — Markdown editor with live preview, folder organization, tags, search, auto-save (debounced), pin, export to Markdown/PDF. **Realtime split editor** (CodeMirror 6 markdown + live preview, edit/split/preview modes), **full LaTeX** via KaTeX (`$...$` inline, `$$...$$` display), debounced auto-save (1.5s, saves on blur + `Ctrl/Cmd+S`, dirty indicator per note).
2. **Tasks** — Kanban board (To Do / In Progress / Done) with drag-and-drop, priority tags, due dates
3. **File Manager** — Full-featured virtual file system:
   - 3-pane layout: sidebar (folder tree + smart collections) | main (toolbar + breadcrumbs + file area) | quick-look panel
   - Smart collections: Home, Recent (last opened), Starred, All Files
   - Recursive folder tree sidebar with expand/collapse, file counts per folder, drag-drop to move
   - Grid and list views with sortable columns (name/size/modified/type, asc/desc)
   - Multi-select: click, Ctrl/Cmd+click (toggle), Shift+click (range), Ctrl+A (select all)
   - Selection bar: bulk download as ZIP, copy/cut/paste files, bulk delete
   - Right-click context menus (per file, per folder, empty space) using shared ContextMenu component
   - File operations: rename (F2), duplicate, star/unstar, move (drag-drop or paste), delete
   - Folder operations: rename, move (drag-drop with cycle detection), download as ZIP, delete (recursive)
   - Drag-and-drop file upload (drop anywhere in file area)
   - Search box (filters current view by name)
   - Storage usage bar in sidebar
   - Keyboard shortcuts: Delete, F2, Enter, Ctrl+A/C/X/V, F5, Backspace (go up)
   - Quick-look panel: single-click shows preview (image/PDF/audio/video/text) + file metadata + Open/Download buttons
   - Double-click opens file in Editor (text/code) or Viewer (media) window
4. **Code Editor** — CodeMirror 6-based text/code editor:
   - Syntax highlighting for 40+ languages (JS/TS, Python, Go, Rust, Java, C/C++, C#, PHP, HTML, CSS, JSON, SQL, XML, Markdown, YAML, TOML, Shell, Ruby, Lua, R, Swift, Kotlin, Scala, Dart, GraphQL, Diff, and more)
   - Markdown live-preview: edit / split / preview modes
   - Auto-save (debounced 1.5s for existing files; prompt for name on new files)
   - Ctrl+S manual save, word-wrap toggle, download
   - Light/dark theme follows app settings
   - Status bar: language, char count, line count, file size, save status
   - Dirty-state indicator (● in window title)
   - Opened via Files double-click or Command Palette
5. **File Viewer** — Media viewer for non-text files:
   - Image: zoom (wheel/buttons), pan (drag), fit-to-screen, actual size (1:1), fullscreen
   - PDF: embedded iframe viewer
   - Audio: native player with controls
   - Video: native player with controls
   - Fallback: "No preview available" + download button
   - Opened via Files double-click or Command Palette
6. **Music Widget** — Compact desktop overlay (`shell/MusicWidget.tsx`) fixed to the top-right corner of the wallpaper. Polls the user's active Spotify device every 3s (no Web Playback SDK — works with playback on any device: phone, desktop, etc.). Shows album art, track name, artist, current synced lyric line, play/pause + skip controls, and a click-to-seek progress bar. Expandable lyrics panel with auto-scrolling synced lyrics (LRCLIB), highlight active line, device name display. **Chill mode**: click the maximize button (or press ESC to exit) for a fullscreen immersive experience (`shell/ChillView.tsx` + `shell/ChillBackground.tsx`) — beat-reactive animated canvas background that captures system audio via `getDisplayMedia` (PipeWire on Fedora) and runs it through a Web Audio `AnalyserNode` for real-time beat detection. Renders floating color orbs (extracted from album art), particle field, beat ripples, and frequency bars — all reacting to the actual audio. Spinning vinyl-style album art, large centered synced lyrics with glow on the active line (proximity-based fade for surrounding lines), full playback controls, and spacebar play/pause. Falls back to simulated mode (pulses on lyric line changes) if audio capture is denied. State managed in `store/music.ts` (polling-only, no SDK). Backend: `routes/spotify.ts` + `routes/lyrics.ts` (unchanged).
7. **Pomodoro / Focus Timer** — Circular SVG progress ring, 25/5/15 work-break intervals, auto long-break after 4 sessions, Web Audio API chime on phase change, auto-enables Do-Not-Disturb during focus, daily session stats (localStorage), sound toggle
8. **Flashcards** — SM-2 spaced repetition algorithm, deck browser with color tags, card CRUD, 3D flip-card review mode (CSS `rotateY` + `backface-visibility`), 4-level quality rating (Again/Hard/Good/Easy), due-date scheduling, progress bar during review
9. **Grade Tracker / GPA Calculator** — Course management with semester filtering, weighted assignment categories (Homework/Quiz/Exam/Lab/etc.), credit-weighted GPA on 4.0 scale, letter grade conversion (A/A-/B+/...), animated percentage bars, color-coded scores, expandable course cards
10. **VUT Studis** — Brno University of Technology integration:
   - One-time login with VUT credentials (id.vut.cz) — encrypted with AES-256-GCM, stored in DB
   - Backend handles full Shibboleth/SAML SSO flow with cookie jar + session caching (25min TTL)
   - **Overview tab**: today's classes, quick stats (graded courses, weekly classes, updates), recent subject updates, quick links
   - **Grades tab**: native grades table parsed from Studis `el_index` (course, code, credits, completion type, grade, ECTS), color-coded by grade, "Import to Grade Tracker" button
   - **Timetable tab**: weekly grid (Mon–Fri × time slots) parsed from `osobni_rozvrh`, color-coded per course, shows room/teacher/type
   - **Updates tab**: subject announcements feed parsed from `aktuality_predmet`, sorted by date
   - **Web View tab**: embedded browser via backend reverse proxy (strips X-Frame-Options, rewrites URLs for seamless navigation), address bar, open-in-new-tab
   - HTML parsing with cheerio, resilient multi-strategy parsers (table-based + div-based)
11. **Settings** — Split into 11 sections (sidebar nav, `apps/settings/sections/*.tsx`):
    - **Appearance** — theme (light/dark), accent color (presets + custom).
    - **Wallpaper** — static gradient picker.
    - **Animated Background** — 14 canvas animations with category tabs + search.
    - **Account** — editable display name + avatar color, change password (current-password verification), shows role badge. Backend: `PATCH /api/auth/profile`, `POST /api/auth/password`.
    - **Sound & Athena** — system volume slider, Athena quick-panel roll-in edge (bottom/top/left/right) + panel width/height. Exposes previously-hidden `settings.volume` / `athenaRollEdge` / `athenaQuickSize` store values.
    - **Athena Assistant** — LLM provider config (key + provider/baseURL/model, AES-256-GCM encrypted) **+ custom instructions** textarea (stored on `User.athenaInstructions`, injected into the Athena system prompt via `services/athena/context.ts`). Backend: `GET/PUT /api/athena/instructions`.
    - **Integrations** — consolidated connect/disconnect/status for Spotify (server-wide), VUT Studis (per-user encrypted creds), Microsoft Calendar (server-wide + sync), Moodle (reuses VUT creds). Reuses existing per-app client services.
    - **Notifications** — enable + Do-Not-Disturb toggles.
    - **Users** (admin-only, gated by `role=ADMIN`) — full user management: list, create (with role), edit (display name/avatar/role), reset password, delete. Blocks self-delete and self-demotion. Backend: `/api/users/*` guarded by `middleware/admin.ts`.
    - **Data & Storage** — storage usage bar (reuses `/api/files/storage`), export all user data as JSON (`GET /api/auth/export`), clear local cache, danger-zone account deletion (password-confirmed `DELETE /api/auth/account`).
    - **About** — client/server version, `/health` status, reset settings to defaults.
    - **Roles:** `User.role` is `USER` | `ADMIN` (String, SQLite has no enums). Seed user + first registered user become ADMIN. Existing installs backfilled via migration (earliest user promoted). `api.delete` supports an optional body (used by account deletion).
12. **Study Hub** — AI study workflows (one-click, structured) on top of the Athena LLM infra (`services/athena/llm.ts`):
    - **Generate Flashcards** — pick a note/file/pasted text → AI generates Q/A pairs → editable preview grid → save into a new Flashcards deck.
    - **Summarize** — TL;DR / outline / key-points modes → saves a new Note.
    - **Quiz Me** — AI generates MCQ + short-answer questions → answer one-by-one with instant AI grading + explanation → final score + wrong-answer review.
    - **Explain** — ELI5 / Standard / Expert depth → saves a new Note.
    - **Study Guide** — pick multiple notes → AI consolidates into a cheat sheet → saves a Note.
    - **Syllabus → Tasks** — paste a syllabus/outline → AI extracts tasks with due dates + priorities → editable preview → creates Tasks.
    - **Recent Activity** — feed of past study sessions (logged via `StudySession` model).
    - Backend: `routes/study.ts` (`/api/study/*`) reuses `getUserConfig`/`buildModel`; structured JSON endpoints via `services/study/llm-json.ts` (robust JSON extraction + one re-prompt retry); source resolution in `services/study/source.ts` (note/file/paste/Moodle); in-memory quiz store (`services/study/quiz-store.ts`, 30-min TTL).
    - **Moodle integration**: Study Hub can use Moodle course materials as a source. The SourcePicker has a "Moodle" tab that lists enrolled courses → course sections → activities (pages, files, assignments). Fetchable activities (text-based) are sent to the LLM. Authentication rides the existing VUT SSO (id.vut.cz OIDC) — no separate Moodle login needed. Backend: `services/moodle.ts` (auth via `fetchWithVutSession`, course/contents/resource scraping with cheerio), `routes/moodle.ts` (`/api/moodle/*`).
    - Athena tools: `generate_flashcards` (creates deck + opens Flashcards via client_action), `summarize_note`, `create_tasks_from_text`, `open_study_hub` (opens Study Hub with optional preselected mode/source), `list_moodle_courses`, `get_moodle_course_contents`, `read_moodle_resource`.
13. **Athena** — LLM workspace assistant (chat UI) powered by `multi-llm-ts`:
    - Streaming chat over SSE (`POST /api/athena/chat`): content + tool-call progress + client-action events
    - Tool calling via `MultiToolPlugin` (per-request, per-user): `create_task`, `list_tasks`, `update_task_status`, `list_courses`, `get_course_grades`, `list_notes`, `read_note`, `create_note`, `list_files`, `search_files`, `read_file`, `edit_file`, `start_pomodoro`, `generate_flashcards`, `summarize_note`, `create_tasks_from_text`, `open_study_hub`, `list_moodle_courses`, `get_moodle_course_contents`, `read_moodle_resource`, `list_calendar_events`, `create_calendar_event`, `schedule_task`, `find_free_slots`, `open_calendar`, `sync_microsoft_calendar`, `list_habits`, `create_habit`, `log_habit`, `open_habits`
    - **Recent-files context**: the 5 most recently opened files (id, path, type, size, short text preview — NOT full content) are injected into the system prompt every turn, so Athena already "knows" what files exist. Full contents are loaded on demand via `read_file`.
    - **Client-action dispatch**: tools that affect the desktop (e.g. `start_pomodoro`) return a payload streamed as a `client_action` SSE event; the client opens/controls the relevant app (Pomodoro auto-starts with the requested phase/duration).
    - Multi-turn conversation history sent each turn; abortable via the Stop button.
    - Any `multi-llm-ts` provider works (openai, deepseek, anthropic, openrouter, ollama, groq, mistralai, google, xai, meta, cerebras). Defaults to OpenCode Zen (DeepSeek V4 Flash Free). Per-user config encrypted (AES-256-GCM) in DB; server-wide fallback via env vars.
    - **Quick panel mode** (`Win+Y`): Athena can be activated as a rolling quick panel that slides in from a user-selected screen edge (bottom/top/left/right) instead of a normal window. The panel occupies a partial area (~80% width, ~3/4 height by default), doesn't cover all apps, is resizable with remembered size (persisted in settings), and has an **Expand** button to switch to the full window mode. Roll edge is configurable via a dropdown in the quick panel header. Athena remains openable as a full window from the Start Menu / Command Palette.
    - **File attachments** (paperclip button in the composer): users can attach files (PDF, TXT, C/C++, Java, TS, JS, Python, Markdown) to the chat. When a file is attached:
      1. The file is uploaded to `POST /api/athena/attach`, which extracts text (text files: direct read; PDF: `pdf-parse` v2 library) and stores the file temporarily in `uploads/temp/`.
      2. The extracted text (max 50,000 chars, truncated if larger) is injected into the next chat message as context, so Athena can answer questions about the file content.
      3. A **"Save to Storage?"** dialog appears immediately, offering three options:
         - **Pick a folder manually** — scrollable folder list with full paths (e.g. `Lectures/Math`), plus a "Root" option.
         - **Let Athena suggest** — calls `POST /api/athena/suggest-folder`, which uses the per-user LLM (`generateJson` from `services/study/llm-json.ts`) to analyze the file name + content preview + the user's folder tree + course names, and returns `{ folderId, folderPath, reason, confidence }`. The suggested folder is auto-selected with a confidence badge and explanation.
         - **Don't save** — the file is used only for the current chat session (temp file is later cleaned up).
      4. If saved, `POST /api/athena/save-attached` copies the temp file to permanent storage (`uploads/{userId}/`), creates a `VFile` record in the DB with the chosen `folderId`, and sets `lastOpenedAt = now()` so the file immediately appears in the **Recent Files** context injected into Athena's system prompt on subsequent turns.
      - Accepted extensions: `.pdf, .txt, .c, .h, .cpp, .cc, .cxx, .hpp, .java, .ts, .tsx, .js, .jsx, .py, .md` (max 20 MB).
    - **Conversation history**: chats are persisted in the DB (`ChatConversation` model — single row per conversation with messages stored as a JSON array). The active conversation is automatically archived after 30 minutes of inactivity (checked on every `GET /api/conversations` call via `autoArchive`). The user can also start a new chat manually with the **New** button, which archives the current active conversation and creates a fresh one. A **History** dropdown in the header lists all conversations (active + archived) with auto-generated titles (LLM generates a short descriptive title from the first few messages via `POST /api/conversations/:id/generate-title`), timestamps, and delete buttons. Clicking a conversation loads its messages for viewing/resuming. Backend: `routes/conversations.ts` (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `POST /:id/generate-title`, `DELETE /:id`, `POST /archive-all`).
14. **Calendar / Planner** — Unified time-based view for all student events:
    - Month / Week / Day views with click-to-create, drag-to-reschedule, and a color-coded event editor (title, start/end, all-day, color, location, description).
    - **Layer toggles** to show/hide: My Events (manual), Tasks (due dates), VUT Classes (timetable projected onto the current week), Assignments, Microsoft (Outlook sync).
    - **Drag a Task onto a slot** → creates a "Study: …" calendar event linked to the task (`source="task"`, `sourceRef=taskId`).
    - **ICS import/export**: import `.ics` files (single VEVENTs + simple DAILY/WEEKLY/MONTHLY recurrence expanded into the visible range); export the user's events as a downloadable `.ics`.
    - **Microsoft Calendar sync** (`services/microsoft.ts` + `routes/microsoft.ts`): two-way sync with Microsoft (Outlook) calendars via Graph API.
      - **Pull sync**: `POST /api/microsoft/sync` fetches events from the user's default Outlook calendar for a date range, upserts them as `CalendarEvent` rows (`source="microsoft"`, `sourceRef=msEventId`), and removes local MS events that no longer exist remotely. Free/tentative events are shown in a dimmer color.
      - **Push**: `POST /api/microsoft/push` creates a local event in the user's Outlook calendar (or updates it if already linked), then links the local event to the MS event ID.
      - **Delete**: `DELETE /api/microsoft/event/:msId` removes an event from Outlook + deletes the local copy.
      - **Token management**: OAuth2 refresh-token flow with automatic rotation handling — Microsoft may return a new refresh token on each exchange, which is persisted in the `Setting` table (`key="ms_refresh_token"`) to survive restarts. The env var `MS_REFRESH_TOKEN` seeds the DB on first run.
      - **UI**: "Sync" button in the calendar toolbar (shows `Cloud` icon when configured, `CloudOff` when not); MS events are prefixed with `☁` and controlled by the "MS" layer toggle; event editor shows a "Microsoft" badge for MS-sourced events and a "Push to MS" button for local events.
      - Env vars: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` (default `common`), `MS_REFRESH_TOKEN`. Requires `Calendar.ReadWrite` + `offline_access` scopes.
    - VUT timetable classes and assignment due dates are merged client-side from existing `vutApi.timetable()` and `gradesApi` — no backend duplication.
    - Athena tools: `list_calendar_events`, `create_calendar_event`, `schedule_task` (links a task to a time slot + opens Calendar via client_action), `find_free_slots` (reads events + VUT classes for a day, returns free windows), `open_calendar`, `sync_microsoft_calendar` (pulls MS events into local DB, returns synced/deleted counts).
    - Today app integration: "Today's Schedule" card shows today's events sorted by start time.
15. **Habit Tracker** — Streak-based daily/weekly habits:
    - Habit list with one-tap check-off, current streak, longest streak, and a 7-day mini strip per habit.
    - Detail panel with a GitHub-style 13-week heatmap, total completions, and delete.
    - **Auto-completion** for pomodoro-linked habits: reads the same `localStorage` `pomodoro-stats` the Pomodoro app writes (focusSessions / focusMinutes); when today's metric ≥ target, the habit shows an "auto" badge and one tap logs it.
    - Create form with icon picker, color picker, cadence (daily/weekly), target count, and optional linked app/metric.
    - Athena tools: `list_habits` (with current streaks + doneToday), `create_habit`, `log_habit` (marks today done), `open_habits`.
    - Today app integration: "Habits" card with one-tap check-off and streak display.
16. **Quick Capture** — Global capture inbox:
    - `Ctrl+Shift+N` (or `Cmd+Shift+N`) opens an animated overlay with a single text input.
    - On Enter, `POST /api/capture` uses the per-user LLM (via `services/study/llm-json.ts`) to classify the input as `task | note | flashcard | athena`, performs the action (creates the item), and returns a `clientAction` that opens the relevant app.
    - Falls back to creating a plain Task with the raw text if no LLM is configured or the LLM call fails.
    - Flashcard captures go into a "Quick Capture" deck (auto-created). Athena captures open Athena with the text prefilled as a prompt.
    - Discoverable via the Command Palette ("Quick Capture" action).

### Command Palette (Spotlight)
- Triggered with `Ctrl+Space` (or `Cmd+Space` on Mac)
- Fuzzy search across: apps, quick actions, files, notes, tasks
- File results open in Editor (text/code) or Viewer (media) depending on file type
- Built-in calculator: type a math expression → get instant result (click to copy)
- Keyboard navigation: `↑↓` to move, `Enter` to select, `Esc` to close
- Animated overlay with backdrop blur
- Quick actions include: New Note, New Task, Start Pomodoro, Review Flashcards, Open Calendar, Open Habits, Quick Capture

### Quick Capture
- Triggered with `Ctrl+Shift+N` (or `Cmd+Shift+N` on Mac)
- One-line input → AI classifies as task/note/flashcard/athena → creates + opens the result
- Animated overlay with backdrop blur; Esc to close
- Also reachable from the Command Palette ("Quick Capture" action)

### Backend
- JWT auth (login/register/me)
- Full CRUD for notes, note folders, tasks, files, virtual folders
- File management: upload/download, rename, move, duplicate, star, text content read/write, bulk zip download (fflate), folder zip, recursive folder tree, storage stats, file search, recent/starred filters
- File upload/download with streaming
- Spotify proxy: token refresh, player control (play/pause/skip/seek/volume/shuffle/repeat/transfer), currently-playing
- LRCLIB proxy: exact match (`/get`) with DB cache, fuzzy search (`/search`), manual cache, LRC parser, User-Agent header, 300ms throttle
- Flashcards: deck CRUD, card CRUD, SM-2 review endpoint (`POST /cards/:id/review` with quality 0-5), due cards aggregation (`GET /due`)
- Grades: course CRUD, assignment CRUD, semester listing, weighted percentage + GPA computation helpers (client-side in `services/grades.ts`)
- VUT: credential management (AES-256-GCM encrypted), Shibboleth/SAML SSO authentication, session caching, HTML parsing (cheerio), reverse proxy for iframe embedding
- Athena (assistant): per-user LLM provider config (AES-256-GCM encrypted in DB: apiKey + provider + baseUrl + modelId), unified via `multi-llm-ts` (`services/athena/llm.ts`), `POST /api/athena/chat` SSE streaming agent with tool calling (`MultiToolPlugin` per request, `services/athena/tools/`), `GET /api/athena/tools` manifest; system prompt built in `services/athena/context.ts` with workspace summary + 5 recent files; server-wide fallback via `OPENAI_PROVIDER` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`
- Study Hub: `POST /api/study/{flashcards,summarize,explain,study-guide,syllabus-tasks,quiz/start,quiz/:id/answer,quiz/:id/finish}` + `GET /api/study/sessions`; reuses the per-user LLM config; structured JSON generation via `services/study/llm-json.ts`; outputs are written into existing Flashcards/Notes/Tasks models; activity logged in `StudySession` table
- Moodle: `GET /api/moodle/{status,courses,courses/:id/contents}` + `POST /api/moodle/{login,resource}`; rides the VUT SSO session (id.vut.cz OIDC) via `fetchWithVutSession` (exported from `services/vut.ts`); scrapes course lists + course contents + resource text with cheerio; `services/moodle.ts`
- Calendar: `GET /api/calendar/feed?from=&to=`, `GET/POST /api/calendar`, `PATCH/DELETE /api/calendar/:id`, `POST /api/calendar/ics/import` (parses ICS + expands simple recurrence), `GET /api/calendar/ics/export` (generates `.ics`); `CalendarEvent` model with `source` (manual|task|vut|assignment|ics|microsoft) + `sourceRef` linking
- Habits: `GET/POST /api/habits`, `PATCH/DELETE /api/habits/:id`, `GET /api/habits/:id/logs?from=&to=`, `POST /api/habits/:id/log` (upsert by date), `DELETE /api/habits/:id/log?date=`, `GET /api/habits/stats` (current/longest streak + last-30-day completion per habit); `Habit` + `HabitLog` models
- Quick Capture: `POST /api/capture` `{ text }` → uses per-user LLM (`services/study/llm-json.ts`) to classify as task/note/flashcard/athena → creates the item → returns `{ target, created, clientAction }`; falls back to a plain Task if no LLM configured
- Microsoft Calendar: `GET /api/microsoft/status`, `POST /api/microsoft/sync` (pull Graph events → upsert as `CalendarEvent` with `source="microsoft"`, delete stale), `POST /api/microsoft/push` (push local event to Outlook), `DELETE /api/microsoft/event/:msId`; `services/microsoft.ts` handles OAuth2 token refresh with rotation persistence in `Setting` table
- Athena file attachments: `POST /api/athena/attach` (multipart upload → extract text from PDF/txt/code → store temp → return text + tempPath), `POST /api/athena/save-attached` (copy temp file to permanent storage + create `VFile` + set `lastOpenedAt`), `POST /api/athena/suggest-folder` (LLM analyzes file name + content + folder tree + courses → returns `{ folderId, folderPath, reason, confidence }`); uses `pdf-parse` v2 for PDF text extraction
- Athena conversation history: `GET /api/conversations` (list all, auto-archives active convs inactive >30min), `GET /api/conversations/:id` (full conv with messages), `POST /api/conversations` (create new active, archives previous), `PUT /api/conversations/:id` (save messages), `POST /api/conversations/:id/generate-title` (LLM generates short title from first messages), `DELETE /api/conversations/:id`, `POST /api/conversations/archive-all`; `ChatConversation` model stores messages as JSON array

## Deferred (future iterations)

- Pomodoro/Focus timer with DND
- Grade Tracker / GPA Calculator
- PDF/eBook Reader with annotations
- Terminal emulator
- Study Group chat (WebSocket)
- Flashcards / spaced repetition
- AI Study Assistant (LLM)
- Cloud sync / backup
- Multi-user / profile support
- Widgets dashboard (weather, calculator, sticky notes)

## Notes

- The server's `.env` is symlinked to the root `.env` (gitignored). Both `server/.env` and `client/.env` are symlinks.
- Port 3001 is used for the server in dev because port 3000 may be occupied on some machines.
- The Spotify Web Playback SDK requires a **Spotify Premium** account. The client does NOT pre-check for Premium (the `/me` endpoint only returns `product` with the `user-read-private` scope, which the stored refresh token may not have). Instead, the SDK's `initialization_error` / `account_error` events report genuine non-Premium failures with a clear message.
- The `getOAuthToken` callback fetches a fresh access token from the server each time the SDK requests one, so token expiry (1 hour) is handled automatically.
- LRCLIB (https://lrclib.net) is a free public API — no key needed. We set a descriptive `User-Agent` and throttle to 300ms between requests per their guidelines.
