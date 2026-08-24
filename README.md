# Xmanius

General-purpose AI website with a static landing page, chat interface, voice modal, and Vercel serverless AI endpoint.

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
```

Deploy from this repository root. Vercel automatically detects `api/xmanius-chat.js` as a serverless function.

## GitHub Pages

GitHub Pages serves the static landing page and chat UI, but it cannot run the server-side `api/` function or safely store a Gemini API key. The UI will still load, and local answers/voice controls work; deploy on Vercel (or another serverless host) for Gemini-powered answers.
