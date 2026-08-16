#!/usr/bin/env node
/*
 * Generate a visual highlight-box editor for each tutorial.
 *
 *   node scripts/editor.js                 # all tutorials
 *   node scripts/editor.js cv/reporting    # one tutorial
 *
 * Output: dist/<partner>/<flow>/editor.html — a self-contained page (screenshots
 * embedded) where anyone can drag/resize the orange box on each step and then
 * download the updated config.json. No code, no setup.
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
  let brand = { name: partner.toUpperCase(), accent: '#FF6600', primary: '#333F48' };
  try { brand = { ...brand, ...JSON.parse(fs.readFileSync(path.join(PARTNERS_DIR, config.partner || partner, 'partner.json'), 'utf8')) }; } catch {}

  // embed each distinct screenshot once
  const imgs = {};
  for (const s of config.steps) if (!imgs[s.img]) imgs[s.img] = dataUri(path.join(dir, s.img));

  const title = (config.title && (config.title.en || Object.values(config.title)[0])) || flow;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Box editor · ${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Inter",-apple-system,"Segoe UI",Arial,sans-serif;background:#0E132F;color:#fff;display:flex;height:100vh;overflow:hidden}
aside{width:290px;flex:none;background:#161C3D;overflow-y:auto;border-right:1px solid #26305c}
aside h1{font-size:14px;padding:16px 16px 4px;font-weight:800}
aside .sub{font-size:11px;color:#8c96c0;padding:0 16px 12px;text-transform:uppercase;letter-spacing:.7px}
.stepbtn{display:block;width:100%;text-align:left;border:0;background:transparent;color:#cdd4f0;padding:10px 16px;font-size:12.5px;cursor:pointer;border-left:3px solid transparent}
.stepbtn:hover{background:#1d2450}
.stepbtn.on{background:#232c60;color:#fff;border-left-color:${brand.accent};font-weight:700}
.stepbtn small{display:block;color:#7d87b3;font-size:11px;margin-top:2px}
.stepbtn.nobox small{color:#5c66a0}
main{flex:1;display:flex;flex-direction:column;min-width:0}
header{padding:12px 20px;border-bottom:1px solid #26305c;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
header h2{font-size:15px;font-weight:700;flex:1;min-width:200px}
.btn{border:1px solid #3c477e;background:#232c60;color:#fff;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer}
.btn:hover{border-color:${brand.accent}}
.btn.pri{background:${brand.accent};border-color:${brand.accent}}
.stage{flex:1;overflow:auto;padding:20px;display:flex;justify-content:center;align-items:flex-start}
.wrap{position:relative;max-width:1180px;width:100%;user-select:none}
.wrap img{display:block;width:100%;border-radius:8px}
.box{position:absolute;border:3px solid ${brand.accent};border-radius:6px;box-shadow:0 0 0 3px rgba(255,102,0,.28),0 0 0 9999px rgba(14,19,47,.45);cursor:move}
.h{position:absolute;width:14px;height:14px;background:#fff;border:2px solid ${brand.accent};border-radius:3px}
.h.nw{left:-8px;top:-8px;cursor:nwse-resize}.h.ne{right:-8px;top:-8px;cursor:nesw-resize}
.h.sw{left:-8px;bottom:-8px;cursor:nesw-resize}.h.se{right:-8px;bottom:-8px;cursor:nwse-resize}
footer{padding:10px 20px;border-top:1px solid #26305c;font-size:12px;color:#9aa3cc;display:flex;gap:20px;flex-wrap:wrap;align-items:center}
footer code{background:#232c60;padding:3px 8px;border-radius:5px;color:#fff;font-size:12px}
.hint{color:#7d87b3}
.nobox-msg{padding:40px;text-align:center;color:#8c96c0;font-size:14px}
</style></head><body>
<aside>
  <h1>${title}</h1>
  <div class="sub">${brand.name} · box editor</div>
  <div id="steps"></div>
</aside>
<main>
  <header>
    <h2 id="stepTitle"></h2>
    <button class="btn" onclick="prev()">← Prev</button>
    <button class="btn" onclick="next()">Next →</button>
    <button class="btn pri" onclick="save()">⬇ Download config.json</button>
  </header>
  <div class="stage"><div class="wrap" id="wrap"></div></div>
  <footer>
    <span>Position <code id="pos">–</code></span>
    <span class="hint">Drag the box to move · drag a corner to resize · arrow keys nudge (⇧ = bigger step)</span>
  </footer>
</main>
<script>
const CONFIG = ${JSON.stringify(config)};
const IMGS = ${JSON.stringify(imgs)};
let idx = CONFIG.steps.findIndex(s => !s.noSpot); if (idx < 0) idx = 0;

const wrap = document.getElementById('wrap');
function renderList(){
  const el = document.getElementById('steps'); el.innerHTML = '';
  CONFIG.steps.forEach((s,i)=>{
    const b = document.createElement('button');
    b.className = 'stepbtn' + (i===idx?' on':'') + (s.noSpot?' nobox':'');
    b.innerHTML = '<b>' + (i+1) + '.</b> ' + (s.en&&s.en.t||'') + '<small>' + (s.noSpot ? 'no box (full view)' : s.img.split('/').pop()) + '</small>';
    b.onclick = ()=>{ idx = i; render(); };
    el.appendChild(b);
  });
}
function render(){
  renderList();
  const s = CONFIG.steps[idx];
  document.getElementById('stepTitle').textContent = (idx+1) + ' · ' + (s.en&&s.en.t||'');
  wrap.innerHTML = '';
  if (s.noSpot){
    wrap.innerHTML = '<img src="'+IMGS[s.img]+'"><div class="nobox-msg">This step has no highlight box (full view).</div>';
    document.getElementById('pos').textContent = '–'; return;
  }
  const img = document.createElement('img'); img.src = IMGS[s.img]; wrap.appendChild(img);
  const box = document.createElement('div'); box.className = 'box'; box.id = 'box';
  ['nw','ne','sw','se'].forEach(c=>{ const h=document.createElement('div'); h.className='h '+c; h.dataset.c=c; box.appendChild(h); });
  wrap.appendChild(box);
  place();
  bind(box);
}
function place(){
  const s = CONFIG.steps[idx], b = document.getElementById('box'); if(!b) return;
  b.style.left = (s.cx - s.w/2) + '%'; b.style.top = (s.cy - s.h/2) + '%';
  b.style.width = s.w + '%'; b.style.height = s.h + '%';
  document.getElementById('pos').textContent =
    'cx ' + r(s.cx) + '  cy ' + r(s.cy) + '  w ' + r(s.w) + '  h ' + r(s.h);
}
const r = v => Math.round(v*10)/10;
function bind(box){
  let mode=null, corner=null, start=null, rect=null;
  const onDown = e => {
    rect = wrap.getBoundingClientRect();
    const s = CONFIG.steps[idx];
    corner = e.target.dataset.c || null; mode = corner ? 'resize' : 'move';
    start = { x:e.clientX, y:e.clientY, cx:s.cx, cy:s.cy, w:s.w, h:s.h };
    e.preventDefault(); document.body.style.cursor = corner ? 'grabbing' : 'move';
  };
  box.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', e => {
    if(!mode) return;
    const s = CONFIG.steps[idx];
    const dx = (e.clientX-start.x)/rect.width*100, dy = (e.clientY-start.y)/rect.height*100;
    if (mode==='move'){ s.cx = clamp(start.cx+dx,0,100); s.cy = clamp(start.cy+dy,0,100); }
    else {
      let l=start.cx-start.w/2, t=start.cy-start.h/2, rr=start.cx+start.w/2, bb=start.cy+start.h/2;
      if(corner.includes('w')) l=Math.min(l+dx, rr-1); if(corner.includes('e')) rr=Math.max(rr+dx, l+1);
      if(corner.includes('n')) t=Math.min(t+dy, bb-1); if(corner.includes('s')) bb=Math.max(bb+dy, t+1);
      s.cx=(l+rr)/2; s.cy=(t+bb)/2; s.w=rr-l; s.h=bb-t;
    }
    place();
  });
  window.addEventListener('mouseup', ()=>{ mode=null; document.body.style.cursor=''; });
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function prev(){ idx=Math.max(0,idx-1); render(); }
function next(){ idx=Math.min(CONFIG.steps.length-1,idx+1); render(); }
document.addEventListener('keydown', e=>{
  const s = CONFIG.steps[idx]; if(!s || s.noSpot) return;
  const step = e.shiftKey ? 1 : 0.2; let hit = true;
  if(e.key==='ArrowLeft') s.cx-=step; else if(e.key==='ArrowRight') s.cx+=step;
  else if(e.key==='ArrowUp') s.cy-=step; else if(e.key==='ArrowDown') s.cy+=step;
  else hit=false;
  if(hit){ e.preventDefault(); place(); }
});
function save(){
  CONFIG.steps.forEach(s=>{ ['cx','cy','w','h'].forEach(k=> s[k]=r(s[k]) ); });
  const blob = new Blob([JSON.stringify(CONFIG,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'config.json'; a.click();
}
render();
</script></body></html>`;

  const outDir = path.join(DIST_DIR, partner, flow);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'editor.html'), html);
  console.log(`    ✓ dist/${partner}/${flow}/editor.html`);
}

const filter = process.argv[2];
const list = discover().filter(t => !filter || `${t.partner}/${t.flow}` === filter);
if (!list.length) { console.log('No tutorials matched.'); process.exit(0); }
console.log(`Box editor — ${list.length} tutorial(s)\n`);
for (const t of list) build(t);
console.log('\nOpen editor.html, drag the boxes, then Download config.json and drop it into tutorials/<partner>/<flow>/');
