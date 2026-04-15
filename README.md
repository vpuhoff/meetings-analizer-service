<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-45b2-6e31a0763ed6" />
</div>

# Meeting Intelligence Analyzer

AI-powered meeting analysis tool that transcribes, summarizes, and extracts key insights from meeting recordings and transcripts.

View your app in AI Studio: https://ai.studio/apps/3e7eda1f-2221-4ec9-ae83-35775c0f5835

## Architecture

- **Frontend**: React + Vite, deployed on Firebase Hosting
- **API**: Cloudflare Worker (`src/worker.ts`), handles Gemini API calls server-side
- **Database**: Firebase Firestore with security rules
- **Auth**: Firebase Authentication (Google provider)

API URL is configured via `VITE_API_BASE_URL` env variable:
- Production (`.env.production`): points to Cloudflare Worker URL
- Local dev: empty string (relative paths, requires separate Worker or proxy)

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env.local` with your Gemini API key:
   ```
   GEMINI_API_KEY=your_key_here
   ```
3. Add `http://localhost:8080` to Firebase Console > Authentication > Settings > Authorized domains
4. Run the app:
   `npm run dev`

> **Note:** API calls will fail locally without a running Worker. For full local testing, run the Worker separately with `npx wrangler dev src/worker.ts` and set `VITE_API_BASE_URL=http://localhost:8787` in `.env.local`.

## Deploy

### Frontend — Firebase Hosting

```bash
npm run build
npx firebase deploy --only hosting --project gen-lang-client-0937773369
```

### API — Cloudflare Worker

```bash
npx wrangler deploy src/worker.ts
```

Then set the API key as a secret:
```bash
echo "your_gemini_api_key" | npx wrangler secret put GEMINI_API_KEY
```

### Firebase Firestore Rules

```bash
firebase deploy --only firestore:rules --project gen-lang-client-0937773369
```

### Add Authorized Domain

After deployment, add your domain to Firebase Console > Authentication > Settings > Authorized domains (e.g. `gen-lang-client-0937773369.web.app`).

## Important Nuances

### Cloudflare Worker Secrets vs Vars

- **Never add `GEMINI_API_KEY` to `vars` in `wrangler.jsonc`** — an empty `vars` entry will override the secret with an empty string, causing "GEMINI_API_KEY not configured" errors.
- Always use `wrangler secret put GEMINI_API_KEY` for sensitive values.
- After running `wrangler deploy`, verify secrets are still in place with `wrangler secret list`. Redeploying the Worker does **not** delete secrets, but adding the key to `vars` will.

### @cloudflare/vite-plugin Issues

- The `@cloudflare/vite-plugin` generates its own `wrangler.json` in `dist/` with `"vars": {}`, which can override wrangler secrets on deploy.
- It also bundles the Worker differently, making secret management unreliable.
- **Recommendation:** Don't use `@cloudflare/vite-plugin`. Deploy the Worker separately via `npx wrangler deploy src/worker.ts`.

### CORS

- The Worker must include CORS headers on all responses since the frontend (Firebase Hosting) and API (Cloudflare Worker) are on different domains.
- The `withCors()` wrapper in `src/worker.ts` adds `Access-Control-Allow-Origin: *` to every response.
- Preflight `OPTIONS` requests are handled separately.

### Firestore: No `undefined` Fields

- Firestore rejects documents containing `undefined` field values with error: `Unsupported field value: undefined`.
- When saving documents, only include optional fields if they have actual values. See `Projects.tsx` for the pattern:
  ```ts
  if (formData.description) {
    projectData.description = formData.description;
  }
  ```

### Firestore Security Rules

- `list` operations require rules at the collection level, not just document level.
- `match /projects/{projectId}` covers `get`/`create`/`update`/`delete` but **not** `list`.
- For `list` queries with `where('userId', '==', ...)`, the rule must verify the query filter matches auth:
  ```
  allow list: if request.auth != null && query.where.userId == request.auth.uid;
  ```
  Or use permissive rules for debugging:
  ```
  allow read: if request.auth != null;
  ```

### Firestore Indexes

- Queries combining `where` and `orderBy` on different fields require composite indexes.
- Defined in `firestore.indexes.json`. Firestore auto-creates some indexes, but complex queries need explicit definitions.

### Firebase Auth Authorized Domains

- Firebase blocks authentication from domains not in the authorized list.
- `localhost` cannot be added as an authorized domain — use `localhost` with the dev server on port 8080 instead.
- After each new deployment domain, add it to Firebase Console > Authentication > Settings > Authorized domains.
