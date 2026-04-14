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
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Add `http://localhost:8080` to Firebase Console > Authentication > Settings > Authorized domains
4. Run the app:
   `npm run dev`

## Deploy

### Vercel (Recommended)
1. Push code to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add `GEMINI_API_KEY` in Environment Variables
4. Add deployed domain to Firebase Console > Authentication > Authorized domains

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase deploy
```
Note: This project uses static hosting. The `firebase.json` is already configured. Add `GEMINI_API_KEY` to `.env.local` for local development or use environment variables in Firebase Console.
