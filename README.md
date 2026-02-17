# Mandarin ひらがな Together

A lightweight browser app for two-way Chinese and Japanese learning.

Public site: https://kiichi.github.io/pinyin-list/

Last update: improved bilingual list handling, mobile layout, and tab workflows.

## Recent Changes

- Added copy icon button on saved rows
- Improved saved-list behavior across Chinese/Japanese modes
- Refined wrapping behavior for long saved entries

## What It Does

- Translate in both directions:
  - `Japanese / English -> Chinese`
  - `Chinese / English -> Japanese`
- Auto lookup while typing (debounced)
- Pronunciation audio button
- Saved word/sentence lists with tabs
- Separate tab workspaces per mode
- Drag/drop reorder and move between tabs
- Import/Export data (JSON)

## Quick Use

1. Choose mode at the top.
2. Type a word/sentence in the input.
3. Wait for auto-translation.
4. Press `Enter` or click save to add to the current tab list.
5. Use the `⋯` menu for import/export, move selected, clear, and tab actions.

## Tech

- Standalone frontend only
- `index.html` + `style.css` + `app.js`
- No backend required

## Run Locally

Open `index.html` in a browser.

For best compatibility, serve as static files:

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`
