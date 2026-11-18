(() => {
  'use strict';

  const origins = new Set(['https://safenotarize.com', 'https://www.safenotarize.com']);
  if (!origins.has(location.origin) || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;

  const endpoint = 'https://safenotarize-vehicle-release-metrics.karlberryj.workers.dev/v1/';
  const visitKey = 'sn_order_attribution_visit';
  const pendingKey = 'sn_order_attribution_pending';
  const lifetime = 24 * 60 * 60 * 1000;
  const campaignNames = new Set(['online_notary_transactions', 'vehicle_release_orlando']);
  const clickTypes = ['gclid', 'gbraid', 'wbraid'];
  const clickPattern = /^[A-Za-z0-9_-]{8,256}$/;
  const openAiClickPattern = /^[A-Za-z0-9._~+\/=-]{8,512}$/;
  const standardId = /^rec[A-Za-z0-9]{14,20}$/;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const resultPage = /^\/(?:thank-you(?:-ht)?|premium-complete|upload(?:-ht)?)(?:\.html)?$/.test(location.pathname);
  const inFlight = new Set();

  function read(key, fallback) {
    try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function save(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); }
    catch { /* A browser storage failure never blocks a booking. */ }
  }

  function fresh(time) {
    const age = Date.now() - time;
    return Number.isSafeInteger(time) && age >= 0 && age < lifetime;
  }

  function visit() {
    const saved = read(visitKey, null);
    return fresh(saved?.startedAt) ? saved : { source: 'direct_or_unknown', startedAt: Date.now() };
  }

  function captureVisit() {
    const params = new URLSearchParams(location.search);
    const medium = (params.get('utm_medium') ?? '').toLowerCase();
    const taggedSource = (params.get('utm_source') ?? '').toLowerCase();
    const name = params.get('utm_campaign');
    const clickType = clickTypes.find(type => clickPattern.test(params.get(type) ?? ''));
    const paidMedium = /^(?:cpc|ppc|paid(?:[_ -](?:search|social))?|cpm|display)$/.test(medium);
    const startedAt = Date.now();
    if (clickType || (paidMedium && taggedSource === 'google')) {
      save(visitKey, { source: 'google_ads', startedAt,
        ...(campaignNames.has(name) ? { campaign: name } : {}),
        ...(clickType ? { clickType, clickId: params.get(clickType) } : {}) });
      return;
    }
    if (medium === 'cpc' && taggedSource === 'chatgpt' && name === 'online_notary_chatgpt' &&
        typeof crypto.randomUUID === 'function') {
      const previousId = visit().chatgptVisitId;
      const visitId = uuid.test(previousId) ? previousId : crypto.randomUUID();
      const reference = params.get('oppref');
      const isAdReference = reference && reference !== 'preview_mock' && openAiClickPattern.test(reference);
      save(visitKey, {
        source: 'other_paid', startedAt, chatgptVisitId: visitId,
        ...(isAdReference ? { chatgptClickRef: reference } : {})
      });
      trackStage('landing', '', visitId);
      return;
    }
    if (paidMedium || params.has('msclkid')) {
      save(visitKey, { source: 'other_paid', startedAt });
      return;
    }
    if (medium === 'organic' || medium === 'referral') {
      save(visitKey, { source: medium === 'organic' ? 'organic_search' : 'referral', startedAt });
      return;
    }
    if (!document.referrer) return;
    const referrer = new URL(document.referrer);
    if (origins.has(referrer.origin)) return;
    const host = referrer.hostname;
    const fromSearch = /^(?:www\.)?(?:google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})|bing\.com|duckduckgo\.com|search\.yahoo\.com|search\.brave\.com)$/.test(host);
    save(visitKey, { source: fromSearch ? 'organic_search' : 'referral', startedAt });
  }

  function pending() {
    const rows = read(pendingKey, []);
    return Array.isArray(rows) ? rows.filter(row => fresh(row?.createdAt)).slice(-8) : [];
  }

  function orderKey(row) {
    return row.route + ':' + row.orderId + ':' + row.proof;
  }

  async function orderProof(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function post(path, body) {
    return fetch(endpoint + path, {
      method: 'POST', body: JSON.stringify(body), keepalive: true,
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error'
    });
  }

  function trackStage(stage, route, visitId = visit().chatgptVisitId) {
    try {
      if (!uuid.test(visitId)) return;
      void post('chatgpt-funnel', { stage, route, visitId }).catch(() => {});
    } catch { /* Measurement never blocks a booking. */ }
  }

  function send(row) {
    const key = orderKey(row);
    if (inFlight.has(key)) return;
    inFlight.add(key);
    const { createdAt, ...body } = row;
    void post('orders', body).then(response => {
      if (response.ok) save(pendingKey, pending().filter(item => orderKey(item) !== key));
    }).catch(() => {}).finally(() => inFlight.delete(key));
  }

  async function remember(route, orderId, proof, source, acquisition) {
    const documentSource = ['library', 'generated', 'template'].includes(source) ? 'library' : 'own';
    const { startedAt, ...attribution } = acquisition;
    const ga4 = await window.SafeNotarizeAnalytics?.context?.();
    const row = { route, orderId, proof, documentSource, ...attribution,
      ...(ga4 ? { ga4 } : {}), createdAt: Date.now() };
    const queue = pending();
    const previous = queue.find(item => orderKey(item) === orderKey(row));
    if (!previous) save(pendingKey, [...queue, row].slice(-8));
    send(previous ?? row);
  }

  window.SafeNotarizeOrderAttribution = {
    serviceSelected(service) {
      trackStage('service_selected', service === 'regular' ? 'standard' : 'premium');
    },
    bookingStarted(route) {
      trackStage('booking_started', route);
      window.SafeNotarizeAnalytics?.bookingStarted?.(route);
    },
    async standard(orderId, requestId, documentSource) {
      try {
        if (!standardId.test(orderId) || !uuid.test(requestId)) return;
        const acquisition = visit();
        const proof = await orderProof(requestId.toLowerCase());
        await remember('standard', orderId, proof, documentSource, acquisition);
      } catch { /* Attribution is optional for order intake. */ }
    },
    async premium(orderId, access, documentSource) {
      try {
        if (!uuid.test(orderId) || !/^[0-9a-f]{64}$/.test(access)) return;
        const acquisition = visit();
        const proof = await orderProof(access);
        await remember('premium', orderId, proof, documentSource, acquisition);
      } catch { /* Attribution is optional for checkout. */ }
    }
  };

  try {
    if (!resultPage) captureVisit();
    const standardForm = document.getElementById?.('booking-form');
    if (standardForm && !standardForm.classList.contains('intake-hidden')) {
      trackStage('booking_started', 'standard');
      window.SafeNotarizeAnalytics?.bookingStarted?.('standard');
    }
    for (const row of pending()) send(row);
  } catch { /* The site remains usable when attribution is unavailable. */ }
})();
