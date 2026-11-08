# Smart Prompt Organizer

Stages 1-2: local API (SQLite, versions, full-text search, encrypted write-only key store, provider interface)
and the React web app (design system, light/dark/system theme, Dashboard, Library, Settings).

## Run

    npm install
    npm test            # repository + API security tests
    npm run typecheck
    npm run dev:server  # terminal 1: prints an "Open the app" URL with a per-launch token
    npm run dev:web     # terminal 2: then open that URL in your browser

Data lives in `~/.smart-prompt-organizer` (override with `PPO_DATA_DIR`). Port: `PPO_PORT` (default 4317).

Try it:

    curl -H "x-session-token: <token>" -H "content-type: application/json" \
      -d '{"title":"Test","content":"Hello"}' http://127.0.0.1:4317/api/prompts

## API (all /api/* except health need the x-session-token header)

GET /api/health · GET/POST /api/prompts (?q, category, favorite, archived, limit, offset) ·
GET/PATCH/DELETE /api/prompts/:id · GET /api/prompts/:id/versions ·
POST /api/prompts/:id/versions/:n/restore · GET /api/secrets · PUT/DELETE /api/secrets/:provider

## Not built yet (later stages)
Production build/serving, categories/collections/projects endpoints, import/export, embeddings and semantic search,
provider adapters (only the interface exists), Prompt Studio, Prompt DNA.
