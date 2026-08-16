#!/usr/bin/env node
/*
 * Generate the written-article version of each tutorial (numbered steps,
 * baked-in highlight boxes, table of contents) — the preferred format for
 * Freshdesk: native, searchable, and far faster to produce/fix than the
 * interactive version.
 *
 *   node scripts/article.js                 # all tutorials
 *   node scripts/article.js cv/reporting    # one tutorial
 *
 * Output: dist/<partner>/<flow>/article.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TUTORIALS_DIR = path.join(ROOT, 'tutorials');
const PARTNERS_DIR = path.join(ROOT, 'partners');
const DIST_DIR = path.join(ROOT, 'dist');

function dataUri(file) {
  const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

function discover() {
  const out = [];
  for (const partner of fs.readdirSync(TUTORIALS_DIR)) {
    const pdir = path.join(TUTORIALS_DIR, partner);
    if (!fs.statSync(pdir).isDirectory()) continue;
    for (const flow of fs.readdirSync(pdir)) {
      const fdir = path.join(pdir, flow);
      if (!fs.statSync(fdir).isDirectory()) continue;
      if (fs.existsSync(path.join(fdir, 'config.json'))) out.push({ partner, flow, dir: fdir });
    }
  }
  return out;
}

function build({ partner, flow, dir }) {
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  let brand = { name: partner.toUpperCase(), accent: '#FF6600', primary: '#333F48', email: '' };
  try { brand = { ...brand, ...JSON.parse(fs.readFileSync(path.join(PARTNERS_DIR, config.partner || partner, 'partner.json'), 'utf8')) }; } catch {}

  const title = (config.title && (config.title.en || Object.values(config.title)[0])) || flow;
  const ui = (config.ui && config.ui.en) || {};
  const lead = ui.lead || '';
  const { accent: acc, primary: nav } = brand;
  const steps = config.steps;

  let logo = '';
  const lp = path.join(PARTNERS_DIR, config.partner || partner, brand.logo || 'logo.png');
  if (fs.existsSync(lp)) logo = dataUri(lp);

  const html = [];
  html.push(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Inter",-apple-system,"Segoe UI",Arial,sans-serif;color:${nav};background:#fff;line-height:1.55}
.wrap{max-width:820px;margin:0 auto;padding:28px 22px 60px}
.top{display:flex;align-items:center;gap:14px;border-bottom:1px solid #e2e6ea;padding-bottom:16px}
.top img{height:26px} .top .div{width:1px;height:24px;background:#e2e6ea}
.top h1{font-size:18px;font-weight:800;letter-spacing:-.3px}
.lead{margin:14px 0 4px;font-size:14.5px;color:#4a5560}
.toc{margin:18px 0 6px;padding:14px 18px;background:#f6f8f9;border-radius:10px}
.toc b{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#8a95a0}
.toc ol{margin:8px 0 0 18px;font-size:14px}
.toc a{color:${nav};text-decoration:none} .toc a:hover{color:${acc}}
.sec{font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${acc};margin:34px 0 4px}
.step{padding:22px 0;border-bottom:1px solid #eef1f3}
.hd{display:flex;align-items:baseline;gap:12px;margin-bottom:4px}
.n{color:#fff;background:${nav};min-width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:none;font-size:13px;font-weight:800}
.hd h3{font-size:17px;font-weight:700}
.step p{font-size:14.5px;color:#4a5560;margin:2px 0 12px 38px}
.shot{position:relative;margin-left:38px;border:1px solid #e2e6ea;border-radius:10px;overflow:hidden}
.shot img{display:block;width:100%}
.hl{position:absolute;border:3px solid ${acc};border-radius:7px;box-shadow:0 0 0 3px rgba(255,102,0,.25)}
.done{margin:30px 0 0 38px;padding:16px 18px;background:#f6f8f9;border-radius:10px}
.done b{color:${nav}}
.foot{margin-top:28px;font-size:12px;color:#8a95a0;text-transform:uppercase;letter-spacing:.5px;font-weight:700}
.foot a{color:${acc};text-decoration:none}
</style></head><body><div class="wrap">
<div class="top">${logo ? `<img src="${logo}"><div class="div"></div>` : ''}<h1>${title}</h1></div>`);

  if (lead) html.push(`<p class="lead">${lead}</p>`);

  html.push('<div class="toc"><b>In this guide</b><ol>');
  steps.forEach((s, i) => html.push(`<li><a href="#s${i + 1}">${(s.en && s.en.t) || ''}</a></li>`));
  html.push('</ol></div>');

  let lastSec = null;
  steps.forEach((s, i) => {
    if (s.section && s.section !== lastSec) { html.push(`<div class="sec">${s.section}</div>`); lastSec = s.section; }
    const loc = s.en || {};
    const img = dataUri(path.join(dir, s.img));
    let hl = '';
    if (!s.noSpot) {
      const L = s.cx - s.w / 2, T = s.cy - s.h / 2;
      hl = `<span class="hl" style="left:${L}%;top:${T}%;width:${s.w}%;height:${s.h}%"></span>`;
    }
    html.push(`<div class="step" id="s${i + 1}"><div class="hd"><span class="n">${i + 1}</span><h3>${loc.t || ''}</h3></div>
    <p>${loc.d || ''}</p><div class="shot"><img src="${img}">${hl}</div></div>`);
  });

  if (ui.doneT) html.push(`<div class="done"><b>${ui.doneT}</b><br>${ui.doneD || ''}</div>`);
  html.push(`<div class="foot">Powered by Coaches' Voice · Need help? <a href="mailto:${brand.email || ''}">${brand.email || ''}</a></div></div></body></html>`);

  const outDir = path.join(DIST_DIR, partner, flow);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'article.html'), html.join(''));
  console.log(`    ✓ dist/${partner}/${flow}/article.html`);
}

const filter = process.argv[2];
const list = discover().filter(t => !filter || `${t.partner}/${t.flow}` === filter);
if (!list.length) { console.log('No tutorials matched.'); process.exit(0); }
console.log(`Article generator — ${list.length} tutorial(s)\n`);
for (const t of list) build(t);
