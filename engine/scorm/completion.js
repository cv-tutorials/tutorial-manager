/**
 * SCORM session behaviour for a help centre module.
 *
 * The rules here are the ones that hurt if you get them wrong (see cv-scorm-builder):
 *  - a terminal status is reported ONLY when the learner deliberately marks the module
 *    complete. Never on load, never on scroll.
 *  - beforeunload / pagehide COMMIT, they never finish. Those events fire spuriously and
 *    a finish() there ends the session on its own.
 *  - finish() is idempotent (guarded inside scorm_api.js).
 *  - an already-completed record is never downgraded back to incomplete on a revisit.
 *
 * Completion means: the coach has been through both sides of the module — the learning
 * platform and Session Planner — which is exactly what the module was asked to cover.
 */
(function () {
  var SIDES = __SCO_SIDES__;               // [{id, label}, …] — the sections that must be seen
  var seen = {};
  var completed = false;

  var panel = document.getElementById('sco-complete');
  var btn   = document.getElementById('sco-btn');
  var todo  = document.getElementById('sco-todo');
  if (!panel || !btn || !todo) return;
  panel.hidden = false;

  // If scorm_api.js failed to load at all, degrade instead of dying half-rendered:
  // the panel is already visible by this point, so an exception here would leave the
  // learner looking at a permanently dead button with no explanation.
  var hasApi = typeof ScormAPI !== 'undefined';
  var live = hasApi && ScormAPI.initialize();
  if (!hasApi) console.warn('scorm_api.js did not load — running without LMS reporting');

  // Resume: restore which sides were seen, and never downgrade a completed record.
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

  function buildTracker() {
    var links = document.querySelector('.navlinks');
    if (!links) return;
    var wrap = document.createElement('div');
    wrap.className = 'sco-track';
    wrap.id = 'sco-track';
    SIDES.forEach(function (s) {
      var el = document.createElement('span');
      el.className = 't';
      el.id = 'sco-t-' + s.id;
      el.innerHTML = '<span class="dot">' + tick + '</span>' + s.label;
      wrap.appendChild(el);
    });
    links.parentNode.insertBefore(wrap, links.nextSibling);
  }

  function render() {
    var missing = SIDES.filter(function (s) { return !seen[s.id]; });
    SIDES.forEach(function (s) {
      var el = document.getElementById('sco-t-' + s.id);
      if (el) el.classList.toggle('on', !!seen[s.id]);
    });

    if (completed) {
      panel.classList.add('is-done');
      return;
    }
    if (missing.length) {
      btn.disabled = true;
      todo.textContent = 'Still to look at: ' +
        missing.map(function (s) { return s.label; }).join(' and ') + '.';
    } else {
      btn.disabled = false;
      todo.textContent = 'Both sides seen — you are good to mark this off.';
    }
  }

  function markSeen(id) {
    if (seen[id] || completed) return;
    seen[id] = true;
    if (live) { ScormAPI.setSuspendData({ seen: seen }); ScormAPI.commit(); }
    render();
  }

  // A side counts as seen once it has actually been on screen for a moment,
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
  }, { threshold: 0.25 });

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

  buildTracker();
  render();
})();
