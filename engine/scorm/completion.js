/**
 * SCORM session behaviour and progress for a help centre module.
 *
 * The session rules are the ones that hurt if you get them wrong (cv-scorm-builder):
 *  - a terminal status is reported ONLY when the learner deliberately marks the module
 *    complete. Never on load, never on scroll.
 *  - beforeunload / pagehide COMMIT, they never finish. Those events fire spuriously and
 *    a finish() there ends the session on its own.
 *  - finish() is idempotent (guarded inside scorm_api.js).
 *  - an already-completed record is never downgraded back to incomplete on a revisit.
 *
 * Progress: every section is a checkpoint. The bar in the nav shows how far through they
 * are and the panel names what is left, so it is never a mystery. The button only unlocks
 * once every section has actually been on screen — finishing the module means having been
 * through all of it, not having scrolled past it in three seconds.
 */
(function () {
  var SIDES = __SCO_SIDES__;               // [{id, label}, …] — every section that must be seen
  var seen = {};
  var completed = false;

  var panel = document.getElementById('sco-complete');
  var btn   = document.getElementById('sco-btn');
  var hint  = document.getElementById('sco-hint');
  var list  = document.getElementById('sco-list');
  if (!panel || !btn || !hint || !list) return;
  panel.hidden = false;

  // If scorm_api.js failed to load at all, degrade instead of dying half-rendered:
  // the panel is already visible by this point, so an exception here would leave the
  // learner looking at a permanently dead button with no explanation.
  var hasApi = typeof ScormAPI !== 'undefined';
  var live = hasApi && ScormAPI.initialize();
  if (!hasApi) console.warn('scorm_api.js did not load — running without LMS reporting');

  // Resume: restore what was seen, and never downgrade a completed record.
  if (live) {
    var prior = ScormAPI.getSuspendData();
    if (prior && prior.seen) seen = prior.seen;
    var status = ScormAPI.getValue('cmi.core.lesson_status');
    if (status === 'completed' || status === 'passed') {
      completed = true;
    } else {
      ScormAPI.setStatus('incomplete');
      ScormAPI.commit();
    }
  }

  var tick = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
  var bar, lblEl, progWrap;

  function buildProgress() {
    var nav = document.querySelector('.navin');
    if (nav) {
      progWrap = document.createElement('div');
      progWrap.className = 'sco-prog';
      progWrap.innerHTML = '<span class="bar"><i></i></span><span class="lbl"></span>';
      nav.appendChild(progWrap);
      bar = progWrap.querySelector('i');
      lblEl = progWrap.querySelector('.lbl');
    }
    SIDES.forEach(function (s) {
      var li = document.createElement('li');
      li.id = 'sco-i-' + s.id;
      li.innerHTML = '<span class="dot">' + tick + '</span>' + s.label;
      list.appendChild(li);
    });
  }

  function render() {
    var done = SIDES.filter(function (s) { return seen[s.id]; });
    var missing = SIDES.filter(function (s) { return !seen[s.id]; });
    var pct = Math.round((done.length / SIDES.length) * 100);

    SIDES.forEach(function (s) {
      var li = document.getElementById('sco-i-' + s.id);
      if (li) li.classList.toggle('on', !!seen[s.id]);
    });

    if (bar) bar.style.width = (completed ? 100 : pct) + '%';
    if (lblEl) {
      lblEl.textContent = completed ? 'Complete'
        : pct === 100 ? 'All seen'
        : done.length + ' of ' + SIDES.length + ' · ' + pct + '%';
    }
    if (progWrap) progWrap.classList.toggle('done', completed || pct === 100);

    if (completed) { panel.classList.add('is-done'); return; }

    btn.disabled = missing.length > 0;
    hint.textContent = missing.length
      ? (missing.length === 1
          ? 'One section still to go: ' + missing[0].label + '.'
          : missing.length + ' sections still to go — ' +
            missing.map(function (s) { return s.label; }).join(', ') + '.')
      : 'Everything seen. You are good to mark this off.';
  }

  function markSeen(id) {
    if (seen[id] || completed) return;
    seen[id] = true;
    if (live) { ScormAPI.setSuspendData({ seen: seen }); ScormAPI.commit(); }
    render();
  }

  // A section counts as seen once it has actually been on screen for a moment,
  // not merely because the page loaded with it below the fold.
  var timers = {};
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var id = e.target.id;
      if (e.isIntersecting) {
        timers[id] = setTimeout(function () { markSeen(id); }, 1200);
      } else {
        clearTimeout(timers[id]);
      }
    });
  }, { threshold: 0.2 });

  SIDES.forEach(function (s) {
    var el = document.getElementById(s.id);
    if (el) io.observe(el);
  });

  btn.addEventListener('click', function () {
    if (completed) return;
    completed = true;
    if (live) {
      ScormAPI.setStatus('completed');
      ScormAPI.setSuspendData({ seen: seen, done: true });
      ScormAPI.commit();
      ScormAPI.finish();               // terminal status only on a deliberate action
    }
    render();
    // Guarded: an exception in a click handler inside an unknown LMS browser would
    // strand the learner on a button that looks like it did nothing.
    if (panel.scrollIntoView) { try { panel.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
  });

  // Commit only. Never finish here — these events fire when they feel like it.
  function save() { if (live) ScormAPI.commit(); }
  window.addEventListener('beforeunload', save);
  window.addEventListener('pagehide', save);

  buildProgress();
  render();
})();
