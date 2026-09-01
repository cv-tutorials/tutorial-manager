# CLAUDE.md — working context

You are the developer for **Tutorial Manager** (Coaches' Voice). Read README.md too.

## Mission
A system to produce per-partner interactive tutorials and embed them in Freshdesk. Non-technical
PS staff create tutorials with `builder/builder.html`; the build pipeline turns configs into
hosted pages.

## Architecture
- **Engine** (`engine/engine.template.html`) — single source of truth for the tutorial UI.
  Tokenised with: `__PRIMARY__`, `__ACCENT__`, `__STEPS__`, `__UI__`, `__LOGO__`,
  `__PARTNER_NAME__`, `__TITLE__`, `__EMAIL__`. CV logo + favicon baked in.
- **Partner registry** (`partners/<slug>/partner.json`) — per-partner defaults (colors, logo,
  email, languages). Tutorial configs inherit from here; can override per-tutorial.
- **Tutorial configs** (`tutorials/<partner>/<flow>/config.json`) — v2 schema with `version`,
  `partner`, `flow`, `title` (object keyed by lang), `steps` array.
- **Build pipeline** (`scripts/build.js`) — reads all configs, merges partner defaults,
  optimises screenshots to base64, injects tokens, writes `dist/` with `index.html` (standalone)
  and `embed.html` (iframe-optimised: transparent bg, auto-height via postMessage).
- **Builder** (`builder/builder.html`) — visual tool for PS staff. Its embedded ENGINE string
  must be synced via `npm run sync-builder` after any engine change.
- **GitHub Actions** (`.github/workflows/deploy.yml`) — deploys `dist/` to Pages on push to main.

### Help centres (second engine)
- **Engine** (`engine/helpcentre.template.html`) + **shared content** (`content/core/*.json`) +
  **per-partner config** (`helpcentres/<slug>/<flow>.json`) → `dist/<slug>/<flow>/index.html`.
  Built by `scripts/helpcentre.js`, chained from `build.js`. Same philosophy as the tutorial
  engine: the answers that are true for every partner live once in `content/core/`, and a partner
  config includes / omits / overrides / adds. **Nothing club-specific in `content/core/`.**
- Session Planner is called **Session Planner** in all partner-facing copy — never "SSP", never
  "Sport Session Planner". It is **also Coaches' Voice** — two platforms, not two companies; never
  imply a third party. Support splits by platform: LMS → support@coachesvoice.com, Session Planner
  → support@sportsessionplanner.com. Its 33 tutorials are public YouTube videos catalogued in
  `content/core/session-planner-videos.json`; reference them, never paste codes into a config.
- **SCORM** (`scripts/scorm.js`, opt in with `"scorm": true`) wraps the ALREADY BUILT page rather
  than re-authoring it, so the LMS module and the web page cannot diverge. Completion = every
  tracked section seen AND every `details[data-q]` opened, then a deliberate click — scrolling
  past an accordion is not reading it. Never report a terminal status on load;
  beforeunload/pagehide commit only. `npm run test:scorm` (jsdom) enforces the session rules —
  run it before handing over a package. Do not add `xmllint --schema` validation: it produces
  false failures on valid SCORM 1.2 packages.
- Partner logos are inlined twice per page, so `helpcentre.js` downscales them to 300px. Do not
  bypass it — a 1500px crest doubles the page.

- **UK English** in everything a reader sees — these are UK clubs. `npm run lint:english [partner]`
  checks the built pages, skipping `<script>`/`<style>` (CSS `color`, JS `Math` are keywords) and
  any page whose `<html lang>` is not English. Articles now declare their language, so add `lang`
  to anything new.

## Non-negotiables
- **Engine is the single source of truth.** Change design/behaviour in the engine template,
  then run `npm run sync-builder` to update the builder's copy.
- **Always `node --check`** generated JS — the build pipeline does this automatically.
- **Freshdesk:** embed via `<iframe>` to a PUBLIC page. Inline scripts are stripped by the editor.
- **No `localStorage`** in anything that may render inside claude.ai.
- **Images**: optimised to ~1400px wide, inlined as base64 for self-contained files.

## Commands
```bash
npm run build                    # build all tutorials
npm run iframe <partner>/<flow>  # print Freshdesk iframe snippet
npm run sync-builder             # sync engine → builder ENGINE string
```

## Config v2 schema
```json
{
  "version": 2,
  "partner": "efl",
  "flow": "invite-users",
  "title": { "en": "...", "es": "..." },
  "primary": "#override",   // optional — falls back to partner.json
  "accent": "#override",    // optional
  "email": "override@...",  // optional
  "ui": { "en": {...}, "es": {...} },  // optional UI string overrides
  "steps": [
    {
      "img": "screenshots/01-foo.png",
      "ar": 1.66, "cx": 84, "cy": 4, "w": 5, "h": 7, "z": 1.55,
      "static": false,
      "en": { "t": "Title", "d": "Description" },
      "es": { "t": "Título", "d": "Descripción" }
    }
  ]
}
```

## Step config shape
`{ img, ar (w/h), cx, cy, w, h (highlight box, % of screenshot), z (zoom ≥1),
   static (result step, no pulse), <lang>:{t,d} }`

## Highlight model
Box in % of screenshot (cx,cy,w,h); `z` zoom; `static` = result step.
Zoom uses *establish-then-zoom* (full view first, then ease in) and respects
`prefers-reduced-motion`.
