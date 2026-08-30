#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(ROOT, 'engine', 'engine.template.html');
const PARTNERS_DIR = path.join(ROOT, 'partners');
const TUTORIALS_DIR = path.join(ROOT, 'tutorials');
const DIST_DIR = path.join(ROOT, 'dist');

const UI_STRINGS = {
  en: {
    step: 'Step', of: 'of', back: 'Back', next: 'Next', finish: 'Finish',
    restart: 'Start over', review: 'Review steps',
    listen: 'Listen', pause: 'Pause',
    tip: 'Click the highlighted area or use the ← → keys',
    help: 'Need more help? Email', power: 'Powered by',
    start: 'Start guide', m2: '~2 min', sub: 'Admin guide',
    doneT: "You're all set",
    doneD: "You've completed the steps. Repeat the flow anytime."
  },
  es: {
    step: 'Paso', of: 'de', back: 'Atrás', next: 'Siguiente', finish: 'Finalizar',
    restart: 'Reiniciar', review: 'Ver pasos',
    listen: 'Escuchar', pause: 'Pausar',
    tip: 'Haz clic en el área resaltada o usa las teclas ← →',
    help: '¿Otra duda? Escribe a', power: 'Con tecnología de',
    start: 'Comenzar', m2: '~2 min', sub: 'Guía de administrador',
    doneT: '¡Todo listo!',
    doneD: 'Completaste los pasos. Repite el flujo cuando quieras.'
  }
};

function loadPartner(slug) {
  const file = path.join(PARTNERS_DIR, slug, 'partner.json');
  if (!fs.existsSync(file)) {
    console.error(`Partner not found: ${slug} (expected ${file})`);
    process.exit(1);
  }
  const partner = JSON.parse(fs.readFileSync(file, 'utf8'));
  const logoPath = path.join(PARTNERS_DIR, slug, partner.logo || 'logo.png');
  if (fs.existsSync(logoPath)) {
    const ext = path.extname(logoPath).slice(1).replace('jpg', 'jpeg');
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
    partner._logoDataUri = `data:${mime};base64,${fs.readFileSync(logoPath).toString('base64')}`;
  } else {
    partner._logoDataUri = '';
  }
  return partner;
}

