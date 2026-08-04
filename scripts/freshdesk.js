#!/usr/bin/env node
/*
 * Publish tutorials to the Freshdesk Knowledge Base (Solutions) via API v2.
 *
 * Each partner becomes a Category, with a single Folder ("Guides"), and each
 * tutorial/hub becomes an Article that EMBEDS the live GitHub Pages tutorial
 * via an iframe (Freshdesk strips custom JS, but iframes run fine).
 *
 * Idempotent: IDs are cached in scripts/freshdesk-map.json, so re-runs UPDATE
 * existing articles instead of creating duplicates.
 *
 * Usage:
 *   FRESHDESK_API_KEY=xxx node scripts/freshdesk.js              # create/update as DRAFT
 *   FRESHDESK_API_KEY=xxx FD_PUBLISH=1 node scripts/freshdesk.js # publish live
 *   FRESHDESK_API_KEY=xxx FD_DRYRUN=1 node scripts/freshdesk.js  # print plan, no writes
 *
 * Optional env:
 *   FRESHDESK_DOMAIN  (default coachesvoice.freshdesk.com)
 *   PAGES_BASE        (default https://cv-tutorials.github.io/tutorial-manager)
 *   FD_VISIBILITY     (folder visibility: 1=all, 2=logged-in — default 1)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TUTORIALS_DIR = path.join(ROOT, 'tutorials');
const PARTNERS_DIR = path.join(ROOT, 'partners');
const MAP_FILE = path.join(__dirname, 'freshdesk-map.json');

const DOMAIN = process.env.FRESHDESK_DOMAIN || 'coachesvoice.freshdesk.com';
const KEY = process.env.FRESHDESK_API_KEY;
const PAGES_BASE = (process.env.PAGES_BASE || 'https://cv-tutorials.github.io/tutorial-manager').replace(/\/$/, '');
const STATUS = process.env.FD_PUBLISH === '1' ? 2 : 1;      // 1 draft · 2 published
const VISIBILITY = parseInt(process.env.FD_VISIBILITY || '1', 10);
const DRYRUN = process.env.FD_DRYRUN === '1';

if (!KEY) { console.error('Missing FRESHDESK_API_KEY env var'); process.exit(1); }

function api(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      method, hostname: DOMAIN, path: '/api/v2' + endpoint,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(KEY + ':X').toString('base64'),
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(txt ? JSON.parse(txt) : {});
        else reject(new Error(`Freshdesk ${res.statusCode} on ${method} ${endpoint}: ${txt.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function titleCase(slug) { return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

function discover() {
  const out = [];
  for (const partner of fs.readdirSync(TUTORIALS_DIR)) {
    const pdir = path.join(TUTORIALS_DIR, partner);
    if (!fs.statSync(pdir).isDirectory()) continue;
    for (const flow of fs.readdirSync(pdir)) {
      const fdir = path.join(pdir, flow);
      if (!fs.statSync(fdir).isDirectory()) continue;
      const cfg = path.join(fdir, 'config.json'), page = path.join(fdir, 'page.html');
      if (fs.existsSync(cfg)) {
        const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
        out.push({ partner, flow, type: 'tutorial', title: (c.title && (c.title.en || Object.values(c.title)[0])) || titleCase(flow) });
      } else if (fs.existsSync(page)) {
        const m = fs.readFileSync(page, 'utf8').match(/<title>([^<·|]+)/);
        out.push({ partner, flow, type: 'page', title: m ? m[1].trim() : titleCase(flow) });
      }
    }
  }
  return out;
}

function partnerName(slug) {
  try { return JSON.parse(fs.readFileSync(path.join(PARTNERS_DIR, slug, 'partner.json'), 'utf8')).name || slug.toUpperCase(); }
  catch { return slug.toUpperCase(); }
}

function articleBody(t) {
  const url = `${PAGES_BASE}/${t.partner}/${t.flow}/`;
  const embed = t.type === 'tutorial' ? url + 'embed.html' : url;
  const h = t.type === 'page' ? 1500 : 720;   // fallback height (auto-resizes if the portal snippet is installed)
  return `<iframe class="cv-tutorial" src="${embed}" width="100%" height="${h}" frameborder="0" scrolling="no" style="border:0;width:100%;border-radius:12px" loading="lazy"></iframe>
<p style="text-align:center"><a href="${url}" target="_blank" rel="noopener">Open the full guide in a new tab ↗</a></p>`;
}

(async () => {
  const map = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) : { categories: {}, folders: {}, articles: {} };
  const save = () => fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
  const tutorials = discover();
  console.log(`Freshdesk KB sync → ${DOMAIN}  (${STATUS === 2 ? 'PUBLISH' : 'draft'}${DRYRUN ? ' · DRY RUN' : ''})\n`);

  const byPartner = {};
  for (const t of tutorials) (byPartner[t.partner] = byPartner[t.partner] || []).push(t);

  for (const partner of Object.keys(byPartner).sort()) {
    const name = partnerName(partner);
    if (DRYRUN) { console.log(`Category "${name}"  → folder "Guides"`); byPartner[partner].forEach(t => console.log(`   • ${t.title}`)); continue; }

    if (!map.categories[partner]) {
      const c = await api('POST', '/solutions/categories', { name, description: `${name} guides and onboarding` });
      map.categories[partner] = c.id; save(); console.log(`+ category ${name} (${c.id})`);
    }
    if (!map.folders[partner]) {
      const f = await api('POST', `/solutions/categories/${map.categories[partner]}/folders`, { name: 'Guides', description: 'How-to guides', visibility: VISIBILITY });
      map.folders[partner] = f.id; save(); console.log(`+ folder Guides (${f.id})`);
    }
    for (const t of byPartner[partner]) {
      const key = `${t.partner}/${t.flow}`;
      const payload = { title: t.title, description: articleBody(t), status: STATUS };
      if (map.articles[key]) {
        await api('PUT', `/solutions/articles/${map.articles[key]}`, payload);
        console.log(`~ updated  ${t.title}`);
      } else {
        const a = await api('POST', `/solutions/folders/${map.folders[partner]}/articles`, payload);
        map.articles[key] = a.id; save(); console.log(`+ article  ${t.title} (${a.id})`);
      }
    }
  }
  console.log('\nDone.');
})().catch(e => { console.error('\n' + e.message); process.exit(1); });
