#!/usr/bin/env node
/**
 * The one-page reference card, as a PDF.
 *
 * Built from the same partner config as the pages, so the URLs and the two support
 * addresses cannot drift from what the module says. This is the artefact that works
 * when the platform does not: a coach who cannot get in still has the address and the
 * right inbox on a card in their phone.
 *
 *   node scripts/refcard.js forest/module
 *
 * Output: dist-pdf/<partner>-<flow>-card.pdf  (A4 portrait, one page)
 * Needs Chrome for the HTML → PDF step.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-pdf');
const BRAND = path.join(ROOT, 'engine', 'brand');
const PARTNERS = path.join(ROOT, 'partners');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].find((p) => fs.existsSync(p));

function fail(m) { console.error(`  ✗ ${m}`); process.exit(1); }
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function dataUri(file, maxWidth) {
  const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
  let buf = fs.readFileSync(file);
  if (ext !== 'svg' && maxWidth) {
    try {
      const w = parseInt((execSync(`sips -g pixelWidth "${file}"`, { encoding: 'utf8' })
        .match(/pixelWidth:\s*(\d+)/) || [])[1], 10);
      if (w > maxWidth) {
        const tmp = path.join(require('os').tmpdir(), `card-${process.pid}.${ext}`);
        execSync(`sips --resampleWidth ${maxWidth} "${file}" --out "${tmp}" 2>/dev/null`);
        buf = fs.readFileSync(tmp); fs.unlinkSync(tmp);
      }
    } catch { /* leave it */ }
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const target = process.argv[2] || 'forest/module';
const [partnerSlug, flow] = target.split('/');
const cfgFile = path.join(ROOT, 'helpcentres', partnerSlug, `${flow}.json`);
if (!fs.existsSync(cfgFile)) fail(`no config at ${path.relative(ROOT, cfgFile)}`);

const cfg = readJson(cfgFile);
const partner = readJson(path.join(PARTNERS, partnerSlug, 'partner.json'));
const v = {
  supportEmail: cfg.supportEmail || partner.email || 'support@coachesvoice.com',
  plannerSupport: cfg.plannerSupport || 'support@sportsessionplanner.com',
  ...(cfg.vars || {}),
};

const gotham = fs.existsSync(path.join(BRAND, 'Gotham-Medium.otf'))
  ? `@font-face{font-family:"Gotham";src:url("data:font/otf;base64,${fs.readFileSync(path.join(BRAND, 'Gotham-Medium.otf')).toString('base64')}") format("opentype");font-weight:500}`
  : '';
const cvLogo = dataUri(path.join(BRAND, 'cv-primary-slate.svg'));
const crest = dataUri(path.join(PARTNERS, partnerSlug, partner.logo || 'logo.png'), 300);

