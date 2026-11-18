(() => {
  'use strict';

  const origins = new Set(['https://safenotarize.com', 'https://www.safenotarize.com']);
  // Private receipts, uploads, document editors and Worker-hosted documents are deliberately excluded.
  if (!origins.has(location.origin) || window.parent !== window ||
      navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' ||
      /^\/(?:premium-complete|thank-you(?:-ht)?|upload(?:-ht)?)(?:\.html)?$/.test(location.pathname) ||
      /^\/documents\/create(?:\/|(?:-ht)?\.html)/.test(location.pathname)) return;

  const stream = 'G-EJKPHSTSNH';
  const params = new URLSearchParams(location.search);
  const paid = ['gclid', 'gbraid', 'wbraid', 'msclkid'].some(key => params.has(key)) ||
    /^(?:cpc|ppc|paid|cpm|display)$/.test(params.get('utm_medium') || '');
  // Existing isolated analytics already measures the organic/referral vehicle-release journey.
  if (/^\/documents\/(?:ht\/)?vehicle-release-authorization\.html$/.test(location.pathname) && !paid) return;

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
  window.gtag('event', 'page_view', { ...fields, send_to: stream });

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
      window.gtag('event', 'begin_checkout', { ...fields, send_to: stream, booking_route: route });
    }
  };
  // Purchases are emitted privately after payment verification; visiting a page never emits a purchase.
})();
