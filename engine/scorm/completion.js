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
 * Completion has two halves, deliberately:
 *  - a section counts as SEEN once it has been on screen for a moment, which is what fills
 *    the circles as the learner works down the page;
 *  - but a section holding questions is only DONE once every one of them has been opened.
 *
 * Scrolling past an accordion is not reading it. Without the second half a coach could
 * flick to the bottom in three seconds and mark the module complete having read nothing,
 * and the record would say they had.
 */
(function () {
  var SIDES = __SCO_SIDES__;               // [{id, label}, …] — every section on the page
  var seen = {};                           // section id  → true once it has been on screen
  var opened = {};                         // question id → true once it has been expanded
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

  // Resume: restore what was seen and opened, and never downgrade a completed record.
  if (live) {
    var prior = ScormAPI.getSuspendData();
    if (prior) { seen = prior.seen || {}; opened = prior.opened || {}; }
    var status = ScormAPI.getValue('cmi.core.lesson_status');
    if (status === 'completed' || status === 'passed') {
      completed = true;
    } else {
      ScormAPI.setStatus('incomplete');
      ScormAPI.commit();
    }
  }

  // Map each section to the questions inside it.
  var parts = SIDES.map(function (s) {
    var el = document.getElementById(s.id);
    var qs = el ? [].slice.call(el.querySelectorAll('details[data-q]')) : [];
    return { id: s.id, label: s.label, el: el, qs: qs.map(function (d) { return d.dataset.q; }) };
  }).filter(function (p) { return p.el; });

  var totalChecks = parts.reduce(function (n, p) { return n + 1 + p.qs.length; }, 0);

  function doneChecks() {
    return parts.reduce(function (n, p) {
      return n + (seen[p.id] ? 1 : 0) + p.qs.filter(function (q) { return opened[q]; }).length;
    }, 0);
  }
  function partDone(p) {
    return !!seen[p.id] && p.qs.every(function (q) { return opened[q]; });
  }

  var tick = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
  var bar, lblEl, progWrap;

  // Anything that would take the learner out of the platform stays hidden until the module
  // is done. Shown up front it is an exit route halfway through the work.
  var rewards = [].slice.call(document.querySelectorAll('[data-reveal="complete"]'));
  function setRewards(show) {
    rewards.forEach(function (el) { el.style.display = show ? '' : 'none'; });
  }
  setRewards(completed);

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
    parts.forEach(function (p) {
      var li = document.createElement('li');
      li.id = 'sco-i-' + p.id;
      li.innerHTML = '<span class="dot">' + tick + '</span><span class="t">' + p.label +
                     '</span><span class="sub"></span>';
      list.appendChild(li);
    });
  }

  function render() {
    var pct = totalChecks ? Math.round((doneChecks() / totalChecks) * 100) : 0;
    var missing = parts.filter(function (p) { return !partDone(p); });

    parts.forEach(function (p) {
      var li = document.getElementById('sco-i-' + p.id);
      if (!li) return;
      li.classList.toggle('on', partDone(p));
      var sub = li.querySelector('.sub');
      if (!sub) return;
      if (!p.qs.length || partDone(p)) { sub.textContent = ''; return; }
      var n = p.qs.filter(function (q) { return opened[q]; }).length;
      sub.textContent = n + ' of ' + p.qs.length + ' opened';
    });

    if (bar) bar.style.width = (completed ? 100 : pct) + '%';
    if (lblEl) {
      lblEl.textContent = completed ? 'Complete'
        : pct === 100 ? 'All done'
        : pct + '%';
    }
    if (progWrap) progWrap.classList.toggle('done', completed || pct === 100);

    if (completed) { panel.classList.add('is-done'); setRewards(true); return; }

    btn.disabled = missing.length > 0;
    if (!missing.length) {
      hint.textContent = 'Everything opened. You are good to mark this off.';
      return;
    }
    var unopened = parts.reduce(function (n, p) {
      return n + p.qs.filter(function (q) { return !opened[q]; }).length;
    }, 0);
    hint.textContent = unopened
      ? unopened + (unopened === 1 ? ' question' : ' questions') +
        ' still to open — tap one to expand it.'
      : 'Still to reach: ' + missing.map(function (p) { return p.label; }).join(', ') + '.';
  }

  function save() {
    if (live) { ScormAPI.setSuspendData({ seen: seen, opened: opened }); ScormAPI.commit(); }
  }

  // ── a section counts as seen once it has actually been on screen for a moment ──
  var timers = {};
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var id = e.target.id;
      if (e.isIntersecting) {
        timers[id] = setTimeout(function () {
          if (seen[id] || completed) return;
          seen[id] = true; save(); render();
        }, 1200);
      } else {
        clearTimeout(timers[id]);
      }
    });
  }, { threshold: 0.2 });
  parts.forEach(function (p) { io.observe(p.el); });

  // ── and a question counts once it has actually been expanded ──
  // Recorded on first open and never cleared: the accordion closes others as you go, so
  // tracking the current open state would lose everything already read.
  [].slice.call(document.querySelectorAll('details[data-q]')).forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open || completed) return;
      var q = d.dataset.q;
      if (opened[q]) return;
      opened[q] = true; save(); render();
    });
    if (d.open) opened[d.dataset.q] = true;   // anything open on load counts
    if (opened[d.dataset.q]) d.classList.add('read');   // restore last session's marks
  });

  btn.addEventListener('click', function () {
    if (completed || btn.disabled) return;
    completed = true;
    if (live) {
      ScormAPI.setStatus('completed');
      ScormAPI.setSuspendData({ seen: seen, opened: opened, done: true });
      ScormAPI.commit();
      ScormAPI.finish();               // terminal status only on a deliberate action
    }
    render();
    // Scroll to whatever just appeared rather than back to the panel: the reward for
    // finishing is the thing they could not see a moment ago.
    var target = rewards[0] || panel;
    // Guarded: an exception in a click handler inside an unknown LMS browser would
    // strand the learner on a button that looks like it did nothing.
    if (target.scrollIntoView) { try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
  });

  // Commit only. Never finish here — these events fire when they feel like it.
  function commitOnly() { if (live) ScormAPI.commit(); }
  window.addEventListener('beforeunload', commitOnly);
  window.addEventListener('pagehide', commitOnly);

  buildProgress();
  render();
})();
