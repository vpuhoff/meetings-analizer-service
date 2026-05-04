# Meeting Intelligence Analyzer

AI-powered meeting analysis platform that transcribes, summarizes, and extracts insights from meeting recordings and transcripts — and builds a searchable corporate Knowledge Base from them.

**Live app:** https://gen-lang-client-0937773369.web.app

---

## Features

- **Multi-file upload** — audio (mp3, wav, m4a, webm, ogg) and text transcripts (txt, md)
- **AI transcription & analysis** via Google Gemini: executive summary, action items, decisions log, tech details, blockers
- **Re-analysis with feedback** ("Spot an error") — refine the report without re-uploading files
- **Export to Markdown** — download a formatted report
- **Save to Knowledge Base** — one-click generation of a structured KB document with Meeting Recap, Decisions, Action Items and rich metadata (systems, topics) powered by a dedicated LLM prompt
- **Knowledge Base** — AG Grid table with sortable/filterable columns, view modal (read-only MDXEditor) and edit modal (full MDXEditor with toolbar)
- **Projects** — create and manage project contexts (name, context/glossary, team) that enrich analysis and KB generation
- **Meeting History** — browse past meetings, reopen any report
- **User Settings** — profile modal with OpenAI API key and auto-save preferences (stored in Firestore per user)
- **Google Authentication** — all data is isolated per user

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite, Tailwind CSS, AG Grid Community, MDXEditor |
| Hosting | Firebase Hosting |
| API | Cloudflare Worker (`src/worker.ts`) |
| AI | Google Gemini (transcription + analysis + KB generation) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Google provider) |

### API URL

Configured via `VITE_API_BASE_URL` env variable:
- **Production** (`.env.production`): Cloudflare Worker URL
- **Local dev**: empty string — requires Worker running separately

### Firestore Collections

| Collection | Description |
|-----------|-------------|
| `meetings` | Meeting metadata (title, tags, timestamps) |
| `meetings/{id}/versions` | Re-analysis history per meeting |
| `projects` | Project contexts with name, context, team |
| `userSettings` | Per-user settings (OpenAI key, preferences) |
| `knowledge_base` | KB documents with systems/topics tags and sync status |

### KB Document Structure

```typescript
interface KBDocument {
  id: string;
  userId: string;
  meeting_id: string;       // links back to original meeting
  project_id: string;
  project_name?: string;
  title: string;
  content: string;          // Markdown (Executive Summary, Meeting Recap, Decisions, Action Items, Tech Details, Blockers)
  systems: string[];        // e.g. ["Jenkins", "OneWork"]
  topics: string[];         // e.g. ["503 errors", "Authorization"]
  sync_status: 'synced' | 'pending' | 'out_of_sync';
  openai_file_id: string | null;
  created_at: number;
  updated_at: number;
}
```

---

## Navigation

The app uses a global tab bar:

| Tab | Description |
|-----|-------------|
| **New Extract** | Upload files, analyze, view report, save to KB |
| **Meeting History** | Browse and reopen past meeting reports |
| **Projects** | Manage project contexts |
| **Ask AI** | *(Coming soon)* Q&A across all meetings via OpenAI Assistants |
| **Knowledge Base** | AG Grid table of all KB documents with view/edit modals |

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

### CORS

- The Worker adds `Access-Control-Allow-Origin: *` via `withCors()` on all responses.
- `OPTIONS` preflight requests are handled explicitly.

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
