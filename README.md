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

## Deploy

### Cloudflare Pages (Recommended)
This project uses Cloudflare Pages with Functions to keep the API key secure on the server-side.

1. Push code to GitHub
2. Create a new project on [Cloudflare Pages](https://pages.cloudflare.com)
3. Connect your GitHub repository
4. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
5. After deployment, add environment variable:
   - Go to Settings > Environment variables
   - Add `GEMINI_API_KEY` = your Gemini API key
6. Add deployed domain to Firebase Console > Authentication > Settings > Authorized domains

The functions in `functions/` directory are automatically deployed with the site.

### Local Development with Wrangler
```bash
npm run preview
```
This builds the project and runs it locally with Wrangler, including the functions.
