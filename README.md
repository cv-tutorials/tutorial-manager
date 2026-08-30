# Tutorial Manager — Coaches' Voice

Build interactive, step-by-step product tutorials (guided tours) for LMS admins,
re-branded per partner, and embed them in Freshdesk Knowledge Base articles.

## Quick start

```bash
npm run build              # builds all tutorials → dist/
npm run iframe efl/invite-users   # prints the Freshdesk <iframe> snippet
npm run sync-builder       # syncs engine template into builder
npm run helpcentre         # builds only the partner help centres
```

Two engines live here: **tutorials** (guided click-throughs, `tutorials/`) and
**help centres** (pages of answers, `helpcentres/` — see `helpcentres/README.md`).
`npm run build` builds both.

## Project structure

```
partners/<slug>/
  partner.json             # partner defaults (colors, logo, email, languages)
  logo.png                 # partner logo (PNG/SVG)

tutorials/<partner>/<flow>/
  config.json              # tutorial config (v2)
  screenshots/             # step screenshots

engine/engine.template.html  # single source of truth for the tutorial UI
builder/builder.html         # visual builder for PS staff (no-code)
scripts/build.js             # build pipeline
scripts/sync-builder.js      # syncs engine → builder embedded copy

content/core/               # shared help-centre answers, inherited by every partner
helpcentres/<partner>/
  <flow>.json              # help centre config (sections + blocks)

dist/<partner>/<flow>/
  index.html               # standalone tutorial or help centre (full page)
  embed.html               # iframe-optimised (no bg, auto-height) — tutorials only
```

## Adding a new partner

1. Create `partners/<slug>/partner.json`:
   ```json
   {
     "name": "Partner Name",
     "primary": "#001489",
     "accent": "#BA0C2F",
     "email": "support@example.com",
     "logo": "logo.png",
     "languages": ["en", "es"]
   }
   ```
2. Place the partner logo as `partners/<slug>/logo.png`.

## Adding a new tutorial

1. Create `tutorials/<partner>/<flow>/config.json`:
   ```json
   {
     "version": 2,
     "partner": "<slug>",
     "flow": "<flow-name>",
     "title": {
       "en": "English title",
       "es": "Título en español"
     },
     "steps": [...]
   }
   ```
2. Place screenshots in `tutorials/<partner>/<flow>/screenshots/`.
3. Run `npm run build`.

Config inherits `primary`, `accent`, `email` from the partner — override per-tutorial if needed.

## Tokens the engine expects

`__PRIMARY__`, `__ACCENT__`, `__STEPS__`, `__UI__`, `__LOGO__`, `__PARTNER_NAME__`,
`__TITLE__`, `__EMAIL__`.

The Coaches' Voice "Powered by" logo and favicon are baked into the engine.

## Embedding in Freshdesk

The deploy workflow uploads `dist/` **as the Pages root**, so the live path has no `/dist/`
segment. Let `npm run iframe <partner>/<flow>` print the snippet rather than writing it by hand:

```html
<!-- tutorial -->
<iframe src="https://cv-tutorials.github.io/tutorial-manager/<partner>/<flow>/embed.html"
        width="100%" height="720" style="border:0" loading="lazy"></iframe>

<!-- help centre — one long page, no embed.html -->
<iframe src="https://cv-tutorials.github.io/tutorial-manager/<partner>/<flow>/"
        width="100%" height="2400" style="border:0" loading="lazy"></iframe>
```

A help centre usually reads better as a plain link than in an iframe — send the URL itself.

Deep-link a step: append `#step-4` to the src URL.

Auto-height: the embed sends a `postMessage` with `{tutorialHeight: N}`. Add this
to the parent page if you want dynamic resizing:
```js
window.addEventListener('message', e => {
  if (e.data?.tutorialHeight) {
    document.querySelector('iframe').style.height = e.data.tutorialHeight + 'px';
  }
});
```

## Deploy

Push to `main` — GitHub Actions builds and deploys `dist/` to GitHub Pages automatically.
See `.github/workflows/deploy.yml`.
