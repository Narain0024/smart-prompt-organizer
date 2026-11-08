# Stage 4 – local AI (Ollama): suggest on save, meaning search, similar prompts

Everything runs on your computer. Nothing is sent anywhere except your own Ollama (the address must be on this machine).
AI is OFF until you turn it on in Settings, and the whole app works without it.

## 0. Before you start
- Back up your verified Stage 3.1 folder (zip it) and keep your exported JSON.
- Install Ollama (ollama.com) and start it, then in a terminal:
  `ollama pull llama3.2`          (chat, about 2 GB)
  `ollama pull nomic-embed-text`  (embeddings, about 0.3 GB)

## 1. Install the files
1. Extract this zip somewhere.
2. Copy everything inside it into your project root (the folder with package.json), choosing "Replace" when asked.
   Replaced files are ones I own and you did not change: web `api.ts`, `main.tsx`, `Editor`, `ImportModal`, `Library`,
   `Settings`, `Dashboard`, and server `providers/types.ts`. Everything else is new.
3. In the project root run:  `node apply-stage4.mjs`
   It makes four tiny edits to files you already have (`shared/src/index.ts`, `server/src/db.ts`, `repo.ts`, `app.ts`),
   keeps a `.bak-stage4` copy of each, and is safe to run twice. If it says CANNOT FIND, stop and send me its output.
4. No new npm packages are needed, so do NOT run `npm install` for this stage.

## 2. Check it
    npm test            (expect about 78 tests: 65 server, 13 web)
    npm run typecheck
    npm run dev

## 3. Try it in the browser
1. Settings > Local AI: tick "Turn on local AI features", Save. Status should show Ollama reachable and both models installed.
2. Press "Build or update index" and watch the progress.
3. My Prompts: search in plain words ("the one about tracking spending"). Compare "Meaning only" and "Keyword only".
4. New prompt: type a prompt, leave title/category/tags empty, Save. A review screen should appear; untick something, save.
5. Press "Similar" on a card.
6. Stop Ollama and try again: saving should still work (with a notice) and search should fall back to keywords.
