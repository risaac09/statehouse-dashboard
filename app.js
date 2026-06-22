/* Statehouse Dashboard: single IIFE, vanilla JS, no build step.
   Reads the cleaned JSON snapshots in /data and renders the views:
   activity feed, topic filter, search, and a per-bill vote breakdown. */
(function () {
  'use strict';

  var state = {
    meta: null,
    current: null,      // loaded dataset for the active state
    stateCode: null,
    topic: null,        // active topic filter
    query: '',
  };

  var els = {};
  function $(id) { return document.getElementById(id); }

  // --- small DOM helpers (textContent only; never innerHTML with data) ---
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function statusClass(status) { return 's-' + String(status || 'active').toLowerCase().replace(/[^a-z]+/g, '-'); }

  // pass | fail | unknown -> pill class + verb. Never asserts a result we don't have.
  function voteOutcome(result) {
    if (result === 'pass') return { cls: 'pass', verb: 'Passed' };
    if (result === 'fail') return { cls: 'fail', verb: 'Failed' };
    return { cls: 'unknown', verb: 'Recorded' };
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function daysAgo(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return '';
    var diff = Math.round((Date.now() - d.getTime()) / 86400000);
    if (diff <= 0) return 'today';
    if (diff === 1) return 'yesterday';
    if (diff < 7) return diff + ' days ago';
    if (diff < 30) return Math.floor(diff / 7) + 'w ago';
    return fmtDate(iso);
  }

  // --- data loading ---
  function load(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> ' + r.status);
      return r.json();
    });
  }

  function init() {
    els = {
      stateSelect: $('state-select'), summary: $('summary'), feed: $('feed'),
      chips: $('topic-chips'), search: $('search'), empty: $('empty'),
      banner: $('sample-banner'), updated: $('updated'),
      overlay: $('overlay'), detail: $('detail'), detailBody: $('detail-body'),
      detailClose: $('detail-close'),
    };

    els.search.addEventListener('input', function () { state.query = els.search.value.trim().toLowerCase(); renderFeed(); });
    els.stateSelect.addEventListener('change', function () { selectState(els.stateSelect.value); });
    els.detailClose.addEventListener('click', closeDetail);
    els.overlay.addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

    load('data/meta.json').then(function (meta) {
      state.meta = meta;
      meta.states.forEach(function (s) {
        els.stateSelect.appendChild(el('option', { value: s.state, text: s.jurisdiction }));
      });
      var DEFAULT_STATE = 'ri';
      var codes = meta.states.map(function (s) { return s.state; });
      var hash = location.hash.replace('#', '');
      var initial = (hash && codes.indexOf(hash) !== -1) ? hash
        : (codes.indexOf(DEFAULT_STATE) !== -1 ? DEFAULT_STATE
          : (meta.states[0] && meta.states[0].state));
      els.stateSelect.value = initial;
      selectState(initial);
    }).catch(function (err) {
      els.feed.appendChild(el('p', { class: 'empty', text: 'Could not load data index. ' + err.message }));
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    }
  }

  function selectState(code) {
    if (!code) return;
    state.stateCode = code;
    state.topic = null;
    location.hash = code;
    load('data/' + code + '.json').then(function (ds) {
      state.current = ds;
      els.banner.hidden = !ds.sample;
      els.updated.textContent = fmtDate((ds.updated || '').slice(0, 10)) || '…';
      renderSummary();
      renderChips();
      renderFeed();
    }).catch(function (err) {
      els.feed.textContent = '';
      els.feed.appendChild(el('p', { class: 'empty', text: 'No data for that state yet. ' + err.message }));
    });
  }

  // --- summary cards ---
  function renderSummary() {
    if (!state.current) return;
    var bills = state.current.bills || [];
    var weekAgo = Date.now() - 7 * 86400000;
    var thisWeek = bills.filter(function (b) {
      var t = Date.parse(b.latestActionDate + 'T00:00:00');
      return !isNaN(t) && t >= weekAgo;
    }).length;
    var enacted = bills.filter(function (b) { return b.status === 'Enacted'; }).length;
    var withVotes = bills.filter(function (b) { return (b.votes || []).length; }).length;
    var cards = [
      [bills.length, 'bills tracked'],
      [thisWeek, 'moved this week'],
      [withVotes, 'with recorded votes'],
      [enacted, 'enacted'],
    ];
    els.summary.textContent = '';
    cards.forEach(function (c) {
      els.summary.appendChild(el('div', { class: 'stat' }, [
        el('div', { class: 'n', text: String(c[0]) }),
        el('div', { class: 'l', text: c[1] }),
      ]));
    });
  }

  // --- topic chips ---
  function renderChips() {
    if (!state.current) return;
    els.chips.textContent = '';
    (state.current.subjects || []).forEach(function (subj) {
      var chip = el('button', {
        class: 'chip', type: 'button', 'aria-pressed': state.topic === subj ? 'true' : 'false',
        text: subj, onclick: function () { state.topic = state.topic === subj ? null : subj; renderChips(); renderFeed(); },
      });
      els.chips.appendChild(chip);
    });
    if ((state.current.subjects || []).length && state.current.subjectsDerived) {
      els.chips.appendChild(el('span', { class: 'chip-note',
        text: "Topics inferred from each bill's text, not official classification." }));
    }
  }

  // --- feed ---
  function matches(b) {
    if (state.topic && (b.subjects || []).indexOf(state.topic) === -1) return false;
    if (state.query) {
      var hay = [b.identifier, b.title, b.summary, b.sponsor].join(' ').toLowerCase();
      if (hay.indexOf(state.query) === -1) return false;
    }
    return true;
  }

  function renderFeed() {
    if (!state.current) return;
    var list = (state.current.bills || []).filter(matches);
    els.feed.textContent = '';
    els.empty.hidden = list.length > 0;
    list.forEach(function (b) {
      var sc = statusClass(b.status);
      var meta = [
        el('span', { class: 'status ' + sc, text: b.status || 'Active' }),
        el('span', { text: b.chamber || '' }),
        el('span', { text: b.sponsor || '' }),
      ];
      (b.subjects || []).slice(0, 3).forEach(function (s) { meta.push(el('span', { class: 'topic-tag', text: s })); });
      if ((b.votes || []).length) {
        var v = b.votes[0];
        var o = voteOutcome(v.result);
        meta.push(el('span', { class: 'vote-pill ' + o.cls,
          text: o.verb + ' ' + v.counts.yes + '–' + v.counts.no }));
      }
      var card = el('button', { class: 'bill ' + sc, type: 'button', onclick: function () { openDetail(b); } }, [
        el('div', { class: 'bill-top' }, [
          el('span', { class: 'bill-id', text: b.identifier }),
          el('span', { class: 'bill-date', text: daysAgo(b.latestActionDate) }),
        ]),
        el('p', { class: 'bill-summary', text: b.summary }),
        el('div', { class: 'bill-meta' }, meta),
      ]);
      els.feed.appendChild(card);
    });
  }

  // --- detail drawer ---
  var lastFocus = null;
  function openDetail(b) {
    lastFocus = document.activeElement;
    var body = els.detailBody;
    body.textContent = '';
    body.appendChild(el('h2', { id: 'detail-title', text: b.identifier }));
    body.appendChild(el('p', { class: 'plain', text: b.summary }));
    body.appendChild(el('p', { class: 'note', text: b.summarySource === 'abstract'
      ? 'Auto-summarized from the official abstract.' : 'No abstract available; showing the official title.' }));
    body.appendChild(el('p', { class: 'official-title', text: b.title }));

    var tags = el('div', { class: 'bill-meta' }, [
      el('span', { class: 'status ' + statusClass(b.status), text: b.status }),
      el('span', { text: b.chamber }),
      el('span', { text: b.sponsor }),
    ]);
    (b.subjects || []).forEach(function (s) { tags.appendChild(el('span', { class: 'topic-tag', text: s })); });
    body.appendChild(tags);
    if (b.subjectsDerived && (b.subjects || []).length) {
      body.appendChild(el('p', { class: 'note', text: 'Topics inferred from the bill text, not official classification.' }));
    }

    // Votes
    if ((b.votes || []).length) {
      body.appendChild(el('h3', { text: 'How they voted' }));
      b.votes.forEach(function (v) { body.appendChild(voteCard(v)); });
    }

    // Timeline
    if ((b.actions || []).length) {
      body.appendChild(el('h3', { text: 'What happened' }));
      var ul = el('ul', { class: 'timeline' });
      b.actions.forEach(function (a) {
        ul.appendChild(el('li', {}, [
          el('span', { class: 't-date', text: fmtDate(a.date) }),
          el('span', { text: a.description }),
        ]));
      });
      body.appendChild(ul);
    }

    if (b.url) body.appendChild(el('a', { class: 'source-link', href: b.url, target: '_blank', rel: 'noopener', text: 'View official record →' }));

    els.detail.setAttribute('aria-labelledby', 'detail-title');
    els.overlay.hidden = false;
    els.detail.hidden = false;
    setBackgroundInert(true);
    els.detail.addEventListener('keydown', trapTab);
    els.detail.focus();
  }

  // --- modal a11y: focus trap + background hidden from assistive tech ---
  function focusable(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(function (n) { return n.offsetParent !== null; });
  }
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    var f = focusable(els.detail);
    if (!f.length) { e.preventDefault(); els.detail.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function setBackgroundInert(on) {
    ['main', '.topbar', '.banner', '.footer'].forEach(function (sel) {
      var n = document.querySelector(sel);
      if (!n) return;
      if (on) n.setAttribute('aria-hidden', 'true'); else n.removeAttribute('aria-hidden');
    });
  }

  function voteCard(v) {
    var total = v.counts.yes + v.counts.no + v.counts.other || 1;
    var bar = el('div', { class: 'vote-bar', role: 'img',
      'aria-label': v.counts.yes + ' yes, ' + v.counts.no + ' no, ' + v.counts.other + ' other' });
    [['yes', v.counts.yes], ['no', v.counts.no], ['other', v.counts.other]].forEach(function (p) {
      if (p[1] > 0) {
        var seg = el('span', { class: p[0], text: p[1] > 0 ? String(p[1]) : '' });
        seg.style.width = (100 * p[1] / total) + '%';
        bar.appendChild(seg);
      }
    });

    var parties = el('div', { class: 'party-rows' });
    Object.keys(v.byParty).sort().forEach(function (code) {
      var pc = v.byParty[code];
      var pt = (pc.yes + pc.no + pc.other) || 1;
      var split = el('div', { class: 'party-split' });
      ['yes', 'no', 'other'].forEach(function (o) {
        if (pc[o] > 0) { var s = el('span', { class: o }); s.style.width = (100 * pc[o] / pt) + '%'; split.appendChild(s); }
      });
      parties.appendChild(el('div', { class: 'party-row' }, [
        el('span', { class: 'party-key ' + code, text: code }),
        el('div', {}, [split, el('span', { class: 'party-counts', text: ' ' + pc.yes + ' yes · ' + pc.no + ' no' + (pc.other ? ' · ' + pc.other + ' other' : '') })]),
      ]));
    });

    return el('div', { class: 'vote-card' }, [
      el('div', { class: 'vote-head' }, [
        el('span', { class: 'vote-motion', text: v.motion }),
        el('span', { class: 'vote-pill ' + voteOutcome(v.result).cls, text: voteOutcome(v.result).verb }),
      ]),
      el('div', { class: 'bill-date', text: v.chamber + ' · ' + fmtDate(v.date) }),
      el('div', { style: 'margin-top:8px' }, [bar]),
      Object.keys(v.byParty).length ? parties : el('p', { class: 'party-counts', text: 'Per-member breakdown not recorded for this vote.' }),
    ]);
  }

  function closeDetail() {
    if (els.detail.hidden) return;
    els.detail.removeEventListener('keydown', trapTab);
    els.detail.hidden = true;
    els.overlay.hidden = true;
    setBackgroundInert(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