const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<title>${cfg.scormTitle || cfg.h1}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap">
<style>
${gotham}
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
:root{--slate:#333F48;--slate-dark:#1F272C;--orange:#FF6600;--line:#E1E5E9;--muted:#5E6B76;--bg:#FAFBFC;--partner:${cfg.partnerColor || partner.primary || '#FF6600'}}
body{width:210mm;height:297mm;font-family:"Inter",Helvetica,Arial,sans-serif;color:var(--slate);
     font-size:10.5pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{background:var(--slate-dark);color:#fff;padding:14mm 16mm 12mm;display:flex;align-items:center;gap:10mm}
.head .marks{display:flex;align-items:center;gap:6mm;flex:none}
.head .marks img.cv{height:9mm;filter:brightness(0) invert(1)}
.head .marks .rule{width:.4mm;height:13mm;background:rgba(255,255,255,.3)}
.head .marks img.crest{height:15mm}
.head h1{font-family:"Gotham","Inter",sans-serif;font-weight:500;font-size:21pt;letter-spacing:-.04em;line-height:1.03}
.head p{font-size:9pt;color:rgba(255,255,255,.65);margin-top:2mm}
main{padding:11mm 16mm}
h2{font-family:"Gotham","Inter",sans-serif;font-weight:500;font-size:12.5pt;letter-spacing:-.03em;
   margin-bottom:4mm;padding-bottom:2mm;border-bottom:.4mm solid var(--line)}
section+section{margin-top:9mm}
.tools{display:flex;gap:6mm}
.tool{flex:1;background:var(--bg);border:.3mm solid var(--line);border-radius:2.5mm;padding:6mm}
.tool .lbl{font-size:7.5pt;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--orange);margin-bottom:2mm}
.tool h3{font-family:"Gotham","Inter",sans-serif;font-weight:500;font-size:11.5pt;letter-spacing:-.03em;margin-bottom:2.5mm}
.tool p{font-size:9.5pt;color:var(--muted);margin-bottom:3mm}
.tool .url{font-family:"JetBrains Mono",monospace;font-size:8.5pt;font-weight:500;color:var(--slate);
           background:#fff;border:.3mm solid var(--line);border-radius:1.5mm;padding:1.6mm 2.5mm;display:inline-block;word-break:break-all}
.rules{display:flex;flex-direction:column;gap:4mm}
.rule-item{display:flex;gap:4mm;align-items:flex-start}
.rule-item .n{flex:none;width:6mm;height:6mm;border-radius:1.5mm;background:var(--orange);color:#fff;
              font-size:8.5pt;font-weight:600;display:flex;align-items:center;justify-content:center}
.rule-item b{font-weight:600}
.rule-item p{font-size:9.5pt;color:var(--muted)}
.rule-item p b{color:var(--slate)}
.support{display:flex;gap:6mm}
.sup{flex:1;border-left:.8mm solid var(--partner);padding-left:4mm}
.sup .w{font-size:8pt;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.sup .a{font-family:"JetBrains Mono",monospace;font-size:9pt;font-weight:500;margin-top:1.5mm;word-break:break-all}
footer{position:absolute;bottom:0;left:0;right:0;padding:7mm 16mm;border-top:.3mm solid var(--line);
       display:flex;justify-content:space-between;align-items:center;font-size:8pt;color:var(--muted)}
footer img{height:5.5mm;opacity:.75}
</style></head><body>

<div class="head">
  <div class="marks">
    <img class="cv" src="${cvLogo}" alt="Coaches' Voice">
    <span class="rule"></span>
    <img class="crest" src="${crest}" alt="${partner.name}">
  </div>
  <div>
    <h1>${cfg.scormTitle || cfg.h1}</h1>
    <p>Keep this. Everything you need in one page.</p>
  </div>
</div>

<main>
  <section>
    <h2>Your two tools</h2>
    <div class="tools">
      <div class="tool">
        <div class="lbl">Learning</div>
        <h3>The platform</h3>
        <p>The Forest game model, your CPD, and the Coaches&rsquo; Voice library &mdash; masterclasses, on-the-grass sessions and downloadable session plans.</p>
        <span class="url">${v.lmsHost || v.lmsUrl}</span>
      </div>
      <div class="tool">
        <div class="lbl">Planning</div>
        <h3>Session Planner</h3>
        <p>Build a session, animate it in 3D, and send it to your players by link, QR code or WhatsApp before they reach the ground.</p>
        <span class="url">green button, top right</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Four things worth knowing</h2>
    <div class="rules">
      <div class="rule-item"><span class="n">1</span><p><b>Two platforms, two logins.</b> Session Planner is also Coaches&rsquo; Voice, but it has its own username and password. There is no single sign-on, so save both.</p></div>
      <div class="rule-item"><span class="n">2</span><p><b>Finish the video, or it does not save.</b> Your place is kept lesson by lesson, but a video you abandon halfway starts again. Stop between lessons, not inside one.</p></div>
      <div class="rule-item"><span class="n">3</span><p><b>CPD comes from completing units, not opening them.</b> Your season total and target sit at the top right of My Learning.</p></div>
      <div class="rule-item"><span class="n">4</span><p><b>Reference material never moves your progress.</b> Live in <i>Game Model: Reference</i> as often as you like &mdash; it counts for nothing and shows in no report, by design. <i>The 4 moments</i> is the one you complete.</p></div>
    </div>
  </section>

  <section>
    <h2>Where to ask</h2>
    <div class="support">
      <div class="sup"><div class="w">The platform</div><div class="a">${v.supportEmail}</div></div>
      <div class="sup"><div class="w">Session Planner</div><div class="a">${v.plannerSupport}</div></div>
    </div>
  </section>

  ${v.webUrl ? `<section style="margin-top:9mm">
    <h2>If you need this again</h2>
    <p style="font-size:9.5pt;color:var(--muted)">The full guide is on the open web &mdash; <b style="color:var(--slate)">no login needed</b>, so you can check something from your phone at the training ground.</p>
    <span class="url" style="margin-top:2.5mm">${v.webUrl.replace(/^https?:\/\//, '')}</span>
  </section>` : ''}
</main>

<footer>
  <span>${partner.name} &middot; Coach Development</span>
  <img src="${cvLogo}" alt="Coaches' Voice">
</footer>
</body></html>`;

fs.mkdirSync(OUT, { recursive: true });
const htmlFile = path.join(OUT, `${partnerSlug}-${flow}-card.html`);
const pdfFile = path.join(OUT, `${partnerSlug}-${flow}-card.pdf`);
fs.writeFileSync(htmlFile, html);

if (!CHROME) fail('Chrome not found — the HTML is written, convert it yourself');
execSync(`"${CHROME}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfFile}" "file://${htmlFile}"`,
  { stdio: 'pipe' });
if (!fs.existsSync(pdfFile)) fail('Chrome did not produce a PDF');
console.log(`  ✓ dist-pdf/${path.basename(pdfFile)} (${(fs.statSync(pdfFile).size / 1024).toFixed(0)}KB)`);
