# Smart Prompt Organizer

Stage 1 (foundation): local API, SQLite storage with version history and full-text search,
encrypted write-only API-key store, and the AI provider interface.

## Run

    npm install
    npm test            # repository + API security tests
    npm run typecheck
    npm run dev:server  # prints a per-launch session token

Data lives in `~/.smart-prompt-organizer` (override with `PPO_DATA_DIR`). Port: `PPO_PORT` (default 4317).

Try it:

    curl -H "x-session-token: <token>" -H "content-type: application/json" \
      -d '{"title":"Test","content":"Hello"}' http://127.0.0.1:4317/api/prompts

## API (all /api/* except health need the x-session-token header)

GET /api/health · GET/POST /api/prompts (?q, category, favorite, archived, limit, offset) ·
GET/PATCH/DELETE /api/prompts/:id · GET /api/prompts/:id/versions ·
POST /api/prompts/:id/versions/:n/restore · GET /api/secrets · PUT/DELETE /api/secrets/:provider

## Not built yet (later stages)
Web UI, categories/collections/projects endpoints, import/export, embeddings and semantic search,
provider adapters (only the interface exists), Prompt Studio, Prompt DNA.
