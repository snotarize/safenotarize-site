(() => {
  'use strict';
  const match = location.hash.match(/^#sn-owner-check=([A-Za-z0-9_-]{32})$/);
  if (!match) return;
  const ownerCode = match[1];
  history.replaceState(null, '', location.pathname + location.search);
  const endpoint = 'https://safenotarize-standard-production-handoff.karlberryj.workers.dev/owner-check';
  const panel = document.createElement('dialog');
  panel.setAttribute('aria-label', 'SafeNotarize connection check');
  panel.style.cssText = 'max-width:460px;width:calc(100% - 48px);border:1px solid #dce7f2;border-radius:16px;padding:24px;font-family:Arial,sans-serif;color:#00274d';
  panel.innerHTML = '<h2 style="margin-top:0">SafeNotarize connection check</h2>' +
    '<p>This owner check verifies the security connection.</p>' +
    '<div id="sn-owner-widget"></div>' +
    '<p role="status" aria-live="polite">Ready to check.</p>' +
    '<button type="button" style="padding:12px 18px;background:#00274d;color:white;border:0;border-radius:8px;font-size:16px;cursor:pointer">Run security check</button>';
  document.body.appendChild(panel);
  const status = panel.querySelector('[role="status"]');
  const button = panel.querySelector('button');
  const holder = panel.querySelector('#sn-owner-widget');
  let widget;
  const showError = message => {
    status.textContent = message;
    button.disabled = true;
  };
  async function submit(token) {
    try {
      status.textContent = 'Confirming the security check…';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-safenotarize-owner-check': ownerCode },
        body: JSON.stringify({ turnstile_token: token }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
      const result = await response.json();
      if (response.ok && result.verified === true && result.action === 'document_handoff' &&
        ['safenotarize.com', 'www.safenotarize.com'].includes(result.hostname)) {
        status.textContent = 'Connection verified. You can return to the chat.';
        button.textContent = 'Connection verified';
        if (window.turnstile && widget !== undefined) window.turnstile.remove(widget);
      } else {
        const error = typeof result.error === 'string' && /^[a-z_-]{1,70}$/.test(result.error) ?
          result.error : 'unconfirmed_response';
        const reason = typeof result.reason === 'string' && /^[a-z_-]{1,70}$/.test(result.reason) ?
          ' / ' + result.reason : '';
        showError(response.status === 410 ? 'This owner check has expired. Return to the chat.' :
          'The server check returned ' + error + reason + '. Return to the chat with this message.');
      }
    } catch {
      showError('The connection check could not finish. Return to the chat with this message.');
    }
  }
  function render() {
    if (!window.turnstile || typeof window.turnstile.render !== 'function') {
      showError('The security widget could not load. Return to the chat.');
      return;
    }
    widget = window.turnstile.render(holder, {
      sitekey: '0x4AAAAAAF2zhQ7vo9NKBGsh',
      action: 'document_handoff',
      appearance: 'always',
      execution: 'execute',
      retry: 'never',
      callback: submit,
      'error-callback': code => showError('Cloudflare check returned ' + String(code).replace(/[^0-9]/g, '').slice(0,6) + '. Return to the chat.'),
      'expired-callback': () => showError('The security check expired. Reopen the owner link from the chat.'),
    });
    window.turnstile.execute(widget);
  }
  button.addEventListener('click', () => {
    button.disabled = true;
    status.textContent = 'Complete Cloudflare verification if prompted.';
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement('script');
    window.snStandardOwnerReady = render;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=snStandardOwnerReady';
    script.async = true;
    script.onerror = () => showError('The security widget could not load. Return to the chat.');
    document.head.appendChild(script);
  });
  panel.showModal();
})();
