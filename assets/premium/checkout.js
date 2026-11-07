(() => {
  'use strict';

  const ht = new URLSearchParams(location.search).get('lang') === 'ht';
  const copy = ht ? {
    back: 'Retounen nan opsyon sèvis yo',
    package: '$30 gen ladan 1 siyatè ak 1 so.',
    saved: 'N ap voye PDF ou a bay OneNotary.',
    upload: 'W ap voye dokiman ou sou OneNotary.',
    intro: 'Peman tès. Sèvi ak yon kat tès Stripe pou otorize $30. W ap ranpli enfòmasyon ou epi verifye idantite ou sou OneNotary.',
    email: 'Imèl siyatè prensipal la',
    rates: 'Chak siyatè oswa so anplis koute $10. Chak temwen koute $15.',
    terms: 'Mwen otorize yon rezèv $30 epi mwen dakò ak pri final la selon sèvis ki fèt yo.',
    card: 'Kat tès',
    submit: 'Otorize $30 epi kontinye',
    join: 'Kontinye sou OneNotary',
    library: 'Ou bezwen yon dokiman? Gade bibliyotèk la',
    loading: 'N ap prepare peman an…',
    unavailable: 'Peman Premium pa disponib kounye a.',
    missing: 'PDF ou a pa disponib. Retounen nan dokiman ou a epi sove li ankò.',
    authorizing: 'N ap verifye otorizasyon kat la…',
    cardError: 'Kat la pa t otorize. Verifye enfòmasyon kat la epi eseye ankò.',
    opening: 'N ap prepare sesyon OneNotary ou a…',
    retry: 'Nou pa t kapab kontinye. Eseye ankò sou menm paj sa a.',
    review: 'Nou bezwen verifye demann sa a. Kontakte SafeNotarize anvan ou kòmanse yon lòt.'
  } : {
    back: 'Back to service options',
    package: '$30 includes 1 signer and 1 stamp.',
    saved: 'We’ll send your saved PDF to OneNotary.',
    upload: 'You’ll upload your document on OneNotary.',
    intro: 'Test checkout. Use a Stripe test card for the $30 hold. You’ll complete your information and identity check on OneNotary.',
    email: 'Primary signer’s email',
    rates: 'Each additional signer or stamp is $10. Each witness is $15.',
    terms: 'I authorize a $30 hold and agree to the final price based on the services completed.',
    card: 'Test card',
    submit: 'Authorize $30 and continue',
    join: 'Continue to OneNotary',
    library: 'Need a document? Browse the library',
    loading: 'Preparing checkout…',
    unavailable: 'Premium checkout is currently unavailable.',
    missing: 'Your saved PDF is unavailable. Return to your document and save it again.',
    authorizing: 'Checking your card authorization…',
    cardError: 'The card authorization failed. Check the card details and try again.',
    opening: 'Preparing your OneNotary session…',
    retry: 'We couldn’t continue. Try again on this page.',
    review: 'SafeNotarize needs to review this request before you start another one.'
  };
  document.documentElement.lang = ht ? 'ht' : 'en';

  const el = id => document.getElementById('premium-' + id);
  const form = el('form');
  const status = el('status');
  const submit = el('submit');
  const service = window.SafeNotarizePremium;
  const config = service?.settings();
  for (const [id, key] of Object.entries({
    back: 'back', package: 'package', intro: 'intro', 'email-label': 'email', rates: 'rates',
    'terms-label': 'terms', 'card-label': 'card', submit: 'submit', join: 'join', library: 'library'
  })) el(id).textContent = copy[key];
  el('back').href = service?.backPath || (ht ? '/start-ht.html' : '/start.html');
  el('library').href = ht ? '/documents/library-ht.html' : '/documents/library.html';

  if (!config) {
    status.textContent = copy.unavailable;
    return;
  }

  const { source, pending } = service.documentContext();
  if (source === 'library' && !pending) {
    status.textContent = copy.missing;
    return;
  }

  const storageKey = 'sn_premium_order_v2';
  const amount = 3000;
  let challenge = '';
  let stripe;
  let card;
  let widget;
  let busy = false;

  const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

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
    const item = { id: crypto.randomUUID(), access: hex(crypto.getRandomValues(new Uint8Array(32))), fingerprint };
    sessionStorage.setItem(storageKey, JSON.stringify(item));
    return item;
  }

  async function authorize(secret, amount) {
    const result = await stripe.retrievePaymentIntent(secret);
    const intent = result.paymentIntent;
    if (result.error || intent?.amount !== amount || intent.currency !== 'usd' || intent.livemode !== false) {
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
      const current = service.documentContext().pending;
      if (source === 'library' && current?.id !== pending.id) throw Error('document_access_denied');
      const order = {
        source, signers: [email], documentId: pending?.id, preferredLanguage: ht ? 'ht' : 'en',
        billingFlow: 'post_session_v1', acceptedTerms: el('terms').checked
      };
      const { id, access } = await orderFor(order);
      const documentToken = current?.token;
      status.textContent = copy.authorizing;
      const payment = await request('/payment', { ...order, id, access, documentToken, turnstile: challenge });
      if (payment.orderId !== id || payment.amount !== amount || typeof payment.clientSecret !== 'string') {
        throw Error('payment_contract_invalid');
      }
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
      location.assign(link.href);
    } catch (error) {
      const code = error.message;
      status.textContent = code === 'card_authorization_failed' ? copy.cardError
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
      if (availability.ready !== true || availability.mode !== 'test') throw Error('premium_unavailable');
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
