# Etsy Listing Studio (Windows desktop)

Local-first Electron + React + TypeScript starter for preparing digital product folders as Etsy draft listings.

## Current features

- Select a local product folder and scan supported image/download files.
- Detect `main.png` preferentially; otherwise use the first supported image, which you can change by renaming the file.
- Preview images and list up to 20 mockups.
- Generate title, description, 30 keyword candidates and 13 tag selections using a vision-capable AI API.
- Edit content, tags, price and Etsy taxonomy ID before upload.
- Etsy OAuth PKCE flow scaffold, token refresh, draft creation, image uploads and digital-file upload.
- Local upload history and duplicate guard based on file names and sizes.
- Retry transient API errors and persist upload progress/results.
- Windows installer packaging via Electron Builder.

## Requirements

- Windows 10/11 x64
- Node.js LTS (includes npm)
- Git (recommended)
- An AI API key with vision-model access
- Etsy developer app credentials and a shop authorized for API access

## Run in development

1. Extract this folder somewhere simple, for example `C:\Projects\etsy-listing-automation`.
2. Install Node.js LTS from https://nodejs.org/ and restart PowerShell.
3. Open PowerShell in this project directory.
4. Run:

   ```powershell
   npm install
   ```

5. Configure your free-tier-eligible Gemini API key in the same PowerShell session before starting the app:

   ```powershell
   $env:GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"
   $env:GEMINI_VISION_MODEL = "gemini-2.5-flash"
   npm run dev
   ```

   Do not commit API keys to source control. For a persistent setup, configure a user-level Windows environment variable and restart the app.

## Build Windows installer

```powershell
npm install
npm run build
```

The installer should be written to `release/` after a successful build on Windows.

## Connect Etsy

1. Create a seller app at https://developers.etsy.com/.
2. Read Etsy's current OAuth and redirect URI requirements. This starter uses a loopback callback on `http://127.0.0.1:42817/callback`; Etsy must accept/register that redirect URI for your app before the connection will work. If Etsy does not permit loopback redirects for your app, adapt the callback to an approved URI before live use.
3. Open Settings in the app, enter the Etsy API key/keystring and shared secret, then click **Connect Etsy shop**.
4. Complete Etsy authorization in the browser.
5. Enter your numeric shop ID and the correct Etsy taxonomy ID in the review screen before uploading.

## Product folder convention

```text
My Product/
  main.png        # product image and default digital download
  mockup-01.jpg
  mockup-02.jpg
  mockup-03.jpg
```

`main.png` is preferred when present. If absent, the first supported image is used. The first 20 images excluding the selected main file are offered as listing mockups; Etsy supports a maximum of 20 listing images, so use no more than 20 images total if your main PNG is also intended to be a listing photo.

## Important implementation notes before live use

- This is a starter implementation, not a verified production integration. Test against your own authorized shop with one low-risk draft before relying on it for bulk work.
- Etsy may require additional fields and/or a different accepted form encoding depending on current API schema. Verify listing creation, image upload, digital-file upload and taxonomy requirements against Etsy's current API docs.
- The UI currently requires a numeric taxonomy ID. A production-ready version should call Etsy taxonomy endpoints and provide a searchable category picker.
- The current OAuth callback port must match Etsy's permitted redirect configuration. Check the Developer Portal before attempting authorization.
- The duplicate fingerprint hashes supported file contents and filenames. If a create request times out before Etsy returns an ID, reconcile the request against Etsy before retrying; API calls are not assumed to be idempotent.
- Etsy limits listings to 13 tags. The AI creates 30 candidates, but only the selected 13 are sent.
- Etsy instant-download files are subject to current file count and per-file size limits. Validate the actual product file before upload.
- AI calls transmit the main image and seller notes to the configured model provider. Do not include private or customer data in those inputs.
- This first scaffold uses a JSON local record store for portability. Before production bulk processing, consider migrating records to SQLite and using a transactional upload queue.

## Security

- Electron runs with context isolation and Node integration disabled in the renderer.
- File access and API operations are exposed through a narrow preload bridge.
- Etsy credentials and tokens are encrypted with Electron `safeStorage` on supported Windows installations.
- The AI key is read from the process environment and is not saved by the application.

## Main stack

- Electron
- React + TypeScript + Vite
- Node.js
- Gemini SDK (vision-capable chat completions)
- Zod validation
- Etsy Open API v3


## Automatic updates (GitHub Releases)

This project includes `electron-updater` wiring for packaged Windows builds. In `package.json`, replace `YOUR_GITHUB_USERNAME` with your GitHub username (and change the repo value if needed). The repository configured under `build.publish` must match the GitHub repository where releases are published.

Important setup notes:
- Automatic updates do not work from `npm run dev`; install the packaged NSIS Windows installer first.
- Publish a GitHub Release with a version newer than the installed app. Build the installer with `npm run build`; electron-builder should generate the NSIS installer and update metadata (`latest.yml` plus installer/blockmap files) in `release/`. Upload all generated release assets to the GitHub Release.
- Bump the `version` in `package.json` for every release (for example `0.2.1`, then `0.2.2`).
- Keep API keys, tokens, `.env` files, and local databases out of GitHub. Do not commit secrets. This updater configuration is easiest with a public GitHub repository/releases. A private repo requires a different secure update access strategy and should not embed a GitHub token in the app.
- Update events and controls appear under Settings → Application updates.
- Verify update installation on a separate test Windows account or test machine before relying on it.
