(() => {
  'use strict';

  const config = window.SN_PREMIUM;
  const params = new URLSearchParams(location.search);
  const ht = document.documentElement.lang === 'ht' ||
    (location.pathname === '/premium.html' && params.get('lang') === 'ht');
  const startPath = ht ? '/start-ht.html' : '/start.html';
  const bookPath = ht ? '/book-ht.html' : '/book.html';
  const generated = ['library', 'generated', 'template'].includes(
    (params.get('document_source') || '').trim().toLowerCase()
  );
  const requestedType = (params.get('document_type') || '').trim().toLowerCase();
  const documentType = /^[a-z0-9-]{1,64}$/.test(requestedType) ? requestedType : '';

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
      if (mode === 'live' && (endpoint.origin !== location.origin ||
          !['https://www.safenotarize.com', 'https://safenotarize.com'].includes(endpoint.origin))) return null;
      return { ...config, mode, endpoint: endpoint.origin + '/phase-c' };
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

  const checkoutPath = new URL('/premium.html', location.origin);
  if (ht) checkoutPath.searchParams.set('lang', 'ht');
  const backPath = new URL(generated ? bookPath : startPath, location.origin);
  if (generated) {
    checkoutPath.searchParams.set('document_source', 'library');
    checkoutPath.searchParams.set('document_type', documentType);
    backPath.searchParams.set('document_ready', '1');
    backPath.searchParams.set('document_source', 'library');
    backPath.searchParams.set('document_type', documentType);
  }
  const relative = url => url.pathname + url.search + url.hash;
  window.SafeNotarizePremium = {
    settings, documentContext, backPath: relative(backPath)
  };

  const chooser = document.querySelector('[data-sn-service-choice]');
  const premium = settings();
  if (!chooser || !premium || (premium.mode === 'live' && premium.acceptingOrders !== true)) return;

  if (params.get('service') === 'regular') {
    const haveDocument = document.getElementById('have-btn');
    if (haveDocument) {
      const book = new URL(haveDocument.href);
      book.searchParams.set('service', 'regular');
      haveDocument.href = relative(book);
    }
    return;
  }

  const copy = ht ? {
    heading: 'Chwazi sèvis notarizasyon ou',
    pill: 'Notarizasyon sou entènèt',
    regular: 'Regilye',
    regularIncluded: '1 siyatè ak 2 so',
    regularAction: 'Chwazi Regilye',
    premiumIncluded: '1 siyatè ak 1 so',
    premiumDetails: 'Konekte ak yon notè sou OneNotary.',
    premiumAction: 'Chwazi Premium'
  } : {
    heading: 'Choose your notarization service',
    pill: 'Online Notarization',
    regular: 'Regular',
    regularIncluded: '1 signer and 2 stamps',
    regularAction: 'Choose Regular',
    premiumIncluded: '1 signer and 1 stamp',
    premiumDetails: 'Connect with a notary on OneNotary.',
    premiumAction: 'Choose Premium'
  };

  function plan({name, price, included, details, action, href, premium = false}) {
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
    plan({name: copy.regular, price: '$25', included: copy.regularIncluded, action: copy.regularAction, href: relative(regular)}),
    plan({name: 'Premium 24/7', price: '$30', included: copy.premiumIncluded, details: copy.premiumDetails, action: copy.premiumAction, href: relative(checkoutPath), premium: true})
  );
  const intro = document.querySelector('[data-sn-service-intro]');
  intro.querySelector('h1').textContent = copy.heading;
  intro.querySelector('.pill').textContent = copy.pill;
  intro.querySelector('p').hidden = true;
  document.querySelectorAll('[data-sn-regular]').forEach(node => { node.hidden = true; });
  chooser.hidden = false;
})();
