(() => {
  'use strict';

  const origins = new Set(['https://safenotarize.com', 'https://www.safenotarize.com']);
  // Private receipts, uploads, document editors and Worker-hosted documents are deliberately excluded.
  if (!origins.has(location.origin) || window.parent !== window ||
      navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' ||
      /^\/(?:premium-complete|thank-you(?:-ht)?|upload(?:-ht)?)(?:\.html)?$/.test(location.pathname) ||
      /^\/documents\/create(?:\/|(?:-ht)?\.html)/.test(location.pathname)) return;
  if (window.SafeNotarizeAnalytics) return;

  const stream = 'G-EJKPHSTSNH';
  const params = new URLSearchParams(location.search);
  const hasPaidClick = ['gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid'].some(key => params.has(key));
  const medium = (params.get('utm_medium') || '').trim().toLowerCase();
  let referringHost = '';
  try { referringHost = new URL(document.referrer).hostname; } catch {}
  // Existing isolated journeys own these specific page views. Direct visits
  // and other traffic are measured here so the pages no longer have blind spots.
  const official = /^\/documents\/(?:ht\/)?official\/(?:ds-3053|ps-1583)\.html$/.test(location.pathname);
  const organicEngine = medium === 'organic' && ['google', 'bing'].includes((params.get('utm_source') || '').trim().toLowerCase());
  const organicReferrer = /^(?:www\.)?(?:google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})|bing\.com)$/.test(referringHost);
  if (official && !hasPaidClick && (!medium || medium === 'organic') && (organicEngine || organicReferrer)) return;
  const vehicle = /^\/documents\/(?:ht\/)?vehicle-release-authorization\.html$/.test(location.pathname);
  if (vehicle && !hasPaidClick && params.get('utm_source') === 'ketterle_sons' &&
      params.get('utm_medium') === 'referral' && params.get('utm_campaign') === 'vehicle_release' &&
      ['counter_qr', 'checklist_pdf', 'website_link'].includes(params.get('utm_content') ?? 'website_link')) return;

  const page = new URL(location.pathname, location.origin);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const value = params.get(key);
    if (value && /^[a-zA-Z0-9_.-]{1,100}$/.test(value)) page.searchParams.set(key, value);
  }
  for (const key of ['gclid', 'gbraid', 'wbraid']) {
    const value = params.get(key);
    if (value && /^[A-Za-z0-9_-]{8,256}$/.test(value)) page.searchParams.set(key, value);
  }
  let referrer = '';
  try { if (document.referrer) referrer = new URL(document.referrer).origin + '/'; } catch {}
  const fields = { page_location: page.href, page_referrer: referrer };
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const needsTag = !document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
  if (needsTag) window.gtag('js', new Date());
  // Apply clean URLs before configuring GA4 so access tokens, email addresses and order URLs stay private.
  window.gtag('set', fields);
  window.gtag('config', stream, {
    ...fields, send_page_view: false,
    allow_google_signals: false, allow_ad_personalization_signals: false
  });
  if (needsTag) {
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + stream;
    tag.referrerPolicy = 'no-referrer';
    document.head.append(tag);
  }
  const recorded = new Set();
  function event(name, values = {}, once = '') {
    if (once && recorded.has(once)) return;
    if (once) recorded.add(once);
    try {
      window.gtag('event', name, { ...fields, ...values, send_to: stream, transport_type: 'beacon' });
    } catch { /* Optional measurement never blocks navigation or a booking. */ }
  }
  const routeFor = service => service === 'regular' || service === 'standard'
    ? 'standard' : service === 'premium' ? 'premium' : null;
  function bookingStep(route, step) {
    const valid = route === 'standard' ? ['signer_details', 'session_details']
      : route === 'premium' ? ['payment_details'] : [];
    if (valid.includes(step)) event('notarization_booking_step', {
      booking_route: route, booking_step: step
    }, 'step:' + route + ':' + step);
  }
  event('page_view');

  // Only fixed navigation categories are measured. Never read form values,
  // link text, document contents, customer identifiers or destination queries.
  document.addEventListener?.('click', click => {
    try {
      if (click.button > 0) return;
      const link = click.target?.closest?.('a[href]');
      if (!link) return;
      const next = new URL(link.href, location.href);
      if (!origins.has(next.origin)) return;
      const target = /^\/start(?:-ht)?(?:\.html)?$/.test(next.pathname) ? 'start'
        : /^\/book(?:-ht)?(?:\.html)?$/.test(next.pathname) ? 'standard_booking'
        : /^\/premium(?:\.html)?$/.test(next.pathname) ? 'premium_booking'
        : /^\/documents\/library(?:-ht)?(?:\.html)?$/.test(next.pathname) ? 'document_library'
        : /^\/documents\/create(?:\/|(?:-ht)?\.html)/.test(next.pathname) ? 'document_editor' : null;
      if (target) event('notarization_cta_click', { cta_target: target }, 'cta:' + target);
    } catch { /* Malformed links do not affect the customer journey. */ }
  }, { capture: true });

  function get(field) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 1200);
      window.gtag('get', stream, field, value => { clearTimeout(timer); resolve(value); });
    });
  }
  window.SafeNotarizeAnalytics = {
    async context() {
      try {
        const [clientId, sessionId] = await Promise.all([get('client_id'), get('session_id')]);
        const session = String(sessionId ?? '');
        return typeof clientId === 'string' && /^\d{1,20}\.\d{1,20}$/.test(clientId) && /^\d{1,20}$/.test(session)
          ? { clientId, sessionId: session } : null;
      } catch { return null; }
    },
    bookingStarted(route) {
      if (!['standard', 'premium'].includes(route)) return;
      event('begin_checkout', { booking_route: route }, 'checkout:' + route);
      bookingStep(route, route === 'standard' ? 'signer_details' : 'payment_details');
    },
    serviceSelected(service) {
      const route = routeFor(service);
      if (route) event('notarization_service_selected', { booking_route: route }, 'service:' + route);
    },
    documentChoiceSelected(service, choice) {
      const route = routeFor(service);
      if (route && ['own', 'template'].includes(choice)) event('notarization_document_choice', {
        booking_route: route, document_choice: choice
      }, 'document:' + route + ':' + choice);
    },
    bookingStep,
    intakeSubmitted(route) {
      if (['standard', 'premium'].includes(route)) event('notarization_intake_submitted', {
        booking_route: route
      }, 'intake:' + route);
    }
  };
  // Purchases are emitted privately after payment verification; visiting a page never emits a purchase.
})();
