(() => {
  'use strict';

  const query = new URLSearchParams(location.search);
  const ht = query.get('lang') === 'ht';
  const text = ht ? {
    title: 'Dokiman notarye ou',
    waiting: 'N ap tann OneNotary konfime sesyon an fini.',
    payment: 'Konfime pri final la sou Stripe. N ap retire rezèv $30 la apre peman an.',
    paid: 'Peman an konfime. Dokiman notarye ou pare.',
    review: 'SafeNotarize ap verifye sesyon an oswa peman an.',
    resume: 'Retounen sou paj sa a depi nan sesyon OneNotary ou.',
    reopen: 'Ouvri paj sa a nan menm tab kote ou te kòmanse sesyon an.',
    retry: 'Nou pa kapab tcheke estati a kounye a. Eseye ankò.',
    refresh: 'Tcheke estati a',
    pay: 'Peye pri final la',
    download: 'Telechaje dokiman notarye a',
    base: 'Premium (1 siyatè ak 1 so)',
    notarization: 'Notarizasyon (1 siyatè ak 1 so)',
    service: 'Aksè 24/7 ak livrezon PDF an sekirite',
    signers: 'Siyatè anplis',
    stamps: 'So anplis',
    witnesses: 'Temwen',
    total: 'Total',
    check: 'N ap verifye sesyon an ak peman an…'
  } : {
    title: 'Your notarized document',
    waiting: 'We’re waiting for OneNotary to confirm your session is complete.',
    payment: 'Confirm your final total on Stripe. We’ll release the $30 hold after payment.',
    paid: 'Payment confirmed. Your notarized document is ready.',
    review: 'SafeNotarize is reviewing the session or payment.',
    resume: 'Open this page from your OneNotary session to continue.',
    reopen: 'Open this page in the same browser tab where you started your session.',
    retry: 'We couldn’t check the status right now. Try again.',
    refresh: 'Check status',
    pay: 'Pay final total',
    download: 'Download notarized document',
    base: 'Premium (1 signer and 1 stamp)',
    notarization: 'Online notarization (1 signer and 1 stamp)',
    service: 'Premium 24/7 access and secure PDF delivery',
    signers: 'Additional signers',
    stamps: 'Additional stamps',
    witnesses: 'Witnesses',
    total: 'Total',
    check: 'Checking your session and payment…'
  };
  document.documentElement.lang = ht ? 'ht' : 'en';
  const byId = id => document.getElementById(id);
  const status = byId('premium-complete-status');
  const breakdown = byId('premium-final-breakdown');
  const pay = byId('premium-final-pay');
  const refresh = byId('premium-final-refresh');
  const downloads = byId('premium-downloads');
  byId('premium-complete-heading').textContent = text.title;
  refresh.textContent = text.refresh;
  const config = window.SafeNotarizePremium?.settings();
  const live = config?.mode === 'live';
  if (live && new URL(config.endpoint).origin !== location.origin) {
    status.textContent = text.resume;
    return;
  }
  let order;
  try {
    const id = query.get('order');
    const access = /^[a-f0-9-]{36}$/i.test(id || '') ? sessionStorage.getItem('sn_premium_access_' + id) : null;
    const stored = JSON.parse(sessionStorage.getItem('sn_premium_order_v2') || 'null');
    const key = access || (stored?.id === id ? stored.access : null);
    if (/^[a-f0-9-]{36}$/i.test(id || '')) {
      let resume;
      if (live) {
        const resumeKey = 'sn_premium_resume_' + id;
        const fragment = new URLSearchParams(location.hash.slice(1));
        if (fragment.has('resume')) {
          history.replaceState(null, '', location.pathname + location.search);
          if (/^\d{10}\.[a-f0-9]{64}$/.test(fragment.get('resume') || '')) {
            sessionStorage.setItem(resumeKey, fragment.get('resume'));
          }
        }
        resume = sessionStorage.getItem(resumeKey);
      }
      if (/^[a-f0-9]{64}$/.test(key || '')) order = { id, access: key };
      else if (live && /^\d{10}\.[a-f0-9]{64}$/.test(resume || '')) order = { id, access: resume };
    }
  } catch {}
  if (!config || !order) {
    status.textContent = live ? text.resume : config ? text.reopen : text.retry;
    return;
  }

  let busy = false;
  let timer;
  let attempts = 0;
  const money = cents => '$' + (cents / 100).toFixed(2);

  async function request(path, input = {}, file = false) {
    const options = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...order, ...input }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(30000)
    };
    if (live) options.credentials = 'same-origin';
    const response = await fetch(config.endpoint + path, options);
    if (!response.ok) throw Error('request_failed');
    return file ? response.blob() : response.json();
  }

  function showTotal(info) {
    if (!Number.isSafeInteger(info.amount)) return;
    const pricing = config.pricing;
    const base = live ? [[text.notarization, pricing.notarization], [text.service, pricing.service]]
      : [[text.base, pricing.base]];
    const rows = [
      ...base,
      [text.signers, (info.signers - 1) * pricing.additionalSigner],
      [text.stamps, (info.stamps - 1) * pricing.additionalStamp],
      [text.witnesses, info.witnesses * pricing.witness]
    ].filter(([, amount]) => amount > 0);
    rows.push([text.total, info.amount]);
    breakdown.replaceChildren();
    for (const [label, amount] of rows) {
      const term = document.createElement('dt');
      term.textContent = label;
      const value = document.createElement('dd');
      value.textContent = money(amount);
      breakdown.append(term, value);
    }
    breakdown.hidden = false;
  }

  async function showDocuments() {
    const { documents } = await request('/delivery/list');
    if (!documents.length) throw Error('documents_unavailable');
    downloads.replaceChildren();
    documents.forEach((doc, index) => {
      const filename = 'safenotarize-notarized-' + (index + 1) + '.pdf';
      const label = text.download + (documents.length > 1 ? ' ' + (index + 1) : '');
      const scope = live ? order.id + '/' : '';
      const downloadPath = '/phase-c/delivery/file/' + scope + doc.id + '/' + filename;
      if (/^[a-f0-9-]{36}$/i.test(doc.id) && doc.downloadPath === downloadPath &&
          new URL(config.endpoint).origin === location.origin) {
        const link = document.createElement('a');
        link.className = 'sn-service-action';
        link.textContent = label;
        link.href = downloadPath;
        link.download = filename;
        link.target = '_blank';
        link.rel = 'noopener';
        downloads.append(link);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sn-service-action';
      button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const file = await request('/delivery/download', { documentId: doc.id }, true);
          if (file.type !== 'application/pdf') throw Error('invalid_pdf');
          const url = URL.createObjectURL(file);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch {
          status.textContent = text.retry;
        } finally {
          button.disabled = false;
        }
      });
      downloads.append(button);
    });
  }

  async function check() {
    if (busy) return;
    clearTimeout(timer);
    busy = true;
    refresh.disabled = true;
    try {
      const info = await request('/final/status');
      showTotal(info);
      pay.hidden = info.state !== 'payment_required';
      if (info.state === 'paid') {
        await showDocuments();
        const stored = JSON.parse(sessionStorage.getItem('sn_premium_order_v2') || 'null');
        if (stored?.id === order.id && sessionStorage.getItem('sn_premium_access_' + order.id)) {
          sessionStorage.removeItem('sn_premium_order_v2');
        }
        status.textContent = text.paid;
      } else if (info.state === 'payment_required') {
        pay.textContent = text.pay + ' ' + money(info.amount);
        status.textContent = text.payment;
      } else if (info.state === 'review') {
        status.textContent = text.review;
      } else {
        status.textContent = info.state === 'waiting' ? text.waiting : text.check;
        if (++attempts < 40) timer = setTimeout(check, 6000);
      }
    } catch {
      status.textContent = text.retry;
    } finally {
      busy = false;
      refresh.hidden = false;
      refresh.disabled = false;
    }
  }

  refresh.addEventListener('click', () => { attempts = 0; check(); });
  pay.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    pay.disabled = true;
    let recheck = false;
    try {
      const result = await request('/final/checkout');
      if (!result.link) {
        recheck = true;
        return;
      }
      const url = new URL(result.link);
      if (url.protocol !== 'https:' || url.host !== 'checkout.stripe.com' ||
          url.username || url.password || !url.pathname.startsWith('/c/pay/')) throw Error('unsafe_checkout');
      location.assign(url.href);
    } catch {
      status.textContent = text.retry;
    } finally {
      busy = false;
      pay.disabled = false;
      if (recheck) check();
    }
  });
  check();
})();
