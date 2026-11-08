# Smart Prompt Organizer

A local-first app for saving, organizing and finding your AI prompts. Your prompts live in a SQLite database on your own computer, with version history, collections, import/export, and optional on-device AI search powered by [Ollama](https://ollama.com). No account, no cloud, nothing leaves your machine.

## Features

- **Prompt library** with categories, tags, favorites, archive and full-text search
- **Version history** for every prompt, with side-by-side comparison and one-click restore
- **Projects and collections** to group related prompts
- **Import** from `.txt`, `.md` and `.json` with a preview step and duplicate detection
- **Export and backup** to JSON (full history) or CSV
- **Dashboard** with library totals and your favorite prompts
- **Light, dark and system themes**
- **Local AI (optional, off by default):**
  - suggests a title, category and tags when you save a prompt
  - searches by meaning, not just keywords (hybrid, meaning-only or keyword-only)
  - finds prompts similar to the one you are viewing
- **Private by design:** the API only listens on `127.0.0.1`, every call needs a per-session token, API keys are stored encrypted and are write-only, and the AI address must be on your own machine

## Tech stack

| Layer | Tools |
| --- | --- |
| Web app | React 18, TypeScript, Vite, TanStack Query |
| API | Node.js 20+, Fastify 5, Zod |
| Storage | SQLite (better-sqlite3) |
| Local AI | Ollama (`llama3.2` for chat, `nomic-embed-text` for embeddings) |
| Tests | Vitest (78 tests: 65 server, 13 web) |
| Layout | npm workspaces monorepo: `apps/server`, `apps/web`, `packages/shared` |

## Getting started

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/<your-username>/smart-prompt-organizer.git
cd smart-prompt-organizer
npm install
npm run dev
```

On Windows you can double-click `start.bat` instead of running `npm run dev`.

The server prints an **"Open the app"** link ending in `#token=...`. Open that link in your browser. To run the two halves separately, use `npm run dev:server` and `npm run dev:web`. If the server says the port is in use, an older copy is still running, so stop it first.

Data is stored in `~/.smart-prompt-organizer`. Set `PPO_DATA_DIR` to change the folder and `PPO_PORT` to change the port (default `4317`).

```bash
npm test             # server and web tests
npm run typecheck
```

## Local AI with Ollama

AI features are optional. The whole app works without them.

1. Install and start Ollama, then pull the two models:
   ```bash
   ollama pull llama3.2
   ollama pull nomic-embed-text
   ```
2. In the app, open **Settings → Local AI**, turn it on and save. The status line should show Ollama reachable and both models installed.
3. Press **Build or update index** once so existing prompts become searchable by meaning.
4. Search in plain words, such as "the one about tracking spending", or press **Similar** on any prompt card.

If Ollama is stopped, saving still works and search falls back to keywords. More detail is in [docs/stage4-ollama.md](docs/stage4-ollama.md).

## API

All `/api/*` routes except health need the `x-session-token` header.

| Area | Routes |
| --- | --- |
| Prompts | `GET/POST /api/prompts` (query: `q`, `category`, `favorite`, `archived`, `limit`, `offset`), `GET/PATCH/DELETE /api/prompts/:id` |
| Versions | `GET /api/prompts/:id/versions`, `POST /api/prompts/:id/versions/:n/restore` |
| Projects | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` |
| Import / export | `POST /api/import` (`commit=false` previews), `GET /api/export?format=json\|csv` |
| Secrets | `GET /api/secrets`, `PUT/DELETE /api/secrets/:provider` |
| Search | `GET /api/search?q=...&mode=keyword\|meaning\|hybrid` |
| Local AI | `GET/PUT /api/ai/settings`, `GET /api/ai/status`, `POST /api/ai/suggest`, `POST /api/ai/index/run` |
| Health | `GET /api/health` |

```bash
curl -H "x-session-token: <token>" -H "content-type: application/json" \
  -d '{"title":"Test","content":"Hello"}' http://127.0.0.1:4317/api/prompts
```

## Import, export and backup

- **Import:** `.txt` (one prompt per file), `.md` (the first `# heading` becomes the title) and `.json` (an array, or a backup file). Duplicates are prompts with identical text, ignoring case and whitespace. Import always previews first, and a commit is all-or-nothing.
- **Export:** a JSON backup holds all prompts including archived ones, full version history and collections. CSV is export-only, and cells starting with `=`, `+`, `-` or `@` get a leading `'` so spreadsheets never run them as formulas.

## Project structure

```
apps/
  server/     Fastify API, SQLite repository, importers, exporter, Ollama integration
  web/        React app: pages, components, theme, API client
packages/
  shared/     Types and validation schemas shared by both apps
scripts/      dev runner that starts API and web together
docs/         Stage notes
```

## How it was built

The project was built in stages, and each one is a commit and a git tag (`stage-1` through `stage-4`), so you can browse how it grew.

| Tag | What was added |
| --- | --- |
| `stage-1` | Local API: SQLite, versions, full-text search, encrypted write-only key store, provider interface |
| `stage-2` | React web app: design system, light/dark/system theme, Dashboard, Library, Settings |
| `stage-3` | Import, export, backup, duplicate detection, collections, version comparison |
| `stage-3.1` | Fixes to the importers and styling |
| `stage-4` | Local AI with Ollama: suggestions on save, meaning search, similar prompts |

## Roadmap

Not built yet: a production build, project progress tracking and prompt relationships, AI-assisted bulk editing of existing prompts, adapters for hosted AI providers (only the interface exists), Prompt Studio and Prompt DNA.

## License

[MIT](LICENSE)
