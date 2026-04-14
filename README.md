<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3e7eda1f-2221-4ec9-ae83-35775c0f5835

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Add `http://localhost:8080` to Firebase Console > Authentication > Settings > Authorized domains
3. Run the app:
   `npm run dev`

Note: For local development with API functions, you'll need to run the functions separately or use a proxy. The app is designed for Cloudflare Pages Functions deployment.

## Deploy

### Cloudflare Pages Functions (Recommended)
This project uses Cloudflare Pages Functions to keep the API key secure on the server-side.

1. Push code to GitHub
2. Create a new project on [Cloudflare Pages](https://pages.cloudflare.com)
3. Connect your GitHub repository
4. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
5. After deployment, add environment variable:
   - Go to Settings > Functions > Environment variables
   - Add `GEMINI_API_KEY` = your Gemini API key
6. Add deployed domain to Firebase Console > Authentication > Authorized domains

### Vercel
1. Push code to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add `GEMINI_API_KEY` in Environment Variables
4. Create Vercel API Routes (similar to Cloudflare Functions) or use Vercel Functions
5. Add deployed domain to Firebase Console > Authentication > Authorized domains

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase deploy
```
Note: Firebase Hosting requires Firebase Functions for server-side API keys. This project is configured for Cloudflare Pages Functions.
