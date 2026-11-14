(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const ht = params.get('lang') === 'ht';
  const copy = ht ? {
    title: 'Notarizasyon sou demann 24/7',
    back: 'Retounen nan opsyon sèvis yo',
    package: '$30 gen ladan 1 siyatè ak 1 so.',
    saved: 'PDF ou te sove a ap disponib nan sesyon an.',
    upload: 'W ap voye dokiman ou lè ou antre nan sesyon an.',
    intro: 'Peman tès. Sèvi ak yon kat tès Stripe pou otorize $30.',
    email: 'Imèl siyatè prensipal la',
    rates: 'Chak siyatè oswa so anplis koute $10. Chak temwen koute $15.',
    terms: 'Mwen otorize yon rezèv $30 epi mwen dakò ak pri final la selon sèvis ki fèt yo.',
    card: 'Kat tès',
    submit: 'Otorize $30 epi kontinye',
    join: 'Antre nan sesyon ou',
    library: 'Ou bezwen yon dokiman? Gade bibliyotèk la',
    loading: 'N ap prepare peman an…',
    unavailable: 'Peman pou sèvis sou demann lan pa disponib kounye a.',
    missing: 'PDF ou a pa disponib. Retounen nan dokiman ou a epi sove li ankò.',
    authorizing: 'N ap verifye otorizasyon kat la…',
    cardError: 'Kat la pa t otorize. Verifye enfòmasyon kat la epi eseye ankò.',
    opening: 'N ap prepare sesyon ou a…',
    invalidEstimate: 'Verifye kantite siyatè, so ak temwen yo.',
    retry: 'Nou pa t kapab kontinye. Eseye ankò sou menm paj sa a.',
    review: 'Nou bezwen verifye demann sa a. Kontakte SafeNotarize anvan ou kòmanse yon lòt.'
  } : {
    title: 'On-Demand 24/7',
    back: 'Back to service options',
    package: '$30 includes 1 signer and 1 stamp.',
    saved: 'Your saved PDF will be ready in your session.',
    upload: 'You’ll upload your document when you enter the session.',
    intro: 'Test checkout. Use a Stripe test card for the $30 hold.',
    email: 'Primary signer’s email',
    rates: 'Each additional signer or stamp is $10. Each witness is $15.',
    terms: 'I authorize a $30 hold and agree to the final price based on the services completed.',
    card: 'Test card',
    submit: 'Authorize $30 and continue',
    join: 'Join your session',
    library: 'Need a document? Browse the library',
    loading: 'Preparing checkout…',
    unavailable: 'On-demand checkout is currently unavailable.',
    missing: 'Your saved PDF is unavailable. Return to your document and save it again.',
    authorizing: 'Checking your card authorization…',
    cardError: 'The card authorization failed. Check the card details and try again.',
    opening: 'Preparing your session…',
    invalidEstimate: 'Check the number of additional signers, stamps, and witnesses.',
    retry: 'We couldn’t continue. Try again on this page.',
    review: 'SafeNotarize needs to review this request before you start another one.'
  };
  document.documentElement.lang = ht ? 'ht' : 'en';
  document.title = `${copy.title} | SafeNotarize`;

  const el = id => document.getElementById('premium-' + id);
  const form = el('form');
  const status = el('status');
  const submit = el('submit');
  const service = window.SafeNotarizePremium;
  const config = service?.settings();
  const live = config?.mode === 'live';
  const estimated = live && config.estimatedAuthorization === true;
  if (live) {
    const { base, notarization, service: delivery, additionalSigner, additionalStamp, witness } = config.pricing;
    const dollars = cents => '$' + (cents / 100);
    copy.package = ht
      ? `${dollars(base)} pou 1 siyatè ak 1 so. ${dollars(notarization)} pou notarizasyon an ak ${dollars(delivery)} pou aksè 24/7 ak livrezon PDF an sekirite.`
      : `${dollars(base)} for 1 signer and 1 stamp. ${dollars(notarization)} for notarization and ${dollars(delivery)} for 24/7 access and secure PDF delivery.`;
    copy.rates = ht
      ? `${dollars(additionalSigner)} pou chak siyatè anplis, ${dollars(additionalStamp)} pou chak so anplis ak ${dollars(witness)} pou chak temwen.`
      : `${dollars(additionalSigner)} per additional signer, ${dollars(additionalStamp)} per additional stamp, and ${dollars(witness)} per witness.`;
    copy.intro = ht
      ? 'N ap mete yon rezèv tanporè sou kat ou. W ap peye montan final la apre sesyon an.'
      : 'We’ll place a temporary hold on your card. You’ll pay the final total after your session.';
    copy.terms = ht
      ? `Mwen otorize yon rezèv ${dollars(base)} epi mwen dakò ak pri final la selon sèvis ki fèt yo.`
      : `I authorize a ${dollars(base)} hold and agree to the final price based on the services completed.`;
    copy.submit = ht ? `Otorize ${dollars(base)} epi kontinye` : `Authorize ${dollars(base)} and continue`;
    copy.card = ht ? 'Enfòmasyon kat la' : 'Card information';
  }
  for (const [id, key] of Object.entries({
    title: 'title', back: 'back', package: 'package', intro: 'intro', 'email-label': 'email', rates: 'rates',
    'terms-label': 'terms', 'card-label': 'card', submit: 'submit', join: 'join', library: 'library'
  })) el(id).textContent = copy[key];
  el('back').href = service?.backPath || (ht ? '/start-ht.html' : '/start.html');
  if (service?.backToDocumentOptions) {
    el('back').textContent = ht ? 'Retounen nan opsyon dokiman yo' : 'Back to document options';
  }
  el('library').href = service?.libraryPath || (ht ? '/documents/library-ht.html' : '/documents/library.html');

  if (!config) {
    status.textContent = copy.unavailable;
    return;
  }

  const { source, pending } = service.documentContext();
  if (source === 'library' && !pending) {
    status.textContent = copy.missing;
    el('library').hidden = false;
    return;
  }

  const storageKey = 'sn_premium_order_v2';
  const estimateFields = [
    ['extraSigners', 'extra-signers', 'additionalSigner', ht ? 'Siyatè anplis' : 'Additional signers'],
    ['extraStamps', 'extra-stamps', 'additionalStamp', ht ? 'So anplis' : 'Additional stamps'],
    ['witnesses', 'witnesses', 'witness', ht ? 'Temwen' : 'Witnesses']
  ];
  let challenge = '';
  let stripe;
  let card;
  let widget;
  let busy = false;

  const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

  function estimate() {
    const details = {};
    let amount = config.pricing.base;
    if (estimated) {
      for (const [key, input, rate] of estimateFields) {
        const quantity = el(input).valueAsNumber;
        if (!Number.isSafeInteger(quantity) || quantity < 0) throw Error('invalid_quantity');
        details[key] = quantity;
        amount += quantity * config.pricing[rate];
      }
      if (!Number.isSafeInteger(amount) || amount > 99999999) throw Error('invalid_quantity');
    }
    return { amount, details };
  }

  function showEstimate() {
    let total;
    try { total = '$' + (estimate().amount / 100); }
    catch { return; }
    el('terms-label').textContent = ht
      ? `Mwen otorize yon rezèv ${total}. Apre sesyon an, SafeNotarize ap pran montan final la sou kat sa a si rezèv la kouvri li. Si total la pi wo, m ap konfime peman an sou Stripe.`
      : `I authorize a ${total} hold. After the session, SafeNotarize will charge this card for the final total if the hold covers it. If the total is higher, I’ll confirm payment in Stripe.`;
    submit.textContent = ht ? `Otorize ${total} epi kontinye` : `Authorize ${total} and continue`;
  }

  function initializeEstimate() {
    const panel = el('estimate');
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null')?.estimate;
    el('estimate-label').textContent = ht ? 'Estimasyon pou sèvis anplis' : 'Estimated extras';
    for (const [key, input, , label] of estimateFields) {
      el(input + '-label').textContent = label;
      if (Number.isSafeInteger(saved?.[key]) && saved[key] >= 0) el(input).value = saved[key];
    }
    panel.hidden = false;
    panel.disabled = Boolean(saved);
    panel.addEventListener('input', () => {
      el('terms').checked = false;
      showEstimate();
    });
    showEstimate();
  }

  async function request(path, payload) {
    const response = await fetch(config.endpoint + path, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'content-type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(120000)
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'request_failed');
    return result;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  async function orderFor(payload) {
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const fingerprint = hex(await crypto.subtle.digest('SHA-256', encoded));
    const existing = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw Error('order_details_changed');
      return existing;
    }
    const item = { id: crypto.randomUUID(), access: hex(crypto.getRandomValues(new Uint8Array(32))), fingerprint,
      ...(payload.estimate ? { estimate: payload.estimate } : {}) };
    sessionStorage.setItem(storageKey, JSON.stringify(item));
    return item;
  }

  async function authorize(secret, amount) {
    const result = await stripe.retrievePaymentIntent(secret);
    const intent = result.paymentIntent;
    if (result.error || intent?.amount !== amount || intent.currency !== 'usd' || intent.livemode !== live) {
      throw Error('payment_contract_invalid');
    }
    if (intent.status === 'requires_capture') return;
    if (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent.status)) {
      throw Error('payment_contract_invalid');
    }
    const authorized = await stripe.confirmCardPayment(secret, { payment_method: { card } });
    if (authorized.error || authorized.paymentIntent?.status !== 'requires_capture') throw Error('card_authorization_failed');
  }

  async function continueToNotary(event) {
    event.preventDefault();
    if (busy || !challenge) return;
    if (!form.reportValidity()) return;
    const email = el('email').value.trim().toLowerCase();

    busy = true;
    submit.disabled = true;
    let joined = false;
    try {
      const { amount, details } = estimate();
      const current = service.documentContext().pending;
      if (source === 'library' && current?.id !== pending.id) throw Error('document_access_denied');
      const order = {
        source, signers: [email], documentId: pending?.id, preferredLanguage: ht ? 'ht' : 'en',
        billingFlow: 'post_session_v1', acceptedTerms: el('terms').checked,
        ...(estimated ? { estimate: details } : {})
      };
      const { id, access } = await orderFor(order);
      if (estimated) el('estimate').disabled = true;
      const documentToken = current?.token;
      status.textContent = copy.authorizing;
      const payment = await request('/payment', { ...order, id, access, documentToken, turnstile: challenge });
      if (payment.orderId !== id || payment.amount !== amount || typeof payment.clientSecret !== 'string') {
        throw Error('payment_contract_invalid');
      }
      if (live) await window.SafeNotarizeOrderAttribution?.premium(id, access, source);
      await authorize(payment.clientSecret, amount);

      status.textContent = copy.opening;
      const session = await request('/session', { id, access, documentToken });
      const link = new URL(session.link);
      if (link.protocol !== 'https:' || link.host !== 'app.onenotary.us' || link.username || link.password) {
        throw Error('unsafe_link');
      }
      sessionStorage.setItem('sn_premium_access_' + id, access);
      form.hidden = true;
      el('join').href = link.href;
      el('join').hidden = false;
      status.textContent = '';
      joined = true;
      if (live) await window.SafeNotarizeFormAnalytics?.confirmPremiumBooking(params.get('document_type'), id);
      location.assign(link.href);
    } catch (error) {
      const code = error.message;
      status.textContent = code === 'card_authorization_failed' ? copy.cardError
        : code === 'invalid_quantity' ? copy.invalidEstimate
        : ['document_access_denied', 'document_already_claimed', 'document_unavailable', 'document_invalid'].includes(code) ? copy.missing
        : ['payment_contract_invalid', 'payment_outcome_unknown', 'order_details_changed', 'payload_mismatch',
          'order_needs_review', 'session_outcome_unknown', 'unsafe_link'].includes(code) ? copy.review
        : code === 'premium_unavailable' ? copy.unavailable : copy.retry;
    } finally {
      busy = false;
      challenge = '';
      if (!joined) window.turnstile.reset(widget);
    }
  }

  async function initialize() {
    status.textContent = copy.loading;
    try {
      const availability = await request('/availability?billing_flow=post_session_v1&source=' + source);
      if (availability.ready !== true || availability.mode !== config.mode) throw Error('premium_unavailable');
      await Promise.all([
        loadScript('https://js.stripe.com/v3/'),
        loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
      ]);
      stripe = window.Stripe(config.stripePublishableKey);
      const elements = stripe.elements({ locale: ht ? 'en' : 'auto' });
      card = elements.create('card', { style: { base: { fontSize: '16px' } } });
      el('document').textContent = copy[source === 'library' ? 'saved' : 'upload'];
      el('document').hidden = false;
      el('library').hidden = source === 'library';
      el('intro').hidden = false;
      if (estimated) initializeEstimate();
      form.hidden = false;
      card.mount('#premium-card');
      function clearChallenge() {
        challenge = '';
        submit.disabled = true;
      }
      widget = window.turnstile.render('#premium-security', {
        sitekey: config.turnstileSiteKey,
        action: 'premium_order',
        size: el('security').clientWidth < 300 ? 'compact' : 'flexible',
        callback: token => {
          challenge = token;
          submit.disabled = busy;
        },
        'expired-callback': clearChallenge,
        'error-callback': clearChallenge
      });
      form.addEventListener('submit', continueToNotary);
      status.textContent = '';
    } catch {
      form.hidden = true;
      status.textContent = copy.unavailable;
    }
  }

  initialize();
})();
