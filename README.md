# Xmanius

General-purpose AI website with a static landing page, chat interface, voice modal, and Vercel serverless AI endpoint.

## Android app wrapper

This project can be opened as an Android app with Capacitor. The existing website remains the source of the app UI; no HTML, CSS, or JavaScript page has been moved into a framework. The `www/` directory is the packaged copy used by Android.

```text
npm install
npx cap add android
npm run cap:sync
npm run cap:open
```

After changing the website, refresh the Android bundle with:

```text
Copy-Item index.html,xmanius-ai.html,xmanius-chat.html -Destination www -Force
Copy-Item css\*.css -Destination www\css -Force
Copy-Item js\*.js -Destination www\js -Force
npm run cap:sync
```

Build a debug APK from Android Studio, or run `npm run android:debug` after Android Studio and the Android SDK are installed.

The bundled app can display the website locally. Gemini requests still need a deployed backend URL because Vercel serverless functions do not execute inside an APK. Configure that connection before testing AI responses in the installed app.

## Project structure

```text
index.html                 GitHub Pages and Vercel entry point
xmanius-ai.html            Landing page alias
xmanius-chat.html          Chat interface
css/                       Page styles and shared advanced assistant styles
js/                        Page behavior and chat interactions
api/xmanius-chat.js        General AI serverless function
vercel.json                Vercel URL configuration
```

## Vercel

Add this environment variable in the Vercel project settings. Do not commit the real key:

```text
XMANIUS_GEMINI_API_KEY=your_separate_gemini_key
XMANIUS_GEMINI_MODEL=gemini-3.6-flash
XMANIUS_GEMINI_API_KEY_2=your_second_gemini_key
XMANIUS_GEMINI_MODEL_2=gemini-3.6-flash
# Optional, required only for the Web button:
XMANIUS_GOOGLE_SEARCH_API_KEY=your_google_search_key
XMANIUS_GOOGLE_SEARCH_CX=your_programmable_search_engine_id
XMANIUS_YOUTUBE_API_KEY=your_youtube_data_api_key
```

Deploy from this repository root. Vercel automatically detects `api/xmanius-chat.js` as a serverless function.

The Web button uses Google’s server-side Custom Search JSON API when both optional variables are configured. Google requires both an API key and a Programmable Search Engine ID; without them, Xmanius remains a normal Gemini chat and does not expose any key in the browser.

YouTube requests use the YouTube Data API search endpoint so the app receives real video IDs and thumbnails for embedded previews. Set `XMANIUS_YOUTUBE_API_KEY` to a Google Cloud API key with YouTube Data API v3 enabled, or reuse the Google search key if that API is enabled on the same project.

Xmanius 1 and Xmanius 2 both use Gemini, but each uses a separate API key. Add both Gemini keys to Vercel; the selected model determines which server-side key is used.

## GitHub Pages

GitHub Pages serves the static landing page and chat UI, but it cannot run the server-side `api/` function or safely store a Gemini API key. The UI will still load, and local answers/voice controls work; deploy on Vercel (or another serverless host) for Gemini-powered answers.
