(() => {
  'use strict';

  const endpoint = 'https://safenotarize-vehicle-release-metrics.karlberryj.workers.dev/v1/events';
  const storageKey = 'sn_vehicle_release_journey';
  const maxAge = 4 * 60 * 60 * 1000;
  const guide = /^\/documents\/(ht\/)?vehicle-release-authorization(?:\.html)?$/.exec(location.pathname);
  const template = /^\/documents\/create(-ht)?(?:\.html)?$/.exec(location.pathname);
  const booking = /^\/book(?:-ht)?(?:\.html)?$/.test(location.pathname);
  const params = new URLSearchParams(location.search);
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;

  function channel() {
    const medium = (params.get('utm_medium') || '').trim().toLowerCase();
    if (['gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid'].some(key => params.has(key)) ||
        /^(?:cpc|ppc|paid|paid[-_ ]?(?:search|social)|cpm|display)$/.test(medium)) return 'paid';
    if (medium === 'organic') return 'organic';
    try {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host === 'safenotarize.com') return 'internal';
      if (/^(?:[a-z0-9-]+\.)?(?:bing\.com|duckduckgo\.com|search\.yahoo\.com|search\.brave\.com)$/.test(host) ||
          /^(?:[a-z0-9-]+\.)?google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})$/.test(host)) return 'organic';
      return 'referral';
    } catch {
      return 'unknown';
    }
  }

  function currentJourney() {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    const age = Date.now() - stored?.createdAt;
    return stored?.id && age >= 0 && age < maxAge ? stored : null;
  }

  function startJourney(entry, language) {
    return { id: crypto.randomUUID(), entry, language, channel: channel(), createdAt: Date.now() };
  }

  function record(event, { id, entry, language, channel }, extra = {}) {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, id, entry, language, channel, ...extra }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      keepalive: true
    }).catch(() => {});
  }

  async function linkDocument(journey, document) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(document.token));
    const documentProof = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    await record('document_link', journey, { documentId: document.id, documentProof });
  }

  try {
    if (guide) {
      const language = guide[1] ? 'ht' : 'en';
      const existing = currentJourney();
      const journey = existing?.entry === 'guide' && existing.language === language
        ? existing : startJourney('guide', language);
      sessionStorage.setItem(storageKey, JSON.stringify(journey));
      void record('guide_view', journey);
    } else if (template && params.get('type')?.trim().toLowerCase() === 'vehicle-release') {
      const journey = currentJourney() || startJourney('template', template[1] ? 'ht' : 'en');
      journey.templateAt ??= Date.now();
      sessionStorage.setItem(storageKey, JSON.stringify(journey));
      void record('template_start', journey);
    } else if (booking && params.get('document_source') === 'library' && params.get('document_type') === 'vehicle-release') {
      const journey = currentJourney();
      const document = window.SafeNotarizeDocumentHandoff?.pending();
      if (journey?.templateAt && document?.document_type === 'vehicle-release' && document.uploaded_at >= journey.templateAt) {
        void linkDocument(journey, document).catch(() => {});
      }
    }
  } catch {
    // Tracking is optional for the document and booking flow.
  }
})();
