# Smart Prompt Organizer

Stages 1-3: local API (SQLite, versions, full-text search, encrypted write-only key store, provider interface),
the React web app (design system, light/dark/system theme, Dashboard, Library, Collections, Settings),
import/export/backup with duplicate detection, collections, and side-by-side version comparison.

## Run

    npm install
    npm test            # repository + API security tests
    npm run typecheck
    npm run dev         # starts API + web together (Windows: double-click start.bat)

Look for the "Open the app" URL the server prints (it ends in #token=...) and open it in your browser.
To run them separately: `npm run dev:server` and `npm run dev:web`. If the server says the port is
in use, an older copy is still running; stop it first.

Data lives in `~/.smart-prompt-organizer` (override with `PPO_DATA_DIR`). Port: `PPO_PORT` (default 4317).

Try it:

    curl -H "x-session-token: <token>" -H "content-type: application/json" \
      -d '{"title":"Test","content":"Hello"}' http://127.0.0.1:4317/api/prompts

## API (all /api/* except health need the x-session-token header)

GET /api/health · GET/POST /api/prompts (?q, category, favorite, archived, limit, offset) ·
GET/PATCH/DELETE /api/prompts/:id · GET /api/prompts/:id/versions ·
POST /api/prompts/:id/versions/:n/restore · GET/POST /api/projects · GET/PATCH/DELETE /api/projects/:id · POST /api/import (commit=false previews) ·
GET /api/export?format=json|csv · GET /api/secrets · PUT/DELETE /api/secrets/:provider

## Import, export, backup
Import: .txt (one prompt per file), .md (first `# heading` becomes the title), .json (array, or a backup file).
Duplicates = identical text ignoring case and whitespace. Always preview first; commit is all-or-nothing.
Export: JSON backup (all prompts incl. archived, full version history, collections) and CSV (export only;
cells starting with = + - @ get a leading ' so spreadsheets never run them as formulas).

## Not built yet (later stages)
Production build/serving, project progress tracking and prompt relationships (Stage 7), bulk editing existing
prompts (with AI categorization, Stage 4), near-duplicate detection, embeddings and semantic search,
provider adapters (only the interface exists), Prompt Studio, Prompt DNA.
