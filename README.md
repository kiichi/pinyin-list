# Mandarin ひらがな Together

A lightweight browser app for two-way Chinese and Japanese learning.

Public site: https://kiichi.github.io/pinyin-list/

Last update: improved bilingual list handling, mobile layout, and tab workflows.

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
