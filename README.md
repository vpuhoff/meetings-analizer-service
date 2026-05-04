# Meeting Intelligence Analyzer

AI-powered meeting analysis platform that transcribes, summarizes, and extracts insights from meeting recordings and transcripts — and builds a searchable corporate Knowledge Base connected to OpenAI Assistants.

---

## Features

- **Multi-file upload** — audio (mp3, wav, m4a, webm, ogg) and text transcripts (txt, md)
- **AI transcription & analysis** via Google Gemini: executive summary, action items, decisions log, tech details, blockers
- **Re-analysis with feedback** ("Spot an error") — refine the report without re-uploading files
- **Export to Markdown** — download a formatted report
- **Save to Knowledge Base** — one-click generation of a structured KB document with Meeting Recap, Decisions, Action Items and rich metadata (systems, topics) powered by a dedicated LLM prompt
- **Knowledge Base** — AG Grid table with sortable/filterable columns, view modal (read-only MDXEditor) and edit modal (full MDXEditor with toolbar)
- **Push to OpenAI** — sync any KB document to an OpenAI Vector Store directly from the Knowledge Base grid; status tracked per document (`out_of_sync` → `pending` → `synced` / `failed`)
- **Projects** — create and manage project contexts (name, description, context/glossary, team); each project can be linked to an **OpenAI Vector Store** (`openai_vector_store_id`)
- **Create Vector Store** — button in project settings that calls the OpenAI API and auto-fills the Vector Store ID
- **Ask AI** — project-based streaming chat powered by OpenAI Assistants API; each project tab shows its own thread history; new threads automatically attach the project's Vector Store for file search
- **Meeting History** — browse past meetings, reopen any report; KB-synced meetings are highlighted
- **User Settings** — profile modal with OpenAI API key, OpenAI Assistant ID, and auto-save preferences (stored in Firestore per user)
- **Google Authentication** — all data is isolated per user

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite, Tailwind CSS, AG Grid Community, MDXEditor, react-markdown |
| Hosting | Firebase Hosting |
| API | Cloudflare Worker (`src/worker.ts`) |
| AI | Google Gemini (transcription + analysis + KB generation) |
| OpenAI | Assistants API v2 (file search, streaming runs, Vector Stores) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Google provider) |

### API URL

Configured via `VITE_API_BASE_URL` env variable:
- **Production** (`.env.production`): Cloudflare Worker URL
- **Local dev**: empty string — requires Worker running separately

### Worker Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/analyze` | Meeting analysis via Gemini |
| `POST /api/transcribe` | Audio transcription via Gemini |
| `POST /api/question` | Q&A on a meeting transcript |
| `POST /api/markdown` | Convert analysis to Markdown |
| `POST /api/kb/sync` | Upload KB doc to OpenAI file, attach to Vector Store, poll until processed |
| `POST /api/assistant` | Create/reuse OpenAI thread, stream assistant run (SSE); returns `X-Thread-Id` header |

### Firestore Collections

| Collection | Description |
|-----------|-------------|
| `meetings` | Meeting metadata (title, tags, timestamps) |
| `meetings/{id}/versions` | Re-analysis history per meeting |
| `projects` | Project contexts; includes `openai_vector_store_id` |
| `userSettings` | Per-user settings (OpenAI API key, Assistant ID, preferences) |
| `knowledge_base` | KB documents with sync status and `openai_file_id` |
| `chat_threads` | Chat thread history per user per project |

### Data Structures

```typescript
interface KBDocument {
  id: string;
  userId: string;
  meeting_id: string;
  project_id: string;
  title: string;
  content: string;          // Markdown
  systems: string[];
  topics: string[];
  sync_status: 'synced' | 'pending' | 'out_of_sync' | 'failed';
  openai_file_id: string | null;
  last_synced_at?: number;
  created_at: number;
  updated_at: number;
}

interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  context?: string;
  team?: string;
  openai_vector_store_id?: string;  // links to OpenAI Vector Store
  createdAt: string;
  updatedAt: string;
}

interface ChatThread {
  id: string;
  userId: string;
  project_id: string;
  openai_thread_id: string;   // OpenAI thread ID
  title: string;              // first 60 chars of first message
  created_at: number;
  updated_at: number;
}

interface UserSettings {
  userId: string;
  openaiApiKey?: string;
  openaiAssistantId?: string; // asst_xxx — used for Ask AI
  autoSaveToIndex?: boolean;
  updatedAt: string;
}
```

