(() => {
  'use strict';

  const config = window.SN_PREMIUM;
  const params = new URLSearchParams(location.search);
  const selectedService = params.get('service');
  const ht = document.documentElement.lang === 'ht' ||
    (/^\/premium(?:\.html)?$/.test(location.pathname) && params.get('lang') === 'ht');
  const startPath = ht ? '/start-ht.html' : '/start.html';
  const bookPath = ht ? '/book-ht.html' : '/book.html';
  const generated = ['library', 'generated', 'template'].includes(
    (params.get('document_source') || '').trim().toLowerCase()
  );
  const requestedType = (params.get('document_type') || '').trim().toLowerCase();
  const documentType = /^[a-z0-9-]{1,64}$/.test(requestedType) ? requestedType : '';
  const testPricing = { base: 3000, additionalSigner: 1000, additionalStamp: 1000, witness: 1500 };
  const dollars = cents => '$' + (cents / 100);

  function settings() {
    if (config?.enabled !== true || !Array.isArray(config.allowedOrigins) ||
        !config.allowedOrigins.includes(location.origin)) return null;
    const mode = config.mode ?? 'test';
    if (mode !== 'test' && mode !== 'live') return null;
    const keyPattern = mode === 'live' ? /^pk_live_[a-zA-Z0-9]+$/ : /^pk_test_[a-zA-Z0-9]+$/;
    if (!keyPattern.test(config.stripePublishableKey || '') || !config.turnstileSiteKey) return null;
    try {
      const endpoint = new URL(config.endpoint);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port ||
          endpoint.pathname.replace(/\/$/, '') !== '/phase-c' || endpoint.search || endpoint.hash) return null;
      const premiumHost = 'https://safenotarize-phase-c-premium-production.karlberryj.workers.dev';
      if (mode === 'live' && (endpoint.origin !== premiumHost ||
          !['https://www.safenotarize.com', 'https://safenotarize.com', premiumHost].includes(location.origin))) return null;
      const pricing = mode === 'live' ? config.pricing : testPricing;
      if (mode === 'live' && (!pricing ||
          !['base', 'notarization', 'service', 'additionalSigner', 'additionalStamp', 'witness']
            .every(key => Number.isSafeInteger(pricing[key]) && pricing[key] > 0) ||
          pricing.base !== pricing.notarization + pricing.service)) return null;
      return { ...config, mode, pricing, endpoint: endpoint.origin + '/phase-c' };
    } catch {
      return null;
    }
  }

  function documentContext() {
    const handoff = window.SafeNotarizeDocumentHandoff;
    const pending = generated && documentType && handoff?.canBook({
      document_source: 'library',
      document_type: documentType
    }) ? handoff.pending() : null;
    return { source: generated ? 'library' : 'own', pending };
  }

  const relative = url => url.pathname + url.search + url.hash;
  const preparePath = new URL(startPath, location.origin);
  preparePath.searchParams.set('service', 'premium');
  const libraryPath = new URL(ht ? '/documents/library-ht.html' : '/documents/library.html', location.origin);
  libraryPath.searchParams.set('service', 'premium');
  const ownCheckout = new URL('/premium.html', location.origin);
  if (ht) ownCheckout.searchParams.set('lang', 'ht');
  if (!generated && ['ds-3053', 'ps-1583', 'vehicle-release'].includes(documentType)) {
    preparePath.searchParams.set('document_type', documentType);
    ownCheckout.searchParams.set('document_type', documentType);
  }
  const checkoutPath = new URL(ownCheckout);
  const backToDocumentOptions = selectedService === 'premium' && !generated;
  const backPath = new URL(generated ? bookPath : startPath, location.origin);
  if (backToDocumentOptions) {
    backPath.searchParams.set('service', 'premium');
    if (documentType === 'vehicle-release') backPath.searchParams.set('document_type', documentType);
  }
  if (generated) {
    checkoutPath.searchParams.set('document_source', 'library');
    checkoutPath.searchParams.set('document_type', documentType);
    backPath.searchParams.set('document_ready', '1');
    backPath.searchParams.set('document_source', 'library');
    backPath.searchParams.set('document_type', documentType);
  }
  window.SafeNotarizePremium = {
    settings, documentContext, backPath: relative(backPath), backToDocumentOptions, libraryPath: relative(libraryPath)
  };

  if (['premium', 'regular'].includes(selectedService) && /^\/documents\/library(?:-ht)?(?:\.html)?$/.test(location.pathname)) {
    for (const link of document.querySelectorAll('a[href*="create"]')) {
      const template = new URL(link.href);
      if (template.origin === location.origin &&
          /^\/documents\/(?:create(?:-ht)?\.html|create\/[a-z0-9-]+\.html)$/.test(template.pathname)) {
        template.searchParams.set('service', selectedService);
        link.href = relative(template);
      }
    }
  }

  const haveDocument = document.getElementById('have-btn');
  if (selectedService === 'premium' && haveDocument) {
    ownCheckout.searchParams.set('service', 'premium');
    ownCheckout.searchParams.set('document_source', 'own');
    haveDocument.href = relative(ownCheckout);
    haveDocument.textContent = ht ? 'Kontinye nan peman Premium' : 'Continue to Premium Checkout';
    if (ht) document.getElementById('subtitle').textContent = 'Chwazi opsyon ki mache ak sitiyasyon ou.';
    document.querySelector('#have-list li:last-child').textContent = ht
      ? 'Voye dokiman an sou OneNotary apre ou otorize kat ou'
      : 'Upload it in OneNotary after authorizing your card';
    document.getElementById('need-btn').href = relative(libraryPath);
    return;
  }

  const chooser = document.querySelector('[data-sn-service-choice]');
  const premium = settings();
  if (selectedService === 'regular') {
    if (haveDocument) {
      const book = new URL(haveDocument.href);
      book.searchParams.set('service', 'regular');
      haveDocument.href = relative(book);
      libraryPath.searchParams.set('service', 'regular');
      document.getElementById('need-btn').href = relative(libraryPath);
    }
    return;
  }

  if (!chooser || !premium || (premium.mode === 'live' && premium.acceptingOrders !== true)) return;

  const rates = premium.pricing;
  const copy = ht ? {
    heading: 'Chwazi sèvis notarizasyon ou',
    pill: 'Notarizasyon sou entènèt',
    regular: 'Regilye',
    regularIncluded: '1 siyatè ak 2 so',
    regularRates: ['$10 pou chak siyatè anplis', '$5 pou chak so anplis', '$15 pou chak temwen SafeNotarize bay'],
    regularAction: 'Chwazi Regilye',
    premiumIncluded: '1 siyatè ak 1 so',
    premiumDetails: 'Konekte ak yon notè sou OneNotary.',
    premiumRates: [dollars(rates.additionalSigner) + ' pou chak siyatè anplis',
      dollars(rates.additionalStamp) + ' pou chak so anplis', dollars(rates.witness) + ' pou chak temwen'],
    premiumAction: 'Notarye kounye a'
  } : {
    heading: 'Choose your notarization service',
    pill: 'Online Notarization',
    regular: 'Regular',
    regularIncluded: '1 signer and 2 stamps',
    regularRates: ['$10 per additional signer', '$5 per additional stamp', '$15 per SafeNotarize-provided witness'],
    regularAction: 'Choose Regular',
    premiumIncluded: '1 signer and 1 stamp',
    premiumDetails: 'Connect with a notary on OneNotary.',
    premiumRates: [dollars(rates.additionalSigner) + ' per additional signer',
      dollars(rates.additionalStamp) + ' per additional stamp', dollars(rates.witness) + ' per witness'],
    premiumAction: 'Notarize now'
  };

  function plan({name, price, included, rates, details, action, href, premium = false}) {
    const card = document.createElement('article');
    card.className = premium ? 'sn-service-card sn-service-premium' : 'sn-service-card';
    const heading = document.createElement('h2');
    heading.textContent = name;
    const amount = document.createElement('p');
    amount.className = 'sn-service-price';
    amount.textContent = price;
    const allowance = document.createElement('p');
    allowance.textContent = included;
    card.append(heading, amount, allowance);
    if (details) {
      const summary = document.createElement('p');
      summary.textContent = details;
      card.append(summary);
    }
    const rateList = document.createElement('ul');
    rateList.className = 'sn-service-rates';
    for (const rate of rates) {
      const item = document.createElement('li');
      item.textContent = rate;
      rateList.append(item);
    }
    card.append(rateList);
    const link = document.createElement('a');
    link.className = 'sn-service-action';
    link.href = href;
    link.textContent = action;
    card.append(link);
    return card;
  }

  const regular = new URL(location.href);
  regular.searchParams.set('service', 'regular');
  chooser.classList.add('sn-service-options');
  chooser.append(
    plan({name: copy.regular, price: '$25', included: copy.regularIncluded, rates: copy.regularRates,
      action: copy.regularAction, href: relative(regular)}),
    plan({name: 'Premium 24/7', price: dollars(rates.base), included: copy.premiumIncluded, rates: copy.premiumRates,
      details: copy.premiumDetails, action: copy.premiumAction,
      href: relative(documentContext().pending ? checkoutPath : preparePath), premium: true})
  );
  const intro = document.querySelector('[data-sn-service-intro]');
  intro.querySelector('h1').textContent = copy.heading;
  intro.querySelector('.pill').textContent = copy.pill;
  intro.querySelector('p').hidden = true;
  document.querySelectorAll('[data-sn-regular]').forEach(node => { node.hidden = true; });
  chooser.hidden = false;
})();
