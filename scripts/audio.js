#!/usr/bin/env node
/*
 * Generate narration audio (ElevenLabs TTS) for tutorials.
 *
 * One MP3 per step per language, saved to tutorials/<partner>/<flow>/audio/<lang>/step-N.mp3.
 * A manifest.json caches the text hash so unchanged steps are NOT regenerated (saves credits).
 *
 * Usage:
 *   ELEVENLABS_API_KEY=xxx ELEVENLABS_VOICE_ID=yyy node scripts/audio.js            # all tutorials
 *   ELEVENLABS_API_KEY=xxx ELEVENLABS_VOICE_ID=yyy node scripts/audio.js n1/coach-reports
 *
 * Optional env:
 *   ELEVENLABS_MODEL   (default eleven_multilingual_v2)
 *   ELEVENLABS_FORMAT  (default mp3_44100_64 — good quality for speech, small files)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const TUTORIALS_DIR = path.join(ROOT, 'tutorials');
const PARTNERS_DIR = path.join(ROOT, 'partners');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const FORMAT = process.env.ELEVENLABS_FORMAT || 'mp3_44100_64';
const FILTER = process.argv[2]; // optional "<partner>/<flow>"

if (!API_KEY) { console.error('Missing ELEVENLABS_API_KEY env var'); process.exit(1); }
if (!VOICE_ID) { console.error('Missing ELEVENLABS_VOICE_ID env var'); process.exit(1); }

function tts(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text, model_id: MODEL });
    const req = https.request({
      method: 'POST',
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}?output_format=${FORMAT}`,
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          reject(new Error(`ElevenLabs ${res.statusCode}: ${buf.toString().slice(0, 300)}`));
        } else {
          resolve(buf);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
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
      if (!fs.existsSync(configFile)) continue;
      tutorials.push({ partnerSlug, flowSlug, configFile, configDir: flowDir });
    }
  }
  return tutorials;
}

(async () => {
  const tutorials = discoverTutorials().filter(t => !FILTER || `${t.partnerSlug}/${t.flowSlug}` === FILTER);
  if (!tutorials.length) { console.log('No tutorials matched.'); process.exit(0); }

  console.log(`ElevenLabs narration — voice ${VOICE_ID}, model ${MODEL}, format ${FORMAT}\n`);
  let generated = 0, skipped = 0, chars = 0;

  for (const t of tutorials) {
    const config = JSON.parse(fs.readFileSync(t.configFile, 'utf8'));
    const partner = JSON.parse(fs.readFileSync(path.join(PARTNERS_DIR, config.partner || t.partnerSlug, 'partner.json'), 'utf8'));
    const langs = partner.languages || ['en', 'es'];
    const audioDir = path.join(t.configDir, 'audio');
    const manifestPath = path.join(audioDir, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

    for (const lang of langs) {
      for (let i = 0; i < config.steps.length; i++) {
        const loc = config.steps[i][lang] || config.steps[i].en;
        if (!loc || !loc.t) continue;
        const text = `${loc.t}. ${loc.d}`;                       // title + description
        const key = `${lang}/step-${i + 1}`;
        const hash = crypto.createHash('sha256').update(`${text}|${VOICE_ID}|${MODEL}|${FORMAT}`).digest('hex');
        const outFile = path.join(audioDir, lang, `step-${i + 1}.mp3`);

        if (manifest[key] === hash && fs.existsSync(outFile)) { skipped++; continue; }

        process.stdout.write(`  ${t.partnerSlug}/${t.flowSlug}  ${key} … `);
        const buf = await tts(text);
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, buf);
        manifest[key] = hash;
        generated++; chars += text.length;
        console.log(`${(buf.length / 1024).toFixed(0)} KB`);
      }
    }
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  console.log(`\nDone — generated ${generated}, skipped ${skipped} (unchanged). ~${chars} characters billed this run.`);
  if (generated) console.log('Now run: node scripts/build.js  (and commit the new tutorials/**/audio/ files)');
})();
