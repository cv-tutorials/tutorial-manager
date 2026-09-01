#!/usr/bin/env node
/**
 * Session and completion tests for a packaged help centre SCORM.
 *
 * These check what breaks silently inside a real LMS and cannot be seen by opening the
 * file locally: whether the SCO closes its own session, whether it reports a terminal
 * status too early, whether a returning learner gets downgraded from completed back to
 * incomplete — and whether the module can be completed without actually reading it.
 *
 *   node scripts/test-scorm.js [dist-scorm/<dir>]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const target = process.argv[2] || 'dist-scorm/forest-module';
const file = path.join(ROOT, target, 'index.html');
if (!fs.existsSync(file)) { console.error(`Not found: ${target}/index.html — run npm run scorm first`); process.exit(1); }

let pass = 0, fail = 0;
const ok = (n) => { console.log(`  ✓ ${n}`); pass++; };
const no = (n, d) => { console.log(`  ✗ ${n}${d ? `\n      ${d}` : ''}`); fail++; };
const check = (n, cond, d) => (cond ? ok(n) : no(n, d));

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

/** Drive tracked sections into view and let the dwell timer fire. */
async function scrollThrough(win, only) {
  win.__io.forEach((obs) => {
    const targets = only ? obs.targets.filter((t) => only.includes(t.id)) : obs.targets;
    if (targets.length) obs.cb(targets.map((t) => ({ target: t, isIntersecting: true })), obs);
  });
  await new Promise((r) => setTimeout(r, 1500));
}

/** Expand every question, the way a coach actually reading it would. */
function openEveryQuestion(win) {
  win.document.querySelectorAll('details[data-q]').forEach((d) => {
    d.open = true;
    d.dispatchEvent(new win.Event('toggle'));
  });
}

const hintOf = (win) => win.document.getElementById('sco-hint').textContent;
const navLabel = (win) => (win.document.querySelector('.sco-prog .lbl') || {}).textContent || '';
const subOf = (win, id) => (win.document.querySelector(`#sco-i-${id} .sub`) || {}).textContent || '';

(async () => {
  console.log(`\nSCORM tests — ${target}\n`);

  // ── 1. a fresh learner, all the way through ──
  {
    const { win, API } = load();
    await ready(win);
    const btn = win.document.getElementById('sco-btn');
    const reward = win.document.querySelector('[data-reveal="complete"]');
    const questions = win.document.querySelectorAll('details[data-q]').length;

    check('initialises the session on load', API.calls.some(c => c[0] === 'init'));
    check('does NOT finish the session on load', !API.calls.some(c => c[0] === 'finish'),
      'a finish() on load closes the SCO window in most LMSs');
    check('reports incomplete on load, never a terminal status',
      API.data['cmi.core.lesson_status'] === 'incomplete', `got "${API.data['cmi.core.lesson_status']}"`);
    check('the page has questions to track', questions > 0, `${questions} found`);
    check('completion button starts disabled', btn && btn.disabled);
    check('the link out of the platform is hidden before completion',
      reward && reward.style.display === 'none',
      'shown early it is an exit route halfway through the work');
    check('progress starts with nothing ticked',
      [...win.document.querySelectorAll('#sco-list li')].every(li => !li.classList.contains('on')));

    const before = API.calls.filter(c => c[0] === 'finish').length;
    win.dispatchEvent(new win.Event('beforeunload'));
    win.dispatchEvent(new win.Event('pagehide'));
    check('beforeunload and pagehide commit rather than finish',
      API.calls.filter(c => c[0] === 'finish').length === before &&
      API.calls.some(c => c[0] === 'commit'));

    // THE point of the model: scrolling the whole page is not reading it
    await scrollThrough(win);
    check('scrolling past every section does NOT unlock completion',
      btn.disabled, 'skimming to the bottom would otherwise complete the module unread');
    check('the panel says how many questions are still to open',
      /questions? still to open/.test(hintOf(win)), hintOf(win));
    check('a section with unopened questions is not ticked',
      !win.document.getElementById('sco-i-learning').classList.contains('on'));
    check('that section shows its own count', /0 of \d+ opened/.test(subOf(win, 'learning')), subOf(win, 'learning'));

    // now actually read it
    openEveryQuestion(win);
    check('opening every question unlocks completion', !btn.disabled, hintOf(win));
    check('every section ticks once seen and fully opened',
      [...win.document.querySelectorAll('#sco-list li')].every(li => li.classList.contains('on')));
    check('the nav reports it is done', /100%|All done/.test(navLabel(win)), navLabel(win));
    check('doing the work does not by itself report completion',
      API.data['cmi.core.lesson_status'] === 'incomplete', `got "${API.data['cmi.core.lesson_status']}"`);

    btn.dispatchEvent(new win.Event('click'));
    check('marking complete reports "completed"',
      API.data['cmi.core.lesson_status'] === 'completed', `got "${API.data['cmi.core.lesson_status']}"`);
    check('marking complete finishes the session exactly once',
      API.calls.filter(c => c[0] === 'finish').length === 1);
    check('the link out appears once the module is complete',
      reward && reward.style.display !== 'none');

    btn.dispatchEvent(new win.Event('click'));
    check('a second click does not finish twice',
      API.calls.filter(c => c[0] === 'finish').length === 1);
  }

  // ── 2. partway through ──
  {
    const { win, API } = load();
    await ready(win);
    await scrollThrough(win, ['learning']);
    const d = win.document.querySelector('#learning details[data-q]');
    d.open = true; d.dispatchEvent(new win.Event('toggle'));
    await new Promise((r) => setTimeout(r, 50));

    check('one question opened does not unlock completion',
      win.document.getElementById('sco-btn').disabled);
    check('the section count reflects what has been opened',
      /1 of \d+ opened/.test(subOf(win, 'learning')), subOf(win, 'learning'));
    check('the nav shows a percentage', /\d+%/.test(navLabel(win)), navLabel(win));
    check('what was opened is saved for a resume',
      /opened/.test(API.data['cmi.suspend_data'] || ''), API.data['cmi.suspend_data']);
    check('still incomplete partway through',
      API.data['cmi.core.lesson_status'] === 'incomplete');
  }

  // ── 3. resuming ──
  {
    const { win } = load({
      'cmi.core.lesson_status': 'incomplete',
      'cmi.suspend_data': JSON.stringify({ seen: { learning: true }, opened: { where: true, cpd: true } }),
    });
    await ready(win);
    check('a resumed session restores what was already opened',
      /2 of \d+ opened/.test(subOf(win, 'learning')), subOf(win, 'learning'));
  }

  // ── 4. coming back after completing ──
  {
    const { win, API } = load({
      'cmi.core.lesson_status': 'completed',
      'cmi.suspend_data': JSON.stringify({ seen: {}, opened: {}, done: true }),
    });
    await ready(win);
    check('a completed record is never downgraded to incomplete',
      API.data['cmi.core.lesson_status'] === 'completed', `got "${API.data['cmi.core.lesson_status']}"`);
    check('the page still opens for a completed learner (reference stays available)',
      !!win.document.querySelector('#planner'));
    check('a returning completed learner sees the link out straight away',
      (win.document.querySelector('[data-reveal="complete"]') || {}).style.display !== 'none');
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
