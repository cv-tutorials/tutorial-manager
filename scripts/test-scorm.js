#!/usr/bin/env node
/**
 * Session-behaviour tests for a packaged help centre SCORM.
 *
 * These check the things that break silently inside a real LMS and that you cannot see
 * by opening the file locally: whether the SCO closes its own session, whether it
 * reports a terminal status too early, and whether a returning learner gets downgraded
 * from completed back to incomplete.
 *
 *   node scripts/test-scorm.js [dist-scorm/<dir>]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const target = process.argv[2] || 'dist-scorm/forest-help-centre';
const file = path.join(ROOT, target, 'index.html');
if (!fs.existsSync(file)) { console.error(`Not found: ${target}/index.html — run npm run scorm first`); process.exit(1); }

let pass = 0, fail = 0;
const ok = (name) => { console.log(`  ✓ ${name}`); pass++; };
const no = (name, detail) => { console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); fail++; };
const check = (name, cond, detail) => (cond ? ok(name) : no(name, detail));

/** A fake SCORM 1.2 API that records every call, like an LMS would receive them. */
function makeAPI(initial) {
  const data = Object.assign({ 'cmi.core.lesson_status': 'not attempted', 'cmi.suspend_data': '' }, initial);
  const calls = [];
  return {
    calls, data,
    LMSInitialize() { calls.push(['init']); return 'true'; },
    LMSGetValue(k) { calls.push(['get', k]); return data[k] === undefined ? '' : data[k]; },
    LMSSetValue(k, v) { calls.push(['set', k, v]); data[k] = v; return 'true'; },
    LMSCommit() { calls.push(['commit']); return 'true'; },
    LMSFinish() { calls.push(['finish']); return 'true'; },
    LMSGetLastError() { return '0'; },
    LMSGetErrorString() { return ''; },
    LMSGetDiagnostic() { return ''; },
  };
}

function load(initial) {
  const API = makeAPI(initial);
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    resources: 'usable',                       // so the sibling scorm_api.js actually loads
    url: 'file://' + file,
    beforeParse(win) {
      win.API = API;
      // jsdom has no IntersectionObserver; capture the callback so a test can fire it.
      win.__io = [];
      win.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; win.__io.push(this); this.targets = []; }
        observe(el) { this.targets.push(el); }
        unobserve() {} disconnect() {}
      };
    },
  });
  return { dom, win: dom.window, API };
}

/** Wait for the document (and its external scripts) to finish loading. */
function ready(win) {
  return new Promise((res) => {
    if (win.document.readyState === 'complete') return setTimeout(res, 60);
    win.addEventListener('load', () => setTimeout(res, 60));
  });
}

/** Drive every tracked section into view and let the dwell timer fire. */
async function seeAllSides(win) {
  win.__io.forEach((obs) => {
    obs.cb(obs.targets.map((t) => ({ target: t, isIntersecting: true })), obs);
  });
  await new Promise((r) => setTimeout(r, 1500));
}

(async () => {
  console.log(`\nSCORM session tests — ${target}\n`);

  // ── 1. a fresh learner ──
  {
    const { win, API } = load();
    await ready(win);

    check('initialises the session on load', API.calls.some(c => c[0] === 'init'));
    check('does NOT finish the session on load', !API.calls.some(c => c[0] === 'finish'),
      'a finish() on load closes the SCO window in most LMSs');
    check('reports incomplete on load, never a terminal status',
      API.data['cmi.core.lesson_status'] === 'incomplete',
      `got "${API.data['cmi.core.lesson_status']}"`);

    const btn = win.document.getElementById('sco-btn');
    check('completion button starts disabled', btn && btn.disabled);
    check('panel is visible once the SCORM logic runs',
      win.document.getElementById('sco-complete') && !win.document.getElementById('sco-complete').hidden);

    // beforeunload / pagehide must commit, not finish
    const before = API.calls.filter(c => c[0] === 'finish').length;
    win.dispatchEvent(new win.Event('beforeunload'));
    win.dispatchEvent(new win.Event('pagehide'));
    check('beforeunload and pagehide commit rather than finish',
      API.calls.filter(c => c[0] === 'finish').length === before &&
      API.calls.some(c => c[0] === 'commit'));

    // seeing both sides unlocks the button, but must not report complete on its own
    // before: nothing ticked, and the panel says what is left
    check('progress starts at zero, nothing ticked',
      [...win.document.querySelectorAll('#sco-list li')].every(t => !t.classList.contains('on')));
    check('panel names how many sections are left',
      /still to go/.test(win.document.getElementById('sco-hint').textContent),
      win.document.getElementById('sco-hint').textContent);

    await seeAllSides(win);
    check('button unlocks once every side has been seen', btn && !btn.disabled);
    check('every section ticks once seen',
      win.document.querySelectorAll('#sco-list li').length === 4 &&
      [...win.document.querySelectorAll('#sco-list li')].every(t => t.classList.contains('on')),
      [...win.document.querySelectorAll('#sco-list li')].map(t => t.className).join(' | '));
    check('seeing the sides does not by itself report completion',
      API.data['cmi.core.lesson_status'] === 'incomplete',
      `got "${API.data['cmi.core.lesson_status']}"`);

    // the deliberate action
    btn.dispatchEvent(new win.Event('click'));
    check('marking complete reports "completed"', API.data['cmi.core.lesson_status'] === 'completed',
      `got "${API.data['cmi.core.lesson_status']}"`);
    check('marking complete finishes the session exactly once',
      API.calls.filter(c => c[0] === 'finish').length === 1);

    // idempotence — a second click must not reopen or re-finish
    btn.dispatchEvent(new win.Event('click'));
    check('a second click does not finish twice',
      API.calls.filter(c => c[0] === 'finish').length === 1);
  }

  // ── 2. only one side seen ──
  {
    const { win, API } = load();
    await ready(win);
    const obs = win.__io[0];
    const learning = obs.targets.find((t) => t.id === 'learning');
    obs.cb([{ target: learning, isIntersecting: true }], obs);
    await new Promise((r) => setTimeout(r, 1500));

    check('one side seen does not unlock completion',
      win.document.getElementById('sco-btn').disabled);
    check('one section seen names the ones still missing',
      /Session Planner/.test(win.document.getElementById('sco-hint').textContent) &&
      !/Your learning/.test(win.document.getElementById('sco-hint').textContent),
      win.document.getElementById('sco-hint').textContent);
    check('the nav shows a progress figure, not just ticks',
      /\d of \d/.test((win.document.querySelector('.sco-prog .lbl') || {}).textContent || ''),
      (win.document.querySelector('.sco-prog .lbl') || {}).textContent);
    check('partial progress is saved to suspend_data for a resume',
      /learning/.test(API.data['cmi.suspend_data'] || ''),
      API.data['cmi.suspend_data']);
    check('still incomplete with one side to go',
      API.data['cmi.core.lesson_status'] === 'incomplete');
  }

  // ── 3. a learner coming back after completing ──
  {
    const { win, API } = load({
      'cmi.core.lesson_status': 'completed',
      'cmi.suspend_data': JSON.stringify({ seen: { learning: true, planner: true }, done: true }),
    });
    await ready(win);

    check('a completed record is never downgraded to incomplete',
      API.data['cmi.core.lesson_status'] === 'completed',
      `got "${API.data['cmi.core.lesson_status']}"`);
    check('the page still opens for a completed learner (reference stays available)',
      !!win.document.querySelector('#planner'));
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
