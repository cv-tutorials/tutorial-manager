#!/usr/bin/env node
/**
 * Help centre builder.
 *
 * Mirrors scripts/build.js, but for partner help centres instead of guided tutorials:
 * a single engine template (engine/helpcentre.template.html) plus per-partner JSON,
 * with shared content blocks in content/core/ that every partner inherits.
 *
 *   content/core/*.json          the answers that are true for every partner
 *   helpcentres/<p>/<flow>.json  what this partner includes, omits, overrides, adds
 *   dist/<p>/<flow>/index.html   the built page
 *
 * Fix a shared answer once in content/core and every help centre picks it up on
 * the next build. Anything club-specific lives in the partner file — never in core.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'engine', 'helpcentre.template.html');
const CORE_DIR = path.join(ROOT, 'content', 'core');
const HC_DIR = path.join(ROOT, 'helpcentres');
const PARTNERS_DIR = path.join(ROOT, 'partners');
const BRAND_DIR = path.join(ROOT, 'engine', 'brand');
const DIST_DIR = path.join(ROOT, 'dist');

// ── helpers ──

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const core = (() => {
  const out = {};
  if (!fs.existsSync(CORE_DIR)) return out;
  for (const f of fs.readdirSync(CORE_DIR)) {
    if (f.endsWith('.json')) out[f.replace(/\.json$/, '')] = readJson(path.join(CORE_DIR, f));
  }
  return out;
})();

function fail(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }

/** Escape nothing — content files are authored by us and intentionally carry HTML. */
function vars(str, v) {
  return String(str).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));
}

/**
 * Inline an image as a data URI. The crest is rendered at 34px in the nav and
 * 104px in the hero, so anything past ~300px wide is pure page weight — and it
 * gets inlined twice. A 1500px partner logo doubled the page size before this.
 */