function optimiseImage(imgPath) {
  if (!fs.existsSync(imgPath)) {
    console.error(`  Screenshot not found: ${imgPath}`);
    process.exit(1);
  }
  const ext = path.extname(imgPath).toLowerCase();
  const raw = fs.readFileSync(imgPath);

  // Try to resize with sips (macOS) for PNGs > 1400px wide
  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    try {
      const info = execSync(`sips -g pixelWidth "${imgPath}" 2>/dev/null`, { encoding: 'utf8' });
      const match = info.match(/pixelWidth:\s*(\d+)/);
      if (match && parseInt(match[1]) > 1400) {
        const tmp = path.join(require('os').tmpdir(), `tutorial-opt-${Date.now()}${ext}`);
        execSync(`sips --resampleWidth 1400 "${imgPath}" --out "${tmp}" 2>/dev/null`);
        const optimised = fs.readFileSync(tmp);
        fs.unlinkSync(tmp);
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${mime};base64,${optimised.toString('base64')}`;
      }
    } catch { /* sips not available, use raw */ }
  }

  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  const mime = mimeMap[ext] || 'image/png';
  return `data:${mime};base64,${raw.toString('base64')}`;
}

function buildUI(partner, config, stepCount) {
  const langs = partner.languages || ['en', 'es'];
  const ui = {};
  for (const lang of langs) {
    const base = UI_STRINGS[lang] || UI_STRINGS.en;
    const title = config.title[lang] || config.title.en || '';
    ui[lang] = {
      ...base,
      title,
      sub: `${partner.name} · ${base.sub}`,
      eyebrow: `${base.sub} · ${partner.name}`,
      lead: lang === 'en'
        ? 'Follow these steps. It only takes a couple of minutes.'
        : 'Sigue estos pasos. Solo toma un par de minutos.',
      m1: `${stepCount} ${lang === 'en' ? 'steps' : 'pasos'}`,
      ...(config.ui && config.ui[lang] || {})
    };
  }
  return ui;
}

function buildTutorial(engineTemplate, partner, config, configDir) {
  const steps = config.steps.map(s => {
    const imgPath = path.join(configDir, s.img);
    const imgData = optimiseImage(imgPath);
    return { ...s, img: imgData };
  });

  const ui = buildUI(partner, config, steps.length);
  const title = `${config.title.en || config.title[Object.keys(config.title)[0]]} · ${partner.name}`;

  // audio: which <lang>/step-N.mp3 clips exist for this tutorial
  const langs = partner.languages || ['en', 'es'];
  const audioKeys = [];
  for (const lang of langs) {
    for (let i = 1; i <= config.steps.length; i++) {
      if (fs.existsSync(path.join(configDir, 'audio', lang, `step-${i}.mp3`))) {
        audioKeys.push(`${lang}/step-${i}.mp3`);
      }
    }
  }

  let html = engineTemplate;
  html = html.split('__PRIMARY__').join(config.primary || partner.primary);
  html = html.split('__ACCENT__').join(config.accent || partner.accent);
  html = html.replace('__STEPS__', JSON.stringify(steps));
  html = html.replace('__AUDIO__', JSON.stringify(audioKeys));
  html = html.replace('__UI__', JSON.stringify(ui));
  html = html.replace('__EMAIL__', config.email || partner.email);
  html = html.replace('__TITLE__', title);

  if (partner._logoDataUri) {
    html = html.replace('__LOGO__', partner._logoDataUri);
  } else {
    html = html.replace(/<img src="__LOGO__" alt="__PARTNER_NAME__">/, '');
    html = html.replace('<div class="div"></div>', '');
  }

  html = html.split('__PARTNER_NAME__').join(partner.name);

  const gaId = config.gaId || partner.gaId || '';
  if (gaId) {
    html = html.split('__GA_ID__').join(gaId);
  } else {
    html = html.replace(/<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=__GA_ID__"><\/script>\n/, '');
    html = html.replace(/<script>window\.dataLayer.*?__GA_ID__.*?<\/script>\n/, '');
  }

  return html;
}

function makeEmbed(standaloneHtml) {
  let embed = standaloneHtml;

  // Remove the navy-dk body background for iframe embedding
  embed = embed.replace(
    /background:\s*var\(--navy-dk\)\s*;/,
    'background:transparent;'
  );
  // Remove body padding
  embed = embed.replace(
    /min-height:\s*100vh;\s*display:\s*flex;\s*align-items:\s*center;\s*justify-content:\s*center;\s*padding:\s*24px;/,
    'min-height:auto; display:block; padding:0;'
  );
  // Remove shell shadow and max-width for iframe
  embed = embed.replace(
    /box-shadow:\s*0 30px 70px -28px rgba\(0,0,0,\.6\)/,
    'box-shadow:none'
  );

  // Add postMessage auto-height script before closing </body>
  const autoHeight = `
<script>
(function(){
  function sendHeight(){
    var h = document.querySelector('.shell');
    if(h) parent.postMessage({tutorialHeight: h.scrollHeight + 32},'*');
  }
  sendHeight();
  new MutationObserver(sendHeight).observe(document.body,{childList:true,subtree:true,attributes:true});
  window.addEventListener('resize', sendHeight);
})();
</script>`;

  embed = embed.replace('</body>', autoHeight + '\n</body>');
  return embed;
}

function validateJS(html, label) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/g);
  if (!match) return;
  for (const block of match) {
    const js = block.replace(/<\/?script>/g, '');
    const tmp = path.join(require('os').tmpdir(), `tutorial-check-${Date.now()}.js`);
    fs.writeFileSync(tmp, js);
    try {
      execSync(`node --check "${tmp}"`, { stdio: 'pipe' });
    } catch (e) {
      console.error(`JS validation failed in ${label}:`);
      console.error(e.stderr?.toString() || e.message);
      fs.unlinkSync(tmp);
      process.exit(1);
    }
    fs.unlinkSync(tmp);
  }
}

function discoverTutorials() {
  const tutorials = [];
  if (!fs.existsSync(TUTORIALS_DIR)) return tutorials;

  for (const partnerSlug of fs.readdirSync(TUTORIALS_DIR)) {
    const partnerDir = path.join(TUTORIALS_DIR, partnerSlug);
    if (!fs.statSync(partnerDir).isDirectory()) continue;

    for (const flowSlug of fs.readdirSync(partnerDir)) {
      const flowDir = path.join(partnerDir, flowSlug);
      if (!fs.statSync(flowDir).isDirectory()) continue;

      const configFile = path.join(flowDir, 'config.json');
      const pageFile = path.join(flowDir, 'page.html');
      if (fs.existsSync(configFile)) {
        tutorials.push({ partnerSlug, flowSlug, configFile, configDir: flowDir, type: 'tutorial' });
      } else if (fs.existsSync(pageFile)) {
        tutorials.push({ partnerSlug, flowSlug, pageFile, configDir: flowDir, type: 'page' });
      } else continue;
    }
  }
  return tutorials;
}

// ── Main ──

const cmd = process.argv[2];

if (cmd === 'iframe') {
  const target = process.argv[3];
  if (!target) { console.error('Usage: node build.js iframe <partner>/<flow>'); process.exit(1); }
  const base = process.env.PAGES_BASE || 'https://<user>.github.io/tutorial-manager';
  console.log(`<iframe src="${base}/dist/${target}/embed.html" width="100%" height="720" style="border:0" loading="lazy"></iframe>`);
  process.exit(0);
}

console.log('Tutorial Manager — Build Pipeline\n');

const engineTemplate = fs.readFileSync(ENGINE_PATH, 'utf8');
const tutorials = discoverTutorials();

if (!tutorials.length) {
  console.log('No tutorials found in tutorials/*/');
  process.exit(0);
}

console.log(`Found ${tutorials.length} tutorial(s):\n`);

let built = 0;
for (const t of tutorials) {
  const { partnerSlug, flowSlug, configFile, configDir } = t;
  console.log(`  → ${partnerSlug}/${flowSlug}`);

  if (t.type === 'page') {
    const outDir = path.join(DIST_DIR, partnerSlug, flowSlug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), fs.readFileSync(t.pageFile, 'utf8'));
    for (const f of fs.readdirSync(configDir)) {
      if (f === 'page.html') continue;
      fs.cpSync(path.join(configDir, f), path.join(outDir, f), { recursive: true });
    }
    console.log(`    ✓ dist/${partnerSlug}/${flowSlug}/index.html (hub page)`);
    built++;
    continue;
  }

  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const partner = loadPartner(config.partner || partnerSlug);

  const standalone = buildTutorial(engineTemplate, partner, config, configDir);
  const embed = makeEmbed(standalone);

  validateJS(standalone, `${partnerSlug}/${flowSlug}/index.html`);
  validateJS(embed, `${partnerSlug}/${flowSlug}/embed.html`);

  const outDir = path.join(DIST_DIR, partnerSlug, flowSlug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), standalone);
  fs.writeFileSync(path.join(outDir, 'embed.html'), embed);

  console.log(`    ✓ dist/${partnerSlug}/${flowSlug}/index.html`);
  console.log(`    ✓ dist/${partnerSlug}/${flowSlug}/embed.html`);

  // copy narration audio (mp3s) alongside the html so relative paths resolve
  const audioSrc = path.join(configDir, 'audio');
  if (fs.existsSync(audioSrc)) {
    fs.cpSync(audioSrc, path.join(outDir, 'audio'), { recursive: true });
    console.log(`    ✓ dist/${partnerSlug}/${flowSlug}/audio/`);
  }
  built++;
}

// copy shared static assets (portal icons, logos) verbatim
const assetsSrc = path.join(ROOT, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, path.join(DIST_DIR, 'assets'), { recursive: true });
  console.log('    \u2713 dist/assets/');
}

console.log(`\nDone — ${built} tutorial(s) built.`);

// Written-article version of each tutorial (preferred format for Freshdesk)
try {
  execSync(`node "${path.join(__dirname, 'article.js')}"`, { stdio: 'inherit' });
} catch (e) {
  console.error('Article generation failed (tutorials built fine):', e.message);
}

// Partner help centres (engine + content/core, see scripts/helpcentre.js)
try {
  execSync(`node "${path.join(__dirname, 'helpcentre.js')}"`, { stdio: 'inherit' });
} catch (e) {
  console.error('Help centre generation failed (tutorials built fine):', e.message);
}

// Visual highlight-box editors (one per tutorial) — used by the team to fix boxes without code
try {
  execSync(`node "${path.join(__dirname, 'editor.js')}"`, { stdio: 'inherit' });
} catch (e) {
  console.error('Box editor generation failed (tutorials built fine):', e.message);
}
