const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');
const { chromium } = require('playwright');

const site = 'https://safenotarize.com';
const worker = 'https://safenotarize-phase-c-premium-production.karlberryj.workers.dev';
const stream = 'G-EJKPHSTSNH';
const ps = '/documents/official/ps-1583.html';
const ds = '/documents/ht/official/ds-3053.html';
const order = 'rec12345678901234';
const marker = 'SyntheticSensitive';
const root = process.cwd();
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS' };
const config = { enabled: true, mode: 'live', acceptingOrders: true, allowedOrigins: [site],
  endpoint: worker + '/phase-c', stripePublishableKey: 'pk_live_fixture', turnstileSiteKey: 'fixture',
  pricing: { base: 3000, notarization: 2500, service: 500, additionalSigner: 1000, additionalStamp: 1000, witness: 1500 } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
  const events = [];
  const collected = [];
  const scriptRequests = [];
  const errors = [];
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const js = body => route.fulfill({ contentType: 'application/javascript', body, headers: cors });
      const json = value => route.fulfill({ json: value, headers: cors });
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (url.origin === site) {
        const file = resolve(root, '.' + url.pathname);
        if (!file.startsWith(root + sep) || !mime[extname(file)]) return route.abort();
        const body = await readFile(file).catch(() => null);
        return body ? route.fulfill({ body, contentType: mime[extname(file)] }) : route.abort();
      }
      if (url.hostname === 'www.googletagmanager.com' && /^\/gtag\/(?:js|destination)$/.test(url.pathname) &&
          url.searchParams.get('id') === stream) {
        const response = await fetch('https://www.googletagmanager.com' + url.pathname + '?id=' + stream);
        if (!response.ok) throw Error('Google tag source was unavailable');
        scriptRequests.push(url.pathname);
        return js(await response.text());
      }
      if (url.pathname.includes('/collect')) {
        const body = request.postData() || '';
        if (url.searchParams.get('tid') === stream) {
          collected.push(request.url() + '\n' + body);
          for (const line of body.split('\n')) {
            const params = new URLSearchParams(url.search);
            for (const [key, value] of new URLSearchParams(line)) params.set(key, value);
            if (params.has('en')) events.push(Object.fromEntries(params));
          }
        }
        return route.fulfill({ status: 204, headers: cors });
      }
      if (url.hostname === 'hook.us2.make.com') {
        assert.equal(request.method(), 'GET');
        return json({ ready: true, link: 'https://app.bluenotary.us/synthetic-check' });
      }
      if (url.origin === worker) {
        if (url.pathname === '/phase-c/config.js') return js('window.SN_PREMIUM=' + JSON.stringify(config));
        if (url.pathname === '/phase-c/availability') return json({ ready: true, mode: 'live' });
        if (url.pathname === '/phase-c/payment') {
          return json({ orderId: request.postDataJSON().id, amount: 3000, clientSecret: 'synthetic-only' });
        }
        if (url.pathname === '/phase-c/session') {
          return json({ link: 'https://app.onenotary.us/synthetic-check' });
        }
      }
      if (url.hostname === 'js.stripe.com') {
        return js('window.Stripe=()=>({elements:()=>({create:()=>({mount(){}})}),retrievePaymentIntent:async()=>({paymentIntent:{amount:3000,currency:"usd",livemode:true,status:"requires_payment_method"}}),confirmCardPayment:async()=>({paymentIntent:{status:"requires_capture"}})});');
      }
      if (url.hostname === 'challenges.cloudflare.com') {
        return js('window.turnstile={render(_,options){options.callback("synthetic");return "test";},reset(){}};');
      }
      if (url.origin === 'https://app.onenotary.us' && url.pathname === '/synthetic-check') {
        return route.fulfill({ contentType: 'text/html', body: '<h1>Simulated notarization session</h1>' });
      }
      return route.abort();
    });

    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function expectEvent(name, path, route) {
      for (let i = 0; i < 60; i++) {
        const result = events.find(event => event.en === name && event.dl === site + path &&
          (!route || event['ep.booking_route'] === route));
        if (result) return result;
        await pause(100);
      }
      throw Error('Missing ' + name + ' for ' + path + ' ' + (route || '') +
        '; Google scripts: ' + scriptRequests.join(', ') +
        '; received: ' + events.map(event => event.en).join(', ') +
        '; browser errors: ' + errors.join(', '));
    }

    await page.goto(site + ps + '?email=' + marker + '%40example.test', { referer: 'https://www.bing.com/search?q=' + marker });
    const psLanding = await expectEvent('page_view', ps);
    assert.equal(psLanding.dr, 'https://www.bing.com/');
    await page.locator('a[data-document-booking="ps-1583"]').first().click();
    await page.waitForURL(/\/book\.html/);
    const psContinue = await expectEvent('notarization_continue', ps);
    await page.evaluate(id => window.SafeNotarizeFormAnalytics.rememberStandardBooking('ps-1583', id), order);
    assert.equal(events.filter(event => event.en === 'notarization_booking_confirmed').length, 0);
    await page.goto(site + '/thank-you.html?order_id=' + order + '&signer=' + marker + '%40example.test');
    const psConfirmed = await expectEvent('notarization_booking_confirmed', ps, 'standard');
    await page.reload();
    await page.getByRole('link', { name: /join/i }).first().waitFor({ timeout: 5000 });
    assert.equal(psLanding.cid, psContinue.cid);
    assert.equal(psLanding.cid, psConfirmed.cid);

    await page.goto(site + ds + '?service=premium&email=' + marker + '%40example.test', { referer: 'https://www.google.com/search?q=' + marker });
    const dsLanding = await expectEvent('page_view', ds);
    await page.locator('a[data-document-booking="ds-3053"]').first().click();
    await page.waitForURL(/\/premium\.html/);
    const dsContinue = await expectEvent('notarization_continue', ds);
    assert.equal(new URL(page.url()).searchParams.get('document_type'), 'ds-3053');
    await page.locator('#premium-email').fill(marker + '@example.test');
    await page.locator('#premium-terms').check();
    await page.locator('#premium-submit').click();
    await page.waitForURL('https://app.onenotary.us/synthetic-check');
    const dsConfirmed = await expectEvent('notarization_booking_confirmed', ds, 'premium');
    assert.equal(dsLanding.cid, dsContinue.cid);
    assert.equal(dsLanding.cid, dsConfirmed.cid);
    assert.equal(dsConfirmed['ep.form_type'], 'ds-3053');
    assert.equal(dsConfirmed['ep.form_language'], 'ht');
    assert.equal(events.filter(event => event.en === 'notarization_booking_confirmed').length, 2);
    assert.ok(collected.length >= 6);
    assert.ok(collected.every(request => !request.includes(marker) && !request.includes(order)));
    console.log('Chrome verified both form funnels, both confirmation routes, and clean Google Analytics requests. Analytics and booking requests were intercepted.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
