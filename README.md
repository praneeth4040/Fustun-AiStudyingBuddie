# Fustun AI Assistant

Fustun AI Assistant is a browser extension side-panel UI that integrates with the Gemini API to provide on-page automation, selection summarization, and a chat-style assistant.

This repository contains the extension source (service worker, content scripts, and side-panel UI).

Logo
- The project uses the image at `icons/image.png` as the extension icon in the manifest and UI.

Quick structure
- `manifest.json` — Chrome extension manifest v3
- `src/` — extension source code (background, content scripts, services, ui)
- `icons/` — icon assets (includes `image.png`)

How to run locally
1. Load the extension in Chrome/Edge/Brave:
   - Open chrome://extensions
   - Enable Developer mode
   - Click "Load unpacked" and select this repository folder

2. The side panel will be available under the extension action; the extension uses `src/ui/panel.html`.

Security
- Keep your Gemini API key out of the repository. If you need to configure keys locally, use an environment loader or Chrome extension secrets that are not committed. See `src/services/config.js` for where keys are read.

Contributing
- Please read `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` before opening issues or PRs.

License
- This project is released under the MIT License — see `LICENSE`.

Contact
- For questions, open an issue or create a pull request.