function dataUri(file, maxWidth = 300) {
  const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
  let buf = fs.readFileSync(file);

  if (ext !== 'svg') {
    try {
      const info = execSync(`sips -g pixelWidth "${file}" 2>/dev/null`, { encoding: 'utf8' });
      const w = parseInt((info.match(/pixelWidth:\s*(\d+)/) || [])[1], 10);
      if (w > maxWidth) {
        const tmp = path.join(os.tmpdir(), `hc-logo-${process.pid}.${ext}`);
        execSync(`sips --resampleWidth ${maxWidth} "${file}" --out "${tmp}" 2>/dev/null`);
        buf = fs.readFileSync(tmp);
        fs.unlinkSync(tmp);
      }
    } catch { /* sips unavailable (non-macOS) — ship it as-is */ }
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Gotham Medium is the CV display face and is licensed — it is not on any font CDN,
 * so it has to travel inside the page. 103KB of OTF becomes ~137KB of base64; that is
 * the price of the brand rendering correctly rather than silently falling back to Inter.
 */
function gothamFace() {
  const otf = path.join(BRAND_DIR, 'Gotham-Medium.otf');
  if (!fs.existsSync(otf)) {
    console.warn('  ! Gotham-Medium.otf missing — headings will fall back to Inter');
    return '/* Gotham not bundled */';
  }
  const b64 = fs.readFileSync(otf).toString('base64');
  return `@font-face{font-family:"Gotham";src:url("data:font/otf;base64,${b64}") format("opentype");font-weight:500;font-style:normal;font-display:swap}`;
}

/** The CV wordmark, white variant — the nav and footer both sit on dark slate. */
function cvLogo() {
  const svg = path.join(BRAND_DIR, 'cv-primary-white.svg');
  if (!fs.existsSync(svg)) fail(`CV logo missing: ${svg}`);
  return dataUri(svg);
}

function loadPartner(slug) {
  const file = path.join(PARTNERS_DIR, slug, 'partner.json');
  if (!fs.existsSync(file)) fail(`partner not found: ${slug} (expected ${file})`);
  const p = readJson(file);
  const logo = path.join(PARTNERS_DIR, slug, p.logo || 'logo.png');
  p._logo = fs.existsSync(logo) ? dataUri(logo) : '';
  if (!p._logo) console.warn(`  ! ${slug}: no logo at ${logo}`);
  return p;
}

/** #DD0000 → a darker shade, for the one place the design needs it. */
function darken(hex, amount = 0.35) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((x) => Math.round(x * (1 - amount)).toString(16).padStart(2, '0'));
  return `#${c.join('')}`;
}

// ── FAQ resolution: include → omit → override → add ──

function resolveFaq(block, v) {
  let items = [];

  if (block.include) {
    const src = core[block.include];
    if (!src) fail(`unknown core block "${block.include}" (have: ${Object.keys(core).join(', ')})`);
    if (!Array.isArray(src.items)) fail(`core block "${block.include}" has no items[]`);
    items = src.items.map((it) => ({ ...it }));
  }

  for (const id of block.omit || []) {
    if (!items.some((it) => it.id === id)) fail(`omit: no item "${id}" in ${block.include}`);
    items = items.filter((it) => it.id !== id);
  }

  for (const [id, patch] of Object.entries(block.override || {})) {
    const i = items.findIndex((it) => it.id === id);
    if (i < 0) fail(`override: no item "${id}" in ${block.include}`);
    items[i] = { ...items[i], ...patch };
  }

  for (const entry of block.add || []) {
    const item = entry.item || entry;
    if (!item.id || !item.q || !item.a) fail(`add: item needs id, q and a`);
    if (entry.after) {
      const i = items.findIndex((it) => it.id === entry.after);
      if (i < 0) fail(`add: no item "${entry.after}" to insert after`);
      items.splice(i + 1, 0, item);
    } else if (entry.first) {
      items.unshift(item);
    } else {
      items.push(item);
    }
  }

  if (!items.length) fail('faq block resolved to zero items');

  const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>';
  const rows = items.map((it, i) => {
    const open = (block.open === it.id || (block.open === true && i === 0)) ? ' open' : '';
    const body = (Array.isArray(it.a) ? it.a : [it.a]).map((p) => vars(p, v)).join('\n          ');
    return `      <details${open}>
        <summary><span class="qn" aria-hidden="true"></span>${vars(it.q, v)}
          ${chev}</summary>
        <div class="ans">
          ${body}
        </div>
      </details>`;
  });
  return `    <div class="faq">\n${rows.join('\n\n')}\n    </div>`;
}

// ── other block types ──

function renderCards(list, v, extraClass = '') {
  const cards = list.map((c) => {
    const cls = `card${extraClass ? ' ' + extraClass : ''}`;
    return `      <a class="${cls}" href="${vars(c.href, v)}">
        <span class="who">${vars(c.who || 'Guide', v)}</span>
        <span class="tt">${vars(c.tt, v)}</span>
        <span class="td">${vars(c.td || '', v)}</span></a>`;
  });
  return `    <div class="cards">\n${cards.join('\n')}\n    </div>`;
}

function resolveCards(block, v) {
  const shared = (core['admin-cards'] || {}).cards || {};
  const list = (block.cards || []).map((c) => {
    if (typeof c === 'string') {
      if (!shared[c]) fail(`unknown shared card "${c}" (have: ${Object.keys(shared).join(', ')})`);
      return shared[c];
    }
    if (c.use) {
      if (!shared[c.use]) fail(`unknown shared card "${c.use}"`);
      return { ...shared[c.use], ...c, use: undefined };
    }
    return c;
  });
  const out = [];
  if (block.heading) out.push(`    <h3 class="sub">${vars(block.heading, v)}</h3>`);
  out.push(renderCards(list, v));
  return out.join('\n');
}

function resolveVideos(block, v) {
  const cat = core['session-planner-videos'];
  const copy = ((core['session-planner-faq'] || {}).videoCopy) || {};
  if (!cat) fail('videos block needs content/core/session-planner-videos.json');

  let codes = block.codes;
  if (typeof codes === 'string') {
    if (!Array.isArray(cat[codes])) fail(`unknown video set "${codes}" (have: coachStarter, clubAdmin)`);
    codes = cat[codes];
  }
  if (!Array.isArray(codes) || !codes.length) fail('videos block needs codes[] or a named set');

  const watch = cat._watch || 'https://www.youtube.com/watch?v=';
  const list = codes.map((code, i) => {
    const base = copy[code];
    if (!base) fail(`no videoCopy for "${code}" — add it to content/core/session-planner-faq.json`);
    const over = (block.copy || {})[code] || {};
    return {
      who: block.numbered ? `Video &middot; ${i + 1}` : 'Video',
      tt: over.title || base.title,
      td: over.d || base.d,
      href: watch + code,
    };
  });

  const out = [];
  if (block.heading) out.push(`    <h3 class="sub">${vars(block.heading, v)}</h3>`);
  out.push(renderCards(list, v, 'vid'));
  return out.join('\n');
}

function resolveSteps(block, v) {
  const steps = block.steps.map((s, i) => {
    const ps = (Array.isArray(s.p) ? s.p : [s.p]).map((p) => `        <p>${vars(p, v)}</p>`);
    if (s.small) ps.push(`        <p class="small">${vars(s.small, v)}</p>`);
    return `      <div class="step">
        <div class="n">${i + 1}</div>
        <h3>${vars(s.h, v)}</h3>
${ps.join('\n')}
      </div>`;
  });
  return `    <div class="steps">\n${steps.join('\n\n')}\n    </div>`;
}

function resolveCallout(block, v) {
  let text = block.text;
  if (block.use) {
    const pools = [ (core['admin-cards'] || {}).callouts, (core['session-planner-faq'] || {}).blurbs ];
    const hit = pools.find((p) => p && block.use in p);
    if (!hit) fail(`unknown shared callout "${block.use}"`);
    text = hit[block.use];
  }
  if (!text) fail('callout needs text or use');
  return `    <div class="callout">${vars(text, v)}</div>`;
}

function resolveBookmark(block, v) {
  const url = vars(block.href || '', v);
  const icon = '<svg viewBox="0 0 24 24"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"/></svg>';
  // A bare URL on screen is something nobody types and everybody skims past. If there is
  // somewhere to go, it is a button; if the reader is already there, there is no link at all.
  const action = url
    ? `\n        <a class="link" href="${url}" target="_blank" rel="noopener">${vars(block.label || 'Open the guide', v)} &rarr;</a>`
    : '';
  // A link out of the platform, shown before the work is done, is an exit. Blocks marked
  // revealOnComplete are hidden by the SCORM layer until the module is finished. On the
  // open web there is no SCORM layer, so they simply show — which is right, the reader is
  // already outside.
  const reveal = block.revealOnComplete ? ' data-reveal="complete"' : '';
  return `    <div class="bookmark"${reveal}>
      <span class="ico" aria-hidden="true">${icon}</span>
      <div>
        <h3>${vars(block.title || 'Save this in your favourites', v)}</h3>
        <p>${vars(block.text || '', v)}</p>${action}
      </div>
    </div>`;
}

const BLOCKS = {
  faq: resolveFaq,
  cards: resolveCards,
  videos: resolveVideos,
  steps: resolveSteps,
  callout: resolveCallout,
  bookmark: resolveBookmark,
  prose: (b, v) => `    <p class="lead">${vars(b.text, v)}</p>`,
};

// ── section + page ──

function renderSection(sec, v) {
  if (!sec.id || !sec.title) fail('every section needs an id and a title');
  const head = [`  <section id="${sec.id}">`];
  const note = sec.note ? `<span class="note">${vars(sec.note, v)}</span>` : '';
  head.push(`    <div class="shd"><h2>${vars(sec.title, v)}</h2>${note}</div>`);
  for (const lead of [].concat(sec.lead || [])) head.push(`    <p class="lead">${vars(lead, v)}</p>`);

  for (const block of sec.blocks || []) {
    const fn = BLOCKS[block.type];
    if (!fn) fail(`unknown block type "${block.type}" (have: ${Object.keys(BLOCKS).join(', ')})`);
    head.push(fn(block, v));
  }
  head.push('  </section>');
  return head.join('\n');
}

function build(configFile) {
  const cfg = readJson(configFile);
  for (const k of ['partner', 'flow', 'title', 'h1', 'sections']) {
    if (!cfg[k]) fail(`${path.relative(ROOT, configFile)}: missing "${k}"`);
  }
  const partner = loadPartner(cfg.partner);

  const v = {
    supportEmail: cfg.supportEmail || partner.email || 'support@coachesvoice.com',
    // Session Planner is a separate product with its own support desk. Faults with the
    // tool belong to them; provisioning a seat belongs to us. Keep the two apart.
    plannerSupport: cfg.plannerSupport || 'support@sportsessionplanner.com',
    partnerName: partner.name,
    ...(cfg.vars || {}),
  };

  const nav = (cfg.sections)
    .filter((s) => s.nav !== false)
    .map((s) => `    <a href="#${s.id}">${vars(s.navLabel || s.title, v)}</a>`)
    .join('\n');

  const sections = cfg.sections.map((s) => renderSection(s, v)).join('\n\n');
  let html = fs.readFileSync(ENGINE, 'utf8');
  const tokens = {
    __LANG__: cfg.lang || 'en-GB',
    __TITLE__: cfg.title,
    __LOGO__: partner._logo,
    __CV_LOGO__: cvLogo(),
    __GOTHAM_FACE__: gothamFace(),
    __PARTNER_NAME__: partner.name,
    __EYEBROW__: vars(cfg.eyebrow || partner.name, v),
    __H1__: vars(cfg.h1, v),
    __LEAD__: vars(cfg.lead || '', v),
    __NAV__: nav,
    __SECTIONS__: sections,
    __FOOTER__: vars(cfg.footer || partner.name, v),
    // CV slate + orange carry the page. The club colour is a marker, not the theme.
    __PARTNER_COLOR__: cfg.partnerColor || partner.primary || '#FF6600',
  };
  for (const [k, val] of Object.entries(tokens)) html = html.split(k).join(val);

  const left = html.match(/__[A-Z_]+__/g);
  if (left) fail(`unreplaced tokens: ${[...new Set(left)].join(', ')}`);

  const outDir = path.join(DIST_DIR, cfg.partner, cfg.flow);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`    ✓ dist/${cfg.partner}/${cfg.flow}/index.html (help centre, ${(html.length / 1024).toFixed(0)}KB)`);
  return 1;
}

// ── main ──

if (!fs.existsSync(HC_DIR)) { console.log('\nNo helpcentres/ directory — skipping.'); process.exit(0); }
if (!fs.existsSync(ENGINE)) fail(`engine template missing: ${ENGINE}`);

const configs = [];
for (const slug of fs.readdirSync(HC_DIR)) {
  const dir = path.join(HC_DIR, slug);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) configs.push(path.join(dir, f));
  }
}

console.log(`\nHelp centres — ${configs.length} page(s)\n`);
let n = 0;
for (const c of configs.sort()) {
  console.log(`  → ${path.relative(HC_DIR, c).replace(/\.json$/, '')}`);
  n += build(c);
}
console.log(`\nDone — ${n} help centre page(s) built.`);
