#!/usr/bin/env node
/**
 * British English check over the built pages.
 *
 * Everything a coach reads is UK English — these are UK clubs. Copy drifts American one
 * word at a time, usually because whoever wrote it was thinking in code, so this runs over
 * the BUILT pages with <script> and <style> stripped: CSS `color` and JS `Math`/`behavior`
 * are keywords and must stay American, and flagging them would train people to ignore this.
 *
 *   npm run lint:english            everything built
 *   npm run lint:english forest     just one partner
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const US_TO_UK = {
  'color': 'colour', 'colors': 'colours', 'colored': 'coloured',
  'center': 'centre', 'centers': 'centres', 'centered': 'centred',
  'organize': 'organise', 'organized': 'organised', 'organizing': 'organising',
  'organization': 'organisation', 'organizations': 'organisations',
  'customize': 'customise', 'customized': 'customised', 'customizing': 'customising',
  'recognize': 'recognise', 'recognized': 'recognised',
  'optimize': 'optimise', 'optimized': 'optimised',
  'personalize': 'personalise', 'personalized': 'personalised',
  'emphasize': 'emphasise', 'apologize': 'apologise',
  'analyze': 'analyse', 'analyzed': 'analysed', 'analyzing': 'analysing',
  'favorite': 'favourite', 'favorites': 'favourites',
  'behavior': 'behaviour', 'behaviors': 'behaviours',
  'catalog': 'catalogue', 'program': 'programme', 'programs': 'programmes',
  'enrollment': 'enrolment', 'fulfill': 'fulfil', 'skillful': 'skilful',
  'defense': 'defence', 'offense': 'offence', 'pretense': 'pretence',
  'canceled': 'cancelled', 'traveled': 'travelled', 'modeling': 'modelling',
  'practicing': 'practising', 'judgment': 'judgement', 'maneuver': 'manoeuvre',
  'specialty': 'speciality', 'gotten': 'got', 'math': 'maths',
  'jewelry': 'jewellery', 'gray': 'grey', 'liter': 'litre', 'meter': 'metre',
};

const files = [];
for (const dir of ['dist', 'dist-pdf']) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) continue;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) files.push(p);
    }
  };
  walk(base);
}
const only = process.argv[2];
const scoped = only ? files.filter((f) => f.includes(`/${only}/`)) : files;
if (!files.length) { console.log('\nNothing built yet — run npm run build first.'); process.exit(0); }
if (only && !scoped.length) { console.log(`\nNothing built under "${only}".`); process.exit(0); }

let hits = 0, skipped = 0;
for (const file of scoped) {
  let s = fs.readFileSync(file, 'utf8');

  // Only check pages that are actually in English. Some tutorials are Spanish, where
  // "color" is simply the word — flagging those would make the linter noise to ignore.
  const lang = (s.match(/<html[^>]*\slang=["']([a-z-]+)["']/i) || [])[1] || 'en';
  if (!/^en/i.test(lang)) { skipped++; continue; }
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')     // JS keywords are American by definition
       .replace(/<style[\s\S]*?<\/style>/gi, ' ')       // so are CSS properties
       .replace(/data:[^\s"')]+/g, ' ')                 // base64 payloads
       .replace(/<[^>]+>/g, ' ')
       .replace(/&[a-z]+;/gi, ' ');

  for (const [us, uk] of Object.entries(US_TO_UK)) {
    const re = new RegExp(`\\b${us}\\b`, 'gi');
    let m;
    while ((m = re.exec(s))) {
      const ctx = s.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50).replace(/\s+/g, ' ').trim();
      console.log(`  ✗ ${path.relative(ROOT, file)}\n      "${m[0]}" → "${uk}"\n      …${ctx}…`);
      hits++;
    }
  }
}

const note = skipped ? ` (${skipped} non-English page(s) skipped)` : '';
console.log(hits
  ? `\n${hits} American spelling(s) in copy the reader sees.${note}\n`
  : `\n✓ British English throughout — ${scoped.length - skipped} page(s) checked${note}.\n`);
process.exit(hits ? 1 : 0);
