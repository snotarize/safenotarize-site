(() => {
  'use strict';

  const origins = new Set(['https://safenotarize.com', 'https://www.safenotarize.com']);
  const path = location.pathname;
  const privatePage = /^\/(?:premium-complete|thank-you(?:-ht)?|upload(?:-ht)?)(?:\.html)?$/.test(path) ||
    /^\/documents\/create(?:\/|(?:-ht)?\.html)/.test(path);
  if (!origins.has(location.origin) || window.parent !== window || privatePage ||
      navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' ||
      window.SafeNotarizeJourney) return;

  // The widget reads its own page URL. Do not initialize it on private resume links.
  const publicKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'gclid', 'gbraid', 'wbraid',
    'lang', 'service', 'document_ready', 'document_source', 'document_type', 'source', 'from', 'mode']);
  function publicURL(url) {
    return [...url.searchParams].every(([key, value]) => publicKeys.has(key) && /^[a-zA-Z0-9_.-]{0,256}$/.test(value)) &&
      (!url.hash || ['#top', '#services', '#pricing-block', '#faq', '#contact', '#privacy', '#terms', '#how-it-works'].includes(url.hash));
  }
  if (!publicURL(new URL(location.href))) return;
  try {
    const previous = document.referrer && new URL(document.referrer);
    if (previous && origins.has(previous.origin) && (!publicURL(previous) ||
        /^\/(?:premium-complete|thank-you|upload|documents\/create)/.test(previous.pathname))) return;
  } catch { return; }

  const key = 'sn_visitor_journey_v1';
  const ttl = 30 * 60 * 1000;
  const maxQueue = 40;
  let state;
  try { state = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch {}
  const now = Date.now();
  if (!state || !/^[a-f0-9]{32}$/.test(state.id || '') || !Number.isFinite(state.updated) || now - state.updated > ttl) {
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      state = { id: [...bytes].map(x => x.toString(16).padStart(2, '0')).join(''), updated: now, sequence: 0, pending: [] };
    } catch { return; }
  }
  if (!Array.isArray(state.pending)) state.pending = [];
  state.pending = state.pending.slice(-maxQueue);
  state.sequence = Number.isSafeInteger(state.sequence) && state.sequence >= 0 ? state.sequence : 0;
  let route = /^\/book(?:-ht)?\.html$/.test(path) ? 'standard' : path === '/premium.html' ? 'premium' : 'public';
  let step = 'page';
  let ready = false;
  let draining = false;
  let hidden = false;
  let shownAt = now;
  let visibleMs = 0;
  const recent = new Map();
  const replies = new Map();
  const failures = new Set(['validation_failed', 'participant_conflict', 'saved_document_missing',
    'intake_request_failed', 'intake_response_incomplete', 'submission_failed', 'checkout_unavailable',
    'card_authorization_failed', 'payment_contract_invalid', 'invalid_quantity', 'document_unavailable',
    'order_needs_review', 'session_request_failed', 'security_check_failed', 'browser_offline', 'browser_script_error']);
  const reasons = new Set(['price', 'document_not_ready', 'technical_problem', 'need_help', 'another_time', 'other']);
  const allowedSteps = new Set(['page', 'checkout', 'signer_details', 'session_details', 'payment_details',
    'intake_submitted', 'authorizing_card', 'opening_session', 'session_ready']);
  const eventNames = new Map([
    ['page_visit', 'sn-page-visit'], ['notarization_cta_click', 'sn-booking-link-click'],
    ['notarization_service_selected', 'sn-service-selected'], ['notarization_document_choice', 'sn-document-choice'],
    ['begin_checkout', 'sn-checkout-ready'], ['notarization_booking_step', 'sn-booking-step'],
    ['notarization_intake_submitted', 'sn-intake-submitted'], ['notarization_issue', 'sn-recorded-error'],
    ['journey_step', 'sn-booking-progress'], ['page_hidden', 'sn-page-hidden'], ['page_resumed', 'sn-page-resumed'],
    ['visitor_feedback', 'sn-visitor-reported-reason']
  ]);
  const permittedNames = new Set(eventNames.values());
  const permittedMetadata = new Set(['visit', 'event-id', 'at', 'page', 'route', 'step', 'visible-seconds',
    'category', 'reason', 'evidence', 'document-choice', 'target']);
  // Stored queues are untrusted too. Never replay arbitrary metadata from browser storage.
  state.pending = state.pending.filter(item => {
    const meta = item?.meta;
    return permittedNames.has(item?.name) && meta && Object.keys(meta).every(x => permittedMetadata.has(x)) &&
      meta.visit === state.id && new RegExp('^' + state.id + '-[0-9]{1,10}$').test(meta['event-id'] || '') &&
      /^\/[a-zA-Z0-9\/-]*(?:\.html)?$/.test(meta.page || '') &&
      !/^\/(?:premium-complete|thank-you|upload|documents\/create)/.test(meta.page) &&
      ['public', 'standard', 'premium'].includes(meta.route) && allowedSteps.has(meta.step) &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(meta.at || '') &&
      /^\d{1,5}$/.test(meta['visible-seconds'] || '') &&
      (!meta.category || failures.has(meta.category)) && (!meta.reason || reasons.has(meta.reason)) &&
      ['activity-only', 'technical-observation', 'visitor-reported'].includes(meta.evidence) &&
      (!meta['document-choice'] || ['own', 'template'].includes(meta['document-choice'])) &&
      (!meta.target || ['start', 'standard_booking', 'premium_booking', 'document_library', 'document_editor'].includes(meta.target));
  });
  function save() {
    state.updated = Date.now();
    try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {}
  }
  function updateProfile(meta) {
    try {
      const attrs = { 'sn-visit': state.id, 'sn-last-page': meta.page, 'sn-last-step': meta.step };
      if (meta.reason) attrs['sn-reported-reason'] = meta.reason;
      if (meta.category) attrs['sn-recorded-error'] = meta.category;
      window.Tawk_API.setAttributes?.(attrs, () => {});
    } catch { /* Optional telemetry cannot affect booking. */ }
  }
  function flush() {
    if (!ready || draining || !state.pending.length || typeof window.Tawk_API?.addEvent !== 'function') return;
    const item = state.pending.shift();
    save(); // Attempt each event once; a lost acknowledgement must not create duplicates.
    draining = true;
    let completed = false;
    const timeout = setTimeout(() => finish(false), 8000);
    function finish(ok) {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      draining = false;
      replies.get(item.meta['event-id'])?.(ok);
      replies.delete(item.meta['event-id']);
      flush();
    }
    try {
      updateProfile(item.meta);
      window.Tawk_API.addEvent(item.name, item.meta, error => finish(!error));
    } catch { finish(false); }
  }
  function record(name, values = {}, reply) {
    const eventName = eventNames.get(name);
    if (!eventName) return false;
    const details = {};
    if (['standard', 'premium'].includes(values.booking_route)) route = values.booking_route;
    if (name === 'begin_checkout') step = 'checkout';
    if (name === 'notarization_intake_submitted') step = 'intake_submitted';
    if (allowedSteps.has(values.booking_step)) step = values.booking_step;
    if (name === 'notarization_issue') {
      if (!failures.has(values.error_type)) return false;
      details.category = values.error_type;
      details.evidence = 'technical-observation';
    } else if (name === 'visitor_feedback') {
      if (!reasons.has(values.reason)) return false;
      details.reason = values.reason;
      details.evidence = 'visitor-reported';
    } else details.evidence = 'activity-only';
    if (['own', 'template'].includes(values.document_choice)) details['document-choice'] = values.document_choice;
    if (['start', 'standard_booking', 'premium_booking', 'document_library', 'document_editor'].includes(values.cta_target)) {
      details.target = values.cta_target;
    }
    const signature = JSON.stringify([name, route, step, details]);
    if (name !== 'visitor_feedback' && Date.now() - (recent.get(signature) || 0) < 1500) return false;
    recent.set(signature, Date.now());
    state.sequence += 1;
    const id = state.id + '-' + state.sequence;
    const elapsed = Math.max(0, Math.floor((visibleMs + (hidden ? 0 : Date.now() - shownAt)) / 1000));
    const item = { name: eventName, meta: { visit: state.id, 'event-id': id, at: new Date().toISOString(),
      page: path, route, step, 'visible-seconds': String(Math.min(elapsed, 86400)), ...details } };
    if (state.pending.length >= maxQueue) {
      const old = state.pending.shift();
      replies.get(old.meta?.['event-id'])?.(false);
      replies.delete(old.meta?.['event-id']);
    }
    state.pending.push(item);
    if (reply) replies.set(id, reply);
    save();
    flush();
    return true;
  }
  function failure(errorType, bookingRoute = route) {
    record('notarization_issue', { error_type: errorType, booking_route: bookingRoute });
  }
  window.SafeNotarizeJourney = { record, failure };
  record('page_visit');
  for (const item of window.SafeNotarizeJourneyQueue || []) record(item.name, item.values);
  window.SafeNotarizeJourneyQueue = [];

  // Reuse the existing visitor system. Do not collect DOM, input values, files, stack traces or error messages.
  const api = window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = window.Tawk_LoadStart || new Date();
  const alreadyEmbedded = document.querySelector('script[src*="embed.tawk.to/"]');
  const existingOnLoad = api.onLoad;
  function onReady() {
    ready = true;
    if (!alreadyEmbedded) { try { api.hideWidget?.(); } catch {} }
    flush();
  }
  api.onLoad = function (...args) {
    try { existingOnLoad?.apply(this, args); } finally { onReady(); }
  };
  if (typeof api.addEvent === 'function') onReady();
  else if (!alreadyEmbedded) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://embed.tawk.to/67ada9c93a842732607e2b7e/1ijv5uenc';
    // The SDK requires an origin referrer; never send the page path or query.
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.setAttribute('crossorigin', '*');
    document.head.append(script);
  }

  function background() {
    if (hidden) return;
    visibleMs += Math.max(0, Date.now() - shownAt);
    hidden = true;
    record('page_hidden'); // A backgrounded page is not proof the visitor abandoned the service.
  }
  function foreground() {
    if (!hidden) return;
    hidden = false;
    shownAt = Date.now();
    record('page_resumed');
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' ? background() : foreground());
  window.addEventListener?.('pagehide', background);
  window.addEventListener?.('pageshow', foreground);
  window.addEventListener?.('offline', () => failure('browser_offline'));
  window.addEventListener?.('error', () => failure('browser_script_error'));
  document.addEventListener('invalid', () => failure('validation_failed'), true);
  document.addEventListener('click', click => {
    if (window.SafeNotarizeAnalytics || click.button > 0) return;
    try {
      const link = click.target?.closest?.('a[href]');
      if (!link) return;
      const next = new URL(link.href, location.href);
      if (!origins.has(next.origin)) return;
      const target = /^\/start(?:-ht)?\.html$/.test(next.pathname) ? 'start'
        : /^\/book(?:-ht)?\.html$/.test(next.pathname) ? 'standard_booking'
        : next.pathname === '/premium.html' ? 'premium_booking'
        : /^\/documents\/library(?:-ht)?\.html$/.test(next.pathname) ? 'document_library'
        : /^\/documents\/create\//.test(next.pathname) ? 'document_editor' : null;
      if (target) record('notarization_cta_click', { cta_target: target });
    } catch {}
  }, { capture: true });

  const bookingPage = /^\/(?:start(?:-ht)?|book(?:-ht)?|premium)\.html$/.test(path);
  if (!bookingPage || !document.body?.append) return;
  const ht = document.documentElement.lang === 'ht' || new URLSearchParams(location.search).get('lang') === 'ht';
  const copy = ht ? {
    open: 'Ou bezwen èd?', title: 'Ki sa ki anpeche w kontinye?', intro: 'Chwazi yon rezon, oswa fèmen fenèt la pou kontinye.',
    send: 'Voye kòmantè', close: 'Fèmen', success: 'Mèsi. Nou resevwa kòmantè ou.', failed: 'Nou pa t kapab voye kòmantè a. Ou ka kontinye.',
    sending: 'N ap voye l…', reason: 'Rezon', choose: 'Chwazi yon rezon', options: ['Pri a', 'Dokiman mwen poko pare', 'Yon pwoblèm teknik', 'Mwen bezwen èd', 'M ap retounen pita', 'Yon lòt rezon']
  } : {
    open: 'Having trouble?', title: 'What is stopping you?', intro: 'Choose a reason, or close this window to continue.',
    send: 'Send feedback', close: 'Close', success: 'Thank you. Your feedback was received.', failed: 'Feedback could not be sent. You can still continue.',
    sending: 'Sending…', reason: 'Reason', choose: 'Choose a reason', options: ['The price', 'My document is not ready', 'A technical problem', 'I need help', 'I will return later', 'Another reason']
  };
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/assets/visitor-journey.css?v=20261127';
  document.head.append(stylesheet);
  const section = document.createElement('section');
  section.className = 'sn-journey-feedback';
  const open = document.createElement('button');
  open.type = 'button'; open.className = 'sn-journey-open'; open.textContent = copy.open;
  const dialog = document.createElement('dialog');
  dialog.className = 'sn-journey-dialog'; dialog.setAttribute('aria-labelledby', 'sn-journey-title');
  const heading = document.createElement('h2'); heading.id = 'sn-journey-title'; heading.textContent = copy.title;
  const intro = document.createElement('p'); intro.textContent = copy.intro;
  const label = document.createElement('label'); label.htmlFor = 'sn-journey-reason'; label.textContent = copy.reason;
  const select = document.createElement('select'); select.id = 'sn-journey-reason';
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true; placeholder.textContent = copy.choose;
  select.append(placeholder);
  [...reasons].forEach((value, i) => {
    const option = document.createElement('option'); option.value = value; option.textContent = copy.options[i]; select.append(option);
  });
  const result = document.createElement('p'); result.setAttribute('role', 'status');
  const actions = document.createElement('div'); actions.className = 'sn-journey-actions';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = copy.close;
  const send = document.createElement('button'); send.type = 'button'; send.textContent = copy.send; send.className = 'sn-journey-send'; send.disabled = true;
  select.addEventListener('change', () => { send.disabled = !reasons.has(select.value); });
  close.addEventListener('click', () => { dialog.close(); open.focus(); });
  open.addEventListener('click', () => {
    result.textContent = ''; select.value = ''; send.disabled = true; dialog.showModal(); select.focus();
  });
  send.addEventListener('click', () => {
    if (!reasons.has(select.value)) return;
    send.disabled = true; result.textContent = copy.sending;
    let settled = false;
    const timer = setTimeout(() => done(false), 12000);
    function done(ok) {
      if (settled) return;
      settled = true; clearTimeout(timer); result.textContent = ok ? copy.success : copy.failed;
      if (!ok) send.disabled = false;
    }
    if (!record('visitor_feedback', { reason: select.value }, done)) done(false);
  });
  actions.append(close, send); dialog.append(heading, intro, label, select, result, actions); section.append(open, dialog);
  const main = document.querySelector('main');
  (main || document.body).append(section);
})();