---

## Navigation

The app uses a global tab bar:

| Tab | Description |
|-----|-------------|
| **New Extract** | Upload files, analyze, view report, save to KB |
| **Meeting History** | Browse and reopen past meeting reports; KB badge on synced meetings |
| **Projects** | Manage project contexts; link Vector Store; create Vector Store via API |
| **Ask AI** | Streaming chat via OpenAI Assistants, per-project tabs, thread history sidebar |
| **Knowledge Base** | AG Grid of all KB documents; push individual docs to OpenAI Vector Store |

---

## Run Locally

**Prerequisites:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Configure env
cp .env.example .env.local
# Set VITE_API_BASE_URL=http://localhost:8787 for local Worker

# 3. Add http://localhost:8080 to Firebase Console > Authentication > Authorized domains

# 4. Start dev server
npm run dev
```

> For full local testing, run the Worker in a separate terminal:
> ```bash
> npx wrangler dev src/worker.ts
> ```
> Then set `VITE_API_BASE_URL=http://localhost:8787` in `.env.local`.

---

## Deploy

Use the `Makefile` shortcuts:

```bash
make deploy-all        # Worker + Frontend + Firestore rules
make deploy-worker     # Cloudflare Worker only
make deploy-frontend   # Firebase Hosting only
make deploy-firestore  # Firestore security rules only
```

### Manual steps

```bash
# Frontend
npm run build
npx firebase deploy --only hosting --project gen-lang-client-0937773369

# Worker
npx wrangler deploy src/worker.ts

# Gemini API key (set once, survives redeploys)
echo "your_key" | npx wrangler secret put GEMINI_API_KEY

# Firestore rules
npx firebase deploy --only firestore:rules --project gen-lang-client-0937773369
```

After first deploy: add your domain to **Firebase Console → Authentication → Authorized domains**.

---

## Important Notes

### Cloudflare Worker Secrets

- **Never** add `GEMINI_API_KEY` to `vars` in `wrangler.jsonc` — it overrides the secret with an empty string.
- Always use `wrangler secret put GEMINI_API_KEY`.
- Verify after deploy: `wrangler secret list`.

### @cloudflare/vite-plugin

- Generates its own `wrangler.json` in `dist/` with `"vars": {}`, which can override secrets.
- **Do not use it for Worker deployment.** Deploy the Worker separately via `npx wrangler deploy src/worker.ts`.

### Ask AI Setup

1. Open **Profile & Settings** → add your **OpenAI API Key** (`sk-...`) and **OpenAI Assistant ID** (`asst_...`).
2. In **Projects**, add the **Vector Store ID** (`vs_...`) for the relevant project, or click **+ Create** to generate one via the API.
3. Go to **Knowledge Base** and click the sync button on each document to push it to the Vector Store.
4. Open **Ask AI** → select the project tab → start chatting. The first message creates a new thread with the Vector Store attached for file search.

> The frontend passes `openai_api_key` and `assistant_id` directly to the Worker per request — no server-side secrets needed for OpenAI.

### CORS

- The Worker adds `Access-Control-Allow-Origin: *` via `withCors()` on all responses.
- `OPTIONS` preflight requests are handled explicitly.
- The `X-Thread-Id` response header is exposed via `Access-Control-Expose-Headers` so the browser can read it cross-origin.

### Firestore: No `undefined` Fields

- Firestore rejects documents with `undefined` values. Use conditional field assignment:
  ```ts
  if (formData.description) projectData.description = formData.description;
  ```

### Firestore Security Rules

- `list` operations require collection-level rules, not just document-level.
- Composite queries (`where` + `orderBy`) require indexes defined in `firestore.indexes.json`.

### AG Grid CSS

- AG Grid requires explicit CSS imports — without them columns render as a vertical list:
  ```ts
  import 'ag-grid-community/styles/ag-grid.css';
  import 'ag-grid-community/styles/ag-theme-alpine.css';
  ```
- Apply the theme class on the wrapper div: `className="ag-theme-alpine"`.
