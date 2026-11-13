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
    haveDocument.textContent = ht ? 'Kontinye nan peman' : 'Continue to Checkout';
    if (ht) document.getElementById('subtitle').textContent = 'Chwazi opsyon ki mache ak sitiyasyon ou.';
    document.querySelector('#have-list li:last-child').textContent = ht
      ? 'Voye dokiman an apre ou fin otorize kat ou'
      : 'Upload your document after authorizing your card';
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
    heading: 'Kilè ou bezwen yon notè sou entènèt?',
    from: 'Apati',
    standard: 'Estanda',
    standardDescription: 'Antre lè notè a pare oswa chwazi yon lè.',
    standardIncluded: '1 siyatè, 2 so',
    standardAction: 'Chwazi sèvis estanda',
    onDemand: 'Sou demann',
    onDemandDescription: 'Bezwen yon notè vit oswa apre lè travay? Mande youn kounye a.',
    onDemandIncluded: '1 siyatè, 1 so',
    onDemandAction: 'Chwazi sèvis sou demann',
    prices: 'Gade pri sèvis anplis',
    addOn: 'Sèvis anplis',
    extraSigner: 'Siyatè anplis',
    extraStamp: 'So anplis',
    witness: 'Temwen',
    witnessNote: 'Pou sèvis estanda a, pri sa a aplike pou temwen SafeNotarize bay.'
  } : {
    heading: 'When do you need an online notary?',
    from: 'From',
    standard: 'Standard',
    standardDescription: 'Join when a notary is ready or choose a time.',
    standardIncluded: '1 signer, 2 stamps',
    standardAction: 'Choose Standard',
    onDemand: 'On-Demand',
    onDemandDescription: 'Need it soon or after hours? Request a notary now.',
    onDemandIncluded: '1 signer, 1 stamp',
    onDemandAction: 'Choose On-Demand',
    prices: 'See add-on prices',
    addOn: 'Add-on',
    extraSigner: 'Extra signer',
    extraStamp: 'Extra stamp',
    witness: 'Witness',
    witnessNote: 'The Standard witness fee applies to witnesses SafeNotarize provides.'
  };

  function plan({name, description, price, included, action, href}) {
    const card = document.createElement('article');
    card.className = 'sn-service-card';
    const heading = document.createElement('h2');
    heading.textContent = name;
    const summary = document.createElement('p');
    summary.className = 'sn-service-description';
    summary.textContent = description;

    const cost = document.createElement('div');
    cost.className = 'sn-service-cost';
    const amount = document.createElement('p');
    amount.className = 'sn-service-price';
    const priceText = document.createElement('strong');
    priceText.textContent = price;
    amount.append(copy.from + ' ', priceText);
    const allowance = document.createElement('p');
    allowance.className = 'sn-service-included';
    allowance.textContent = included;
    cost.append(amount, allowance);

    const link = document.createElement('a');
    link.className = 'sn-service-action';
    link.href = href;
    link.textContent = action;
    card.append(heading, summary, cost, link);
    return card;
  }

  function addOnPrices() {
    const details = document.createElement('details');
    details.className = 'sn-service-add-ons';
    const summary = document.createElement('summary');
    summary.textContent = copy.prices;
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headings = document.createElement('tr');
    for (const name of [copy.addOn, copy.standard, copy.onDemand]) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = name;
      headings.append(cell);
    }
    head.append(headings);

    const body = document.createElement('tbody');
    for (const [name, standardPrice, onDemandPrice] of [
      [copy.extraSigner, '$10', rates.additionalSigner],
      [copy.extraStamp, '$5', rates.additionalStamp],
      [copy.witness, '$15', rates.witness]
    ]) {
      const row = document.createElement('tr');
      const label = document.createElement('th');
      label.scope = 'row';
      label.textContent = name;
      const standard = document.createElement('td');
      standard.textContent = standardPrice;
      const onDemand = document.createElement('td');
      onDemand.textContent = dollars(onDemandPrice);
      row.append(label, standard, onDemand);
      body.append(row);
    }
    table.append(head, body);
    const note = document.createElement('p');
    note.textContent = copy.witnessNote;
    details.append(summary, table, note);
    return details;
  }

  const regular = new URL(location.href);
  regular.searchParams.set('service', 'regular');
  chooser.classList.add('sn-service-options');
  chooser.append(
    plan({name: copy.standard, description: copy.standardDescription, price: '$25',
      included: copy.standardIncluded, action: copy.standardAction, href: relative(regular)}),
    plan({name: copy.onDemand + ' 24/7', description: copy.onDemandDescription, price: dollars(rates.base),
      included: copy.onDemandIncluded, action: copy.onDemandAction,
      href: relative(documentContext().pending ? checkoutPath : preparePath)}),
    addOnPrices()
  );
  const intro = document.querySelector('[data-sn-service-intro]');
  intro.querySelector('h1').textContent = copy.heading;
  intro.querySelector('.pill').hidden = true;
  intro.querySelector('p').hidden = true;
  document.querySelectorAll('[data-sn-regular]').forEach(node => { node.hidden = true; });
  chooser.hidden = false;
})();
