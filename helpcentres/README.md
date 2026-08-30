# Help centres

Partner-branded help pages, built from JSON. The sister system to `tutorials/`: same idea
(one engine, per-partner config), different output — a full page of answers rather than a
guided click-through.

```
engine/helpcentre.template.html   the shell: markup, CSS, accordion + deep-link scripts
content/core/*.json               the answers that are true for EVERY partner
partners/<slug>/partner.json      name, colours, logo, support email
helpcentres/<slug>/<flow>.json    what this partner includes, omits, overrides, adds
        ↓  npm run build   (or npm run helpcentre)
dist/<slug>/<flow>/index.html     one self-contained file, ~85KB, no external assets
```

## Why it works this way

The coach-facing FAQ is roughly the same everywhere. "What are CPD points", "how does a module
work", "can I pick it up later", "the video will not play" — identical on Forest, Surf, ECNL and
Rush. Only the club-specific parts differ.

So the answers live **once** in `content/core/`, and a partner config says what it wants from
them. Correct a shared answer there and every help centre picks it up on the next build. Before
this, each page was hand-written HTML — two Forest pages alone were 39% identical, with the 6KB
`<style>` block copied verbatim between them and free to drift apart.

**The rule: nothing club-specific ever goes in `content/core/`.** If it names a club, a module or
a domain, it belongs in that partner's config, or behind a `{{var}}`.

## A minimal config

```json
{
  "version": 1,
  "partner": "forest",
  "flow": "help-centre",
  "title": "Nottingham Forest F.C. — Coach Development help centre",
  "h1": "Coach Development help centre",
  "eyebrow": "Nottingham Forest F.C. &middot; Academy",
  "lead": "…",
  "vars": { "club": "Forest", "lmsUrl": "https://…", "lmsHost": "…" },
  "sections": [
    { "id": "learning", "title": "Your learning",
      "blocks": [ { "type": "faq", "include": "lms-faq" } ] }
  ]
}
```

`{{club}}`, `{{lmsUrl}}`, `{{supportEmail}}` and anything else in `vars` are substituted
everywhere, including inside core content. `supportEmail` falls back to `partner.json`.

Colours and logo come from `partner.json`; `primary` / `ink` in the config override them.
The logo is inlined as a data URI and downscaled to 300px first — a full-size crest doubles the
page weight, because it is inlined twice.

## Sections and blocks

A section is `{ id, title, note?, lead?, blocks[] }`. It becomes a nav item automatically —
`"nav": false` keeps it off the nav, `"navLabel"` shortens it.

| Block | Does | Key fields |
|---|---|---|
| `faq` | Accordion, one open at a time | `include`, `omit[]`, `override{}`, `add[]`, `open` |
| `steps` | Numbered cards | `steps[]` of `{ h, p, small }` |
| `cards` | Link cards | `cards[]` — a string reuses a shared card, an object defines one |
| `videos` | Video cards | `codes` (a set name or list), `numbered`, `copy{}`, `heading` |
| `callout` | Red-edged box | `text` or `use` (a shared callout) |
| `prose` | A lead paragraph | `text` |

### Bending a shared FAQ

```json
{ "type": "faq", "include": "lms-faq",
  "omit": ["phone"],
  "override": { "cpd": { "a": ["<p>Forest's own answer…</p>"] } },
  "add": [ { "after": "module", "item": { "id": "…", "q": "…", "a": ["…"] } } ] }
```

`add` takes `after: "<id>"`, `first: true`, or neither (appends). Every id is validated at build
time — a typo in `omit` or `after` fails the build rather than silently doing nothing.

## Core content

| File | Holds |
|---|---|
| `lms-faq.json` | 8 coach questions about the LMS |
| `session-planner-faq.json` | 3 Session Planner questions, shared blurbs, and the copy for each video |
| `session-planner-videos.json` | All 33 Session Planner tutorial codes, by section, plus the `coachStarter` and `clubAdmin` sets |
| `admin-cards.json` | The Freshdesk article cards and the callouts support repeats to every club |

**Session Planner naming:** it is *Session Planner*. Never "Sport Session Planner", never "SSP" —
not in prose, not in nav labels, not in anchor ids.

**Session Planner videos:** its in-product help centre needs a login, but every tutorial is a
public video on the official SportSessionPlanner YouTube channel. All 33 codes were verified via
oEmbed on 30/08/2026. Reference them from `session-planner-videos.json`; never paste codes into a
partner config.

## Adding a partner

1. `partners/<slug>/partner.json` + `logo.png` (any size — it gets downscaled).
2. `helpcentres/<slug>/help-centre.json`, including the core blocks you want.
3. `npm run build`.

## Built pages

| Page | Audience |
|---|---|
| `forest/help-centre` | Every Forest coach |
| `forest/admin` | Forest's platform administrators only — at Forest, admin access sits with the club, so this is deliberately a separate page and must not be linked where coaches can reach it |

## Open items

- `sportsessionplanner.com` deep links point at the help centre as a whole, not per article — its
  tutorials open in a modal and have no individual URLs.
- Publishing to Freshdesk needs a Forest category + folder in `scripts/freshdesk-map.json`, then
  `npm run iframe forest/help-centre`. Every page already posts its height to the parent frame.
