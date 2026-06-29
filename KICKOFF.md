# Kickoff prompt (paste into Claude Code)

Read CLAUDE.md and README.md first. Then implement **Phase 2**:

Build a generator that reads every `tutorials/**/config.json`, optimises the referenced
`screenshots/*` to ~1400px JPEG base64, injects the engine tokens
(`__PRIMARY__ __ACCENT__ __STEPS__ __UI__ __EFL__ __EMAIL__`) into `engine/engine.template.html`,
and writes for each tutorial both `dist/<partner>/<flow>/index.html` (standalone) and `embed.html`
(iframe-optimised: no navy page background, auto-height, deep-linking kept). Add a GitHub Actions
workflow that deploys `dist/` to GitHub Pages, and a script that prints the Freshdesk `<iframe>`
snippet for a given tutorial. Validate every generated `<script>` with `node --check`. Treat
`engine/engine.template.html` as the single source of truth — do not fork it.

Start by proposing the repo structure and the build tool's CLI, then implement.
