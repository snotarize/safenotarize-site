(() => {
  'use strict';

  // New Google Ads account 787-234-8986. No legacy conversion labels or GA4 imports.
  const id = 'AW-18594593652';
  const origins = new Set(['https://safenotarize.com', 'https://www.safenotarize.com']);
  if (!origins.has(location.origin) ||
      navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' ||
      /^\/(?:premium-complete|thank-you(?:-ht)?|upload(?:-ht)?)(?:\.html)?$/.test(location.pathname) ||
      /^\/documents\/create(?:\/|(?:-ht)?\.html)/.test(location.pathname) ||
      window.SafeNotarizeGoogleAdsTag) return;

  // Ads libraries can inspect the current URL themselves. Do not load them on
  // resumed/private URLs, even when a sanitized page_location could be supplied.
  const params = new URLSearchParams(location.search);
  const publicValue = /^[a-zA-Z0-9_.-]{1,100}$/;
  for (const [key, value] of params) {
    const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_id',
      'utm_term', 'service', 'document_source', 'document_type', 'lang', 'gclsrc'].includes(key)
      ? publicValue.test(value)
      : ['gclid', 'gbraid', 'wbraid'].includes(key) ? /^[A-Za-z0-9_-]{8,256}$/.test(value)
      : ['gtm_debug', '_dbg'].includes(key) ? /^(?:x|\d{1,30})$/.test(value)
      : ['document_ready', 'gad_source', 'gad_campaignid'].includes(key) ? /^\d{1,30}$/.test(value)
      : false;
    if (!allowed) return;
  }
  if (location.hash && !['#pricing', '#pricing-block', '#faq', '#services', '#how-it-works'].includes(location.hash)) return;

  const page = new URL(location.pathname + location.search, location.origin);
  let referrer = '';
  try { if (document.referrer) referrer = new URL(document.referrer).origin + '/'; } catch {}
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('set', {
    page_location: page.href, page_referrer: referrer,
    allow_ad_personalization_signals: false
  });
  window.gtag('js', new Date());
  // The supported gtag.js installation explicitly configures this destination.
  // Loading a container URL alone does not prove that Ads has been initialized.
  window.gtag('config', id, {
    page_location: page.href, page_referrer: referrer,
    allow_ad_personalization_signals: false
  });
  window.SafeNotarizeGoogleAdsTag = id;
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  tag.referrerPolicy = 'no-referrer';
  document.head.append(tag);
  // Paid completions require a separately configured conversion action.
  // This base tag never treats a visit, checkout or authorization as a purchase.
})();
