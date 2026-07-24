<div align="center">

# Athena — Student OS

**A desktop-environment-style productivity dashboard for students.**

Vite + React 18 · TypeScript · Tailwind CSS 3 · Bun + Hono · Prisma + SQLite · Docker Compose

[Features](#-features) · [Screenshots](#-screenshots) · [Quick Start](#-quick-start) · [Docker](#-docker) · [Project Structure](#-project-structure) · [License](#-license)

</div>

---

## Overview

Athena is a self-hosted, browser-based "operating system" for students. It recreates the feel of a real desktop environment — draggable/resizable windows, a taskbar, start menu, system tray, command palette, and an animated wallpaper — and fills it with a suite of apps built around the academic workflow: notes, tasks, files, a code editor, flashcards, a grade tracker, calendar, habits, a Pomodoro timer, an AI study hub, voice notes with Whisper transcription, and an AI assistant ("Athena").

It also integrates with the services students actually use: **Spotify** (with a beat-reactive fullscreen "Chill" mode), **Microsoft Calendar** (Graph API sync), and **VUT Studis** (Brno University of Technology SSO — grades, timetable, subject updates).

> Default login after seeding: **`admin` / `admin`**

---

## Screenshots

### 1. The desktop, with Spotify and an aurora background

The default environment: animated canvas wallpaper (aurora waves), the compact Spotify music widget in the top-right corner with synced lyrics, desktop icons, and the taskbar.

![Desktop with aurora background and Spotify playing](docs/screenshots/desktop-aurora-spotify.png)

### 2. Athena assistant

The Athena AI assistant snapped to the right half of the screen, running alongside the desktop. Streaming chat with tool-call chips, powered by the multi-llm-ts backend.

![Athena assistant open on the right side](docs/screenshots/athena-assistant.png)

### 3. Chill mode — fullscreen Spotify

The immersive fullscreen music experience: beat-reactive animated canvas background driven by captured system audio, spinning vinyl album art, and large centered synced lyrics. Shown here playing *"Take What You Want"*.

![Fullscreen Spotify chill mode](docs/screenshots/chill-mode-spotify.png)

### 4. Study Hub

The AI Study Hub: one-click structured workflows — generate flashcards, summarize, quiz, explain, study guide, and syllabus→tasks — all built on top of the Athena LLM infrastructure.

![Study Hub](docs/screenshots/study-hub.png)

### 5. Files + Tasks, side by side

Two windows snapped side-by-side: the File Manager (virtual FS, tree sidebar, grid/list view) on the left and the Tasks Kanban board on the right — showcasing the window manager's edge-snap tiling.

![Files and Tasks side by side](docs/screenshots/files-tasks-split.png)

---

## Features

### Desktop shell

- Animated **boot screen → login → desktop** flow
- **Draggable / resizable windows** with 8 resize handles and open/close/minimize animations
- **Grid snapping** — drag to edges (halves), corners (quadrants), or top (maximize), with a live snap-preview overlay
  - Hold **Shift** while resizing to snap to a 20px grid
  - Keyboard shortcuts (Win/Cmd): `Win+←/→` halves, `Win+↑` maximize, `Win+Shift+↑` toggle maximize, `Win+Shift+←/→` top quadrants, `Win+Shift+↓` minimize, `Win+↓` restore, `Win+W` close, `Win+Y` toggle Athena quick panel
- **Container-query responsive layouts** — each window's content adapts to the *actual window width* (not the viewport); sidebars collapse into toggleable overlays when narrow
- Z-index focus management, **Alt+Tab** switcher (Shift+Alt+Tab for reverse)
- **Taskbar** with running-app indicators, **Start menu** with app search
- **System tray**: clock, volume slider, notifications bell, DND toggle, mini-calendar
- Desktop right-click **context menu** (New Folder, Change Wallpaper, Animated Background, Refresh) and desktop icons for pinned apps
- **Settings**: light/dark theme, accent color, wallpaper picker, account, notification preferences
- **14 animated backgrounds** (starfield, particle network, matrix rain, neon grid, aurora waves, ocean waves, bubbles, geometric pulse, fireflies, rain, plasma, constellation, bokeh, snowfall) with category tabs + search; rendered on a `<canvas>` overlay with `requestAnimationFrame`, DPR scaling, and cleanup on unmount

### Apps

| # | App | Highlights |
|---|-----|-----------|
| 1 | **Notes** | Markdown editor with live preview, CodeMirror 6 split view, full LaTeX via KaTeX (`$...$` / `$$...$$`), folders, tags, search, debounced auto-save, pin, export to Markdown/PDF |
| 2 | **Tasks** | Kanban board (To Do / In Progress / Done) with drag-and-drop, priority tags, due dates |
| 3 | **File Manager** | Virtual FS: 3-pane layout, folder tree + smart collections (Home/Recent/Starred/All), grid & list views, multi-select, bulk ZIP, copy/cut/paste, drag-drop move & upload, context menus, quick-look panel, storage usage bar |
| 4 | **Code Editor** | CodeMirror 6 with syntax highlighting for 40+ languages, markdown live-preview, debounced auto-save, Ctrl+S, word-wrap, light/dark theme, status bar, dirty-state indicator |
| 5 | **File Viewer** | Image zoom/pan/fit/1:1/fullscreen, PDF iframe, audio & video players, download fallback |
| 6 | **Music Widget** | Compact Spotify overlay polling the active device every 3s, synced lyrics (LRCLIB), click-to-seek, expandable lyrics panel, **Chill mode** fullscreen experience with beat-reactive canvas (Web Audio `AnalyserNode` on captured system audio), spinning vinyl, glow lyrics, spacebar play/pause |
| 7 | **Pomodoro / Focus Timer** | Circular SVG ring, 25/5/15 intervals, auto long-break after 4 sessions, Web Audio chime, auto-DND during focus, daily stats |
| 8 | **Flashcards** | SM-2 spaced repetition, deck browser with color tags, card CRUD, 3D flip-card review, 4-level quality rating, due-date scheduling |
| 9 | **Grade Tracker** | Course management with semester filtering, weighted assignment categories, credit-weighted GPA on 4.0 scale, letter-grade conversion, animated bars |
| 10 | **VUT Studis** | BUT integration: encrypted SSO (AES-256-GCM), Overview / Grades / Timetable / Updates / Web View tabs, HTML parsing with cheerio, "Import to Grade Tracker" |
| 11 | **Settings** | Theme, wallpaper, animated backgrounds, accent, account, notifications, AI provider (key + provider/baseURL/model) |
| 12 | **Study Hub** | AI workflows on the Athena LLM infra: Generate Flashcards, Summarize, Quiz Me, Explain, Study Guide, Syllabus→Tasks, Recent Activity feed |
| 13 | **Calendar / Planner** | Month/week/day views, ICS import/export, task drag-to-schedule, Microsoft Graph sync |
| 14 | **Habits** | Streaks, heatmap, auto-complete from Pomodoro sessions |
| 15 | **Athena assistant** | Streaming chat UI with tool-call chips (SSE), multi-llm-ts backend, system prompt + tool plugins, `Win+Y` quick panel |
| 16 | **Voice Notes** | Microphone recorder (MediaRecorder + Web Audio level meter), Whisper transcription via the OpenAI-compatible API, LLM cleanup pass (punctuation, paragraphs, smart title), saves audio to the virtual FS and creates a linked Note. Also integrated into Quick Capture (`Ctrl+Shift+N` mic button). Degrades gracefully — audio + placeholder note saved even without transcription |

### Integrations

- **Spotify** — server-side token exchange/refresh, device polling, LRCLIB synced lyrics
- **Microsoft Calendar** — Graph API (`Calendar.ReadWrite` + `offline_access`), automatic refresh-token rotation persisted in DB
- **VUT Studis** — full Shibboleth/SAML SSO with cookie jar + session caching (25min TTL)
- **Athena LLM** — multi-llm-ts client supporting `openai | deepseek | anthropic | openrouter | ollama | groq | mistralai | google | xai | meta | cerebras`; per-user config (encrypted in DB) takes priority over server-wide fallback

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite, React 18, TypeScript, Tailwind CSS 3, Zustand, CodeMirror 6, KaTeX |
| Backend | Bun, Hono |
| Database | SQLite via Prisma |
| Auth | JWT |
| Infra | Docker Compose (client on `:5173`, server on `:3001`) |

---

## Quick start (local dev)

```bash
# Install all dependencies
bun install            # root (concurrently)
cd server && bun install && cd ..
cd client && bun install && cd ..

# Set up the database
cd server
ln -sf ../.env .env            # if not already linked
bunx prisma generate
bunx prisma migrate dev        # creates SQLite DB + migration
bun run src/db/seed.ts         # seeds admin/admin + demo data
cd ..

# Run both server + client (from root)
bun run dev
#   server → http://localhost:3001
#   client → http://localhost:5173
```

Open <http://localhost:5173> → boot screen → login with `admin` / `admin`.

---

## Docker

```bash
cp .env.example .env   # fill in Spotify creds if you have them
docker compose up --build
#   server → http://localhost:3001
#   client → http://localhost:5173
```

---

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

---

## Environment variables

See [`.env.example`](.env.example) for the full list. Key ones:

| Variable | Purpose |
|----------|---------|
| `SERVER_PORT` | Server port (default `3001` in dev) |
| `DATABASE_URL` | Prisma SQLite path |
| `JWT_SECRET` | JWT signing secret |
| `SEED_USERNAME` / `SEED_PASSWORD` | Default user created by seed |
| `VITE_API_URL` | Backend URL for client (Vite proxy) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REFRESH_TOKEN` | Spotify integration |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` / `MS_REFRESH_TOKEN` | Microsoft Calendar sync (Graph API) |
| `OPENAI_PROVIDER` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | Athena LLM server-wide fallback (per-user DB config takes priority). All optional — if neither is set, Athena AI is unavailable (no free fallback) |
| `OPENAI_TRANSCRIPTION_MODEL` | Whisper model for Voice Notes transcription (default `whisper-1`). Reuses `OPENAI_API_KEY` / `OPENAI_BASE_URL` (or per-user AiCredential) |

---

## Project structure

```
Athena/
├── docker-compose.yml
├── .env / .env.example
├── docs/screenshots/            # README screenshots
├── server/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts             # Hono app entry
│       ├── db/{client.ts, seed.ts}
│       ├── routes/              # auth, notes, tasks, files, spotify, lyrics,
│       │                        # flashcards, grades, vut, ai, athena, conversations,
│       │                        # study, moodle, calendar, habits, capture, microsoft,
│       │                        # whiteboards, ntfy, voice
│       ├── services/            # spotify, lrclib, jwt, vut, crypto, moodle, microsoft
│       │   ├── athena/          # multi-llm-ts client, system prompt, tool plugins
│       │   └── study/           # source, llm-json, prompts, quiz-store, logSession
│       └── middleware/auth.ts
└── client/
    └── src/
        ├── main.tsx, App.tsx, index.css
        ├── shell/               # BootScreen, LoginScreen, Wallpaper, AnimatedBackground,
        │                        # MusicWidget, ChillView, Desktop, Taskbar, StartMenu,
        │                        # SystemTray, ContextMenu, DesktopEnvironment,
        │                        # CommandPalette (Spotlight), QuickCapture
        ├── wm/                  # Window, WindowLayer, SnapPreview, AltTabSwitcher
        ├── apps/
        │   ├── registry.tsx     # app manifest
        │   ├── notes/ tasks/ files/ editor/ viewer/ pomodoro/
        │   ├── flashcards/ grades/ vut/ athena/ study/
        │   ├── calendar/ habits/ settings/ voice/ whiteboard/ ntfy/
        ├── store/               # Zustand stores (auth, windows, settings, music, notifications)
        ├── services/            # API clients
        └── types/               # shared TS types
```

---

## License

Copyright (C) Athena Student OS contributors.

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License v3** as published by the Free Software Foundation. See [LICENSE](LICENSE) for the full text.

This program is distributed in the hope that it will be useful, but **without any warranty**; without even the implied warranty of merchantability or fitness for a particular purpose.
