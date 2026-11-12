(() => {
  'use strict';

  const site = 'https://safenotarize.com';
  const origins = new Set([site, 'https://www.safenotarize.com']);
  const frameOrigin = 'https://safenotarize-official-form-analytics.karlberryj.workers.dev';
  const framePath = '/booking-analytics.html';
  const stream = 'G-EJKPHSTSNH';
  const channel = 'safenotarize-official-form-analytics';
  const journeyKey = 'sn_official_form_journey:';
  const bookingsKey = 'sn_official_form_booking_attribution';
  const hour = 60 * 60 * 1000;
  const journeyLifetime = 4 * hour;
  const bookingLifetime = 24 * hour;
  const formPages = new Map([
    ['/documents/official/ds-3053.html', { type: 'ds-3053', language: 'en', title: 'DS-3053' }],
    ['/documents/ht/official/ds-3053.html', { type: 'ds-3053', language: 'ht', title: 'DS-3053' }],
    ['/documents/official/ps-1583.html', { type: 'ps-1583', language: 'en', title: 'USPS Form 1583' }],
    ['/documents/ht/official/ps-1583.html', { type: 'ps-1583', language: 'ht', title: 'USPS Form 1583' }]
  ]);
  const engines = new Map([['google', 'https://www.google.com/'], ['bing', 'https://www.bing.com/']]);
  const events = new Set(['page_view', 'notarization_continue', 'notarization_booking_confirmed']);
  const routes = new Set(['standard', 'premium']);
  const orderIdPattern = /^(?:rec[a-zA-Z0-9]{14,20}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;

  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;

  function validJourney(journey, lifetime = journeyLifetime) {
    const age = Date.now() - journey?.startedAt;
    return formPages.has(journey?.page) && engines.has(journey.engine) &&
      age >= 0 && age < lifetime && Number.isSafeInteger(journey.startedAt) &&
      typeof journey.clientId === 'string' && /^\d{1,10}\.\d{10}$/.test(journey.clientId) &&
      journey.clientId.split('.')[1] === String(Math.floor(journey.startedAt / 1000));
  }

  function runFrame() {
    if (window.parent === window) return;
    let clientId;
    window.addEventListener('message', message => {
      const payload = message.data;
      if (!origins.has(message.origin) || message.source !== window.parent ||
          payload?.channel !== channel || !validJourney(payload.journey, bookingLifetime)) return;
      const { name, route, sequence, journey } = payload;
      if (name !== null && (!events.has(name) || !Number.isSafeInteger(sequence) ||
          (name === 'notarization_booking_confirmed' ? !routes.has(route) : route !== undefined))) return;
      if (clientId && clientId !== journey.clientId) return;

      const form = formPages.get(journey.page);
      const fields = {
        page_location: site + journey.page,
        page_referrer: engines.get(journey.engine),
        page_title: `${form.title} | SafeNotarize`,
        campaign_source: journey.engine,
        campaign_medium: 'organic',
        session_id: Math.floor(journey.startedAt / 1000)
      };
      if (!clientId) {
        clientId = journey.clientId;
        window.dataLayer = [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('consent', 'default', {
          ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
        });
        window.gtag('config', stream, {
          ...fields, client_id: clientId, send_page_view: false,
          cookie_expires: 0, cookie_update: false,
          allow_google_signals: false, allow_ad_personalization_signals: false
        });
        const tag = document.createElement('script');
        tag.async = true;
        tag.referrerPolicy = 'no-referrer';
        tag.src = `https://www.googletagmanager.com/gtag/js?id=${stream}`;
        document.head.append(tag);
      }

      if (name === null) return;
      window.gtag('event', name, {
        ...fields, send_to: stream, form_type: form.type, form_language: form.language,
        ...(route ? { booking_route: route } : {}),
        event_timeout: 450,
        event_callback: () => message.source.postMessage({ channel, sequence }, message.origin)
      });
    });
  }

  if (location.origin === frameOrigin && location.pathname === framePath) {
    runFrame();
    return;
  }
  if (!origins.has(location.origin) || window.parent !== window) return;

  let frame;
  let sequence = 0;
  function frameFor(journey) {
    if (frame?.clientId === journey.clientId) return frame;
    frame?.element.remove();
    const element = document.createElement('iframe');
    element.hidden = true;
    element.title = 'SafeNotarize Analytics';
    element.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    element.referrerPolicy = 'no-referrer';
    element.src = frameOrigin + framePath;
    const ready = new Promise(resolve => element.addEventListener('load', resolve, { once: true }));
    const attribution = { page: journey.page, engine: journey.engine, startedAt: journey.startedAt, clientId: journey.clientId };
    void ready.then(() => element.contentWindow?.postMessage({ channel, name: null, journey: attribution }, frameOrigin));
    document.body.append(element);
    frame = { element, ready, attribution, clientId: journey.clientId };
    return frame;
  }

  function send(name, journey, route) {
    const { element, ready, attribution } = frameFor(journey);
    const eventSequence = ++sequence;
    return new Promise(resolve => {
      function finish() {
        clearTimeout(timer);
        window.removeEventListener('message', acknowledge);
        resolve();
      }
      function acknowledge(message) {
        if (message.origin === frameOrigin && message.source === element.contentWindow &&
            message.data?.channel === channel && message.data.sequence === eventSequence) finish();
      }
      const timer = setTimeout(finish, 650);
      window.addEventListener('message', acknowledge);
      void ready.then(() => element.contentWindow?.postMessage({
        channel, sequence: eventSequence, name, route, journey: attribution
      }, frameOrigin));
    });
  }

  function readJourney(type) {
    const journey = JSON.parse(sessionStorage.getItem(journeyKey + type) || 'null');
    return validJourney(journey) && formPages.get(journey.page).type === type ? journey : null;
  }

  function saveJourney(type, journey) {
    sessionStorage.setItem(journeyKey + type, JSON.stringify(journey));
  }

  function readBookings() {
    const items = JSON.parse(localStorage.getItem(bookingsKey) || '[]');
    return Array.isArray(items) ? items.filter(item => routes.has(item?.route) &&
      typeof item.orderId === 'string' && orderIdPattern.test(item.orderId) &&
      validJourney(item.journey, bookingLifetime)).slice(-12) : [];
  }

  function updateBooking(route, orderId, journey, confirmed) {
    if (typeof orderId !== 'string' || !orderIdPattern.test(orderId)) return null;
    const bookings = readBookings();
    const existing = bookings.find(item => item.orderId === orderId && item.route === route);
    const attributed = existing?.journey ?? journey;
    if (!attributed?.continued || existing?.confirmed) return null;
    if (existing) existing.confirmed = confirmed;
    else bookings.push({ route, orderId, journey: attributed, confirmed });
    localStorage.setItem(bookingsKey, JSON.stringify(bookings.slice(-12)));
    return attributed;
  }

  function optional(callback) {
    try { return callback(); } catch { return undefined; }
  }

  function continueBooking(type, sendHere = false) {
    optional(() => {
      const journey = readJourney(type);
      if (!journey || journey.continued) return;
      journey.continued = true;
      saveJourney(type, journey);
      if (sendHere) reportContinue(type, journey);
    });
  }

  function reportContinue(type, journey) {
    if (!journey?.continued || journey.continueReported) return;
    journey.continueReported = true;
    saveJourney(type, journey);
    void send('notarization_continue', journey);
  }

  async function confirmBooking(route, orderId, type) {
    try {
      const confirm = () => updateBooking(route, orderId, type ? readJourney(type) : null, true);
      const journey = navigator.locks?.request
        ? await navigator.locks.request(bookingsKey, { ifAvailable: true }, lock => lock ? confirm() : null)
        : confirm();
      if (journey) await send('notarization_booking_confirmed', journey, route);
    } catch {
      // Booking confirmation and navigation continue if analytics is unavailable.
    }
  }

  window.SafeNotarizeFormAnalytics = {
    continueBooking,
    rememberStandardBooking: (type, orderId) => optional(() => {
      updateBooking('standard', orderId, readJourney(type), false);
    }),
    confirmStandardBooking: orderId => confirmBooking('standard', orderId),
    confirmPremiumBooking: (type, orderId) => confirmBooking('premium', orderId, type)
  };

  function startJourney(form, params) {
    let referrer;
    try { referrer = new URL(document.referrer); } catch { /* Direct visit. */ }
    const medium = (params.get('utm_medium') || '').trim().toLowerCase();
    const paidOrOtherCampaign = (medium && medium !== 'organic') ||
      ['gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid'].some(key => params.has(key));
    let engine;
    if (!paidOrOtherCampaign) {
      const host = referrer?.hostname || '';
      const campaignSource = (params.get('utm_source') || '').trim().toLowerCase();
      if (medium === 'organic' && engines.has(campaignSource)) engine = campaignSource;
      else if (/^(?:www\.)?google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})$/.test(host)) engine = 'google';
      else if (/^(?:www\.)?bing\.com$/.test(host)) engine = 'bing';
    }
    if (!engine) {
      if (paidOrOtherCampaign || !origins.has(referrer?.origin)) sessionStorage.removeItem(journeyKey + form.type);
      return;
    }

    const existing = readJourney(form.type);
    const navigation = performance.getEntriesByType('navigation')[0]?.type;
    if (existing?.page === location.pathname && existing.engine === engine &&
        ['reload', 'back_forward'].includes(navigation)) return;

    const startedAt = Date.now();
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    const journey = { page: location.pathname, engine, startedAt, clientId: `${random}.${Math.floor(startedAt / 1000)}` };
    saveJourney(form.type, journey);
    void send('page_view', journey);
  }

  optional(() => {
    const params = new URLSearchParams(location.search);
    const form = formPages.get(location.pathname);
    if (form) startJourney(form, params);
    if (form || location.pathname === '/documents/create/ds-3053.html') {
      const type = form?.type ?? 'ds-3053';
      document.addEventListener('click', event => {
        const link = event.target?.closest?.('a[data-document-booking], a#upload-link');
        if (link && (link.dataset.documentBooking === type || (!form && link.id === 'upload-link'))) {
          continueBooking(type);
        }
      });
      return;
    }

    if (!/^\/(?:book(?:-ht)?|premium)\.html$/.test(location.pathname)) return;
    const type = params.get('document_type');
    const journey = readJourney(type);
    if (journey?.continued) {
      reportContinue(type, journey);
      if (location.pathname === '/premium.html') frameFor(journey);
    }
  });
})();
