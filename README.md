# Claude Jarvis-like Starter (Claudecode)

This repository contains a completed starter app that implements a Jarvis-like UI for Claude Pro.
It includes:

- Web frontend (React) with a three.js globe avatar, push-to-talk (hold-to-talk), and a results panel.
- Backend (Node/Express) that: accepts audio uploads, runs local Whisper (whisper.cpp) for STT, optionally performs Bing Web Search, calls Anthropic Claude Pro with a persona + JSON output schema, and produces TTS audio via Coqui TTS (CLI) or browser fallback.

Branch: claude-jarvis-complete

Important: This commit does NOT include any API keys. Configure keys in server/.env based on server/.env.example.

Quick start (Linux recommended):

1) Clone and checkout branch:
   git clone git@github.com:ibernard26/Claudecode.git
   cd Claudecode
   git checkout -b claude-jarvis-complete origin/claude-jarvis-complete || git checkout -b claude-jarvis-complete

2) Server setup (requires Node.js 18+):
   cd server
   cp .env.example .env
   # Edit .env to set ANTHROPIC_API_KEY, BING_API_KEY, WHISPER_CPP_PATH, WHISPER_MODEL_PATH if applicable
   npm install

   # Install whisper.cpp (see README for instructions) and download a model; set WHISPER_CPP_PATH and WHISPER_MODEL_PATH in .env.

   npm run dev

3) Client setup:
   cd ../client
   npm install
   npm start

4) Open http://localhost:3000 and press-and-hold the "Hold to Talk" button.

Notes & troubleshooting
- STT: This scaffold uses whisper.cpp (local) if WHISPER_CPP_PATH and WHISPER_MODEL_PATH are set in .env, otherwise it falls back to an instructive error message. See server/README-whisper.md for installation hints.
- TTS: By default the server will try to use the Coqui TTS CLI if available (env COQUI_TTS_CLI true). If not available, the client uses browser speechSynthesis fallback for playback.
- Search: If BING_API_KEY is set in .env, the server will perform a Bing Web Search for queries and include summarized results in the prompt to Claude.

Security & privacy
- Local STT/TTS keeps audio on your machine. If you enable hosted STT/TTS or hosted search, audio/text may be sent to third-party services.

If anything fails during run, open an issue or ask me here and I'll walk through debugging steps.
