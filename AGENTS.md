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
│       ├── routes/{auth, notes, tasks, files, spotify, lyrics, flashcards, grades, vut}.ts
│       ├── services/{spotify.ts, lrclib.ts, jwt.ts, vut.ts}
│       └── middleware/auth.ts
└── client/
    └── src/
        ├── main.tsx, App.tsx, index.css
        ├── shell/                # BootScreen, LoginScreen, Wallpaper, Desktop,
        │                         # Taskbar, StartMenu, SystemTray, ContextMenu,
        │                         # DesktopEnvironment, CommandPalette (Spotlight)
        ├── wm/                   # Window, WindowLayer, SnapPreview, AltTabSwitcher
        ├── apps/
        │   ├── registry.tsx      # app manifest
        │   ├── notes/            # Notes (markdown editor)
        │   ├── tasks/            # Tasks (Kanban)
        │   ├── files/            # File Manager (virtual FS)
        │   ├── music/            # Music Player (Spotify + LRCLIB lyrics)
        │   ├── pomodoro/         # Pomodoro/Focus Timer (SVG ring, DND)
        │   ├── flashcards/       # Flashcards (SM-2, 3D flip review)
        │   ├── grades/           # Grade Tracker (GPA, weighted assignments)
        │   ├── vut/              # VUT Studis (grades, timetable, updates, web view)
        │   └── settings/         # Settings (theme, wallpaper, account)
        ├── store/                # Zustand stores (auth, windows, settings, music, notifications)
        ├── services/             # API clients (api, notes, tasks, files, spotify, lyrics, flashcards, grades, vut)
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
- Z-index focus management (click to focus)
- Alt+Tab window switcher (Shift+Alt+Tab for reverse)
- Meta/Win key toggles Start menu
- Taskbar with running app indicators
- Start menu with app search
- System tray: clock, volume slider, notifications bell, DND toggle, mini-calendar
- Desktop right-click context menu (New Folder, Change Wallpaper, Refresh)
- Desktop icons for pinned apps
- Settings app: light/dark theme, accent color picker, wallpaper picker, account info, notification preferences

### Apps
1. **Notes** — Markdown editor with live preview, folder organization, tags, search, auto-save (debounced), pin, export to Markdown/PDF
2. **Tasks** — Kanban board (To Do / In Progress / Done) with drag-and-drop, priority tags, due dates
3. **File Manager** — Virtual folder tree, upload/download, image/PDF/text preview, delete
4. **Music Player** — Spotify Web Playback SDK integration, now-playing controls (play/pause/skip/seek/volume), LRCLIB synced lyrics with auto-scroll + highlight, manual lyrics search fallback, mini-player floating widget
5. **Pomodoro / Focus Timer** — Circular SVG progress ring, 25/5/15 work-break intervals, auto long-break after 4 sessions, Web Audio API chime on phase change, auto-enables Do-Not-Disturb during focus, daily session stats (localStorage), sound toggle
6. **Flashcards** — SM-2 spaced repetition algorithm, deck browser with color tags, card CRUD, 3D flip-card review mode (CSS `rotateY` + `backface-visibility`), 4-level quality rating (Again/Hard/Good/Easy), due-date scheduling, progress bar during review
7. **Grade Tracker / GPA Calculator** — Course management with semester filtering, weighted assignment categories (Homework/Quiz/Exam/Lab/etc.), credit-weighted GPA on 4.0 scale, letter grade conversion (A/A-/B+/...), animated percentage bars, color-coded scores, expandable course cards
8. **VUT Studis** — Brno University of Technology integration:
   - One-time login with VUT credentials (id.vut.cz) — encrypted with AES-256-GCM, stored in DB
   - Backend handles full Shibboleth/SAML SSO flow with cookie jar + session caching (25min TTL)
   - **Overview tab**: today's classes, quick stats (graded courses, weekly classes, updates), recent subject updates, quick links
   - **Grades tab**: native grades table parsed from Studis `el_index` (course, code, credits, completion type, grade, ECTS), color-coded by grade, "Import to Grade Tracker" button
   - **Timetable tab**: weekly grid (Mon–Fri × time slots) parsed from `osobni_rozvrh`, color-coded per course, shows room/teacher/type
   - **Updates tab**: subject announcements feed parsed from `aktuality_predmet`, sorted by date
   - **Web View tab**: embedded browser via backend reverse proxy (strips X-Frame-Options, rewrites URLs for seamless navigation), address bar, open-in-new-tab
   - HTML parsing with cheerio, resilient multi-strategy parsers (table-based + div-based)
9. **Settings** — Theme, wallpaper, accent, account, notifications

### Command Palette (Spotlight)
- Triggered with `Ctrl+Space` (or `Cmd+Space` on Mac)
- Fuzzy search across: apps, quick actions, notes, tasks
- Built-in calculator: type a math expression → get instant result (click to copy)
- Keyboard navigation: `↑↓` to move, `Enter` to select, `Esc` to close
- Animated overlay with backdrop blur

### Backend
- JWT auth (login/register/me)
- Full CRUD for notes, note folders, tasks, files, virtual folders
- File upload/download with streaming
- Spotify proxy: token refresh, player control (play/pause/skip/seek/volume/shuffle/repeat/transfer), currently-playing
- LRCLIB proxy: exact match (`/get`) with DB cache, fuzzy search (`/search`), manual cache, LRC parser, User-Agent header, 300ms throttle
- Flashcards: deck CRUD, card CRUD, SM-2 review endpoint (`POST /cards/:id/review` with quality 0-5), due cards aggregation (`GET /due`)
- Grades: course CRUD, assignment CRUD, semester listing, weighted percentage + GPA computation helpers (client-side in `services/grades.ts`)
- VUT: credential management (AES-256-GCM encrypted), Shibboleth/SAML SSO authentication, session caching, HTML parsing (cheerio), reverse proxy for iframe embedding

## Deferred (future iterations)

- Calendar/Planner (month/week/day, ICS import)
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
