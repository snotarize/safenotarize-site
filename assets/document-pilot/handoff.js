(() => {
  'use strict';
  const cfg = window.SN_DOCUMENT_PILOT || {};
  const button = document.getElementById('pilot-start');
  const status = document.getElementById('pilot-status');
  const email = document.getElementById('pilot-email');
  const consent = document.getElementById('pilot-consent');
  const storageKey = 'sn-document-pilot-pending';
  let pending = null, token = '', widget, busy = false, locked = false;
  const say = text => { status.textContent = text; };
  const render = () => { button.disabled = busy || locked || !token || !consent.checked; };
  if (!cfg.enabled) return;
  try {
    const url = new URL(cfg.endpoint);
    if (url.protocol !== 'https:' || url.pathname !== '/start') throw Error();
    if (sessionStorage.getItem(storageKey)) {
      locked = true;
      say('A previous attempt may already have created your session. Check your invitation email or contact SafeNotarize before starting again.');
      return;
    }
    sessionStorage.setItem('sn-pilot-storage-test', '1');
    sessionStorage.removeItem('sn-pilot-storage-test');
  } catch {
    say('Session setup is unavailable. Enable browser session storage or contact SafeNotarize. Your document can still be downloaded.');
    return;
  }
  say('Review your document, enter your email, and complete the security check.');
  consent.addEventListener('change', render);
  window.snPilotTurnstileReady = () => {
    widget = window.turnstile.render('#pilot-turnstile', {
      sitekey: cfg.turnstileSiteKey, action: 'start_session',
      callback: value => { token = value; render(); },
      'expired-callback': () => { token = ''; render(); },
      'error-callback': () => { token = ''; say('Security check failed. Please retry it.'); render(); }
    });
  };
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=snPilotTurnstileReady&render=explicit';
  script.async = true;
  script.onerror = () => say('The security check could not load. Your document can still be downloaded.');
  document.head.append(script);
  button.addEventListener('click', async () => {
    if (busy || locked || !token || !consent.checked) return;
    if (!email.reportValidity() || !form.reportValidity()) return;
    busy = true; render();
    let sent = false;
    try {
      if (!pending) {
        const blob = await downloadPdf(false);
        if (!blob) throw Error('generation');
        if (blob.size > 1048576) throw Error('size');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        pending = {
          email: email.value.trim().toLowerCase(),
          request_key: Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''),
          document: { name: 'affidavit-of-support.pdf', content: btoa(binary) }
        };
        // Freeze the reviewed snapshot for retries. No document contents stored in browser storage.
        form.querySelectorAll('input,select,textarea').forEach(el => { el.disabled = true; });
        email.readOnly = true;
      }
      sessionStorage.setItem(storageKey, JSON.stringify({ attempted_at: Date.now() }));
      say('Creating your session and attaching your document. Please keep this page open.');
      sent = true;
      const response = await fetch(cfg.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pending, turnstile: token }), signal: AbortSignal.timeout(90000)
      });
      const result = await response.json();
      if (!response.ok) {
        const final = ['review', 'processing', 'document_changed', 'email_changed', 'expired'].includes(result.error);
        if (final) {
          locked = true;
          say('Your request needs a check before continuing. Check your invitation email or contact SafeNotarize. Please do not start another session.');
        } else {
          say('We could not continue yet. Retry here with the same document, or contact SafeNotarize.');
        }
        return;
      }
      const link = new URL(result.link);
      if (link.protocol !== 'https:' || link.hostname !== 'app.onenotary.us' || link.username || link.password || (link.port && link.port !== '443')) throw Error('link');
      say('Document attached. Opening OneNotary…');
      // Keep the marker to avoid a second order if the customer returns with Back.
      location.assign(link.href);
    } catch (error) {
      say(!sent ? (error.message === 'size' ? 'This PDF exceeds the pilot’s 1 MB limit. Download it and contact SafeNotarize.' : 'We could not prepare your document. Your entered information remains on this page.') : 'The connection was interrupted. Retry on this page; we will reuse the same request. Do not open another session.');
    } finally {
      busy = false; token = '';
      if (window.turnstile && widget !== undefined) window.turnstile.reset(widget);
      render();
    }
  });
})();
