# Local Meeting Scribe

Portfolio-ready static app for local meeting transcription and AI-style minutes.

## What it does

- uploads audio or video in the browser
- records quick mic samples
- runs local Whisper transcription with `transformers.js`
- generates meeting minutes with summary, decisions, next steps, and risks

## Project layout

- `app/`: the GitHub Pages site
- `.github/workflows/deploy-pages.yml`: automatic Pages deployment from `main`

## Publish to GitHub Pages

1. Create a new GitHub repository.
2. Upload the contents of this folder to that repository.
3. Push to the `main` branch.
4. In GitHub, open `Settings` -> `Pages`.
5. Under `Build and deployment`, set `Source` to `GitHub Actions`.
6. Wait for the `Deploy GitHub Pages` workflow to finish.

Your public URL will be:

- `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/`

## Local preview

```bash
cd /Users/irenefu/Documents/Codex/2026-04-16-can-you-produce-an-app-with/app
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

## Notes

- The first transcription run downloads the Whisper model in the browser.
- For demo purposes, shorter recordings give the smoothest experience.
- Browser decoding support varies by format, so WAV, MP3, and M4A are the safest options.
