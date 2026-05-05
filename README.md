<div align="center">

  # AppFiller

  A browser extension that fills job and accelerator applications using your profile and Claude AI.<br>
  Add your profile once. Fill any form in seconds.

  ![Platform](https://img.shields.io/badge/platform-Safari%20%7C%20Chrome-black?style=flat-square)
  ![TypeScript](https://img.shields.io/badge/typescript-5.7-blue?style=flat-square)
  ![License](https://img.shields.io/badge/license-MIT-orange?style=flat-square)

</div>

---

## Features

- Detects text inputs, textareas, selects, contenteditable, shadow DOM, and cross-origin iframes
- Two modes: Job (personal profile) and Accelerator (personal + startup profile)
- Claude Opus 4.7 writes answers in Naval Ravikant's voice — short, confident, no filler
- Respects word and character limits found on the page
- Skips fields that are already filled

## Requirements

- Safari 15+ or Chrome 120+
- Anthropic API key
- Bun or Node.js (to build from source)

## Installation

```bash
git clone https://github.com/infinityp913/application-filler.git
cd application-filler
bun install
```

**Safari:**
```bash
bun run build:safari
```
Safari → Settings → Extensions → enable Application Filler.

**Chrome:**
```bash
bun run build
```
`chrome://extensions` → Load unpacked → select `.output/chrome-mv3`.

## Usage

1. Open the popup and go to **Profile**
2. Enter your personal background (and startup details if using Accelerator mode)
3. Add your Anthropic API key in **Settings**
4. Navigate to any application form and click **Fill Page**

The status line shows exactly how many fields were filled vs. skipped.

## How it works

The content script scans every frame on the page for fillable fields, infers a label and character limit for each one, and returns them to the background script. The background sends each field to Claude Opus 4.7 with your profile as context, then writes the answer back using native input setters — so React, Vue, and other frameworks register the change correctly.

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts       # Fill loop, Claude calls, frame routing, badge
│   ├── content.ts          # Field detection and value injection (all frames)
│   └── popup/              # React popup: fill tab, profile tab, settings tab
├── lib/
│   ├── claudeClient.ts     # Anthropic SDK wrapper with rate-limit retry
│   ├── fieldFiller.ts      # Native value setter, event dispatch, select matching
│   └── formDetector.ts     # Field scanning, label inference, shadow DOM traversal
└── prompts/
    ├── accelerator-system.ts
    └── job-system.ts
```

## Privacy

Your profile and API key are stored locally in `browser.storage.local`. The only outbound request is to the Anthropic API when you click Fill Page.

## License

MIT
