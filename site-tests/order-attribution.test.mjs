import assert from 'node:assert/strict';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('assets/order-attribution.js');
const origin = 'https://safenotarize.com';
const requestId = '44444444-4444-4444-8444-444444444444';
const standardId = 'rec00000000000001';
const premiumId = randomUUID();
const access = 'a'.repeat(64);
const now = 1_794_585_600_000;
const click = 'test-click-id-no-provider';
const digest = value => createHash('sha256').update(value).digest('hex');

function browser({ path, referrer = '', storage = new Map(), requests = [], optedOut = false, status = 204,
  time = now, standardFormOpen = false, analytics }) {
  const location = new URL(path, origin);
  const window = { SafeNotarizeAnalytics: analytics };
  runInNewContext(source, {
    location, document: { referrer, getElementById: id => id === 'booking-form' && standardFormOpen
      ? { classList: { contains: () => false } } : null }, window, URL, URLSearchParams, crypto: webcrypto, TextEncoder,
    Date: { now: () => time },
    navigator: { globalPrivacyControl: optedOut },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return new Response(null, { status });
    }
  });
  return window.SafeNotarizeOrderAttribution;
}

test('service and accepted intake callbacks expose only fixed routes to the public funnel', async () => {
  const events = [];
  const attribution = browser({ path: '/book.html', analytics: {
    serviceSelected: service => events.push(['service', service]),
    intakeSubmitted: route => events.push(['intake', route])
  } });
  attribution.serviceSelected('regular');
  await attribution.standard('invalid', requestId, 'own');
  await attribution.premium(premiumId, 'invalid', 'own');
  assert.deepEqual(events, [['service', 'regular']]);
  await attribution.standard(standardId, requestId, 'own');
  await attribution.premium(premiumId, access, 'own');
  assert.deepEqual(events, [['service', 'regular'], ['intake', 'standard'], ['intake', 'premium']]);
  assert.doesNotMatch(JSON.stringify(events), new RegExp(standardId + '|' + requestId + '|' + access));
});

for (const [route, path, order, proof] of [
  ['standard', '/book.html', standardId, requestId],
  ['premium', '/premium.html', premiumId, access]
]) {
  for (const documentSource of ['own', 'library']) {
    test(`${route} with a ${documentSource} document attributes a paid ad through navigation without sending credentials`, async () => {
      const requests = [];
      const storage = new Map();
      browser({ path: '/start?utm_source=google&utm_medium=cpc&utm_campaign=online_notary_transactions&gclid=' + click, storage, requests });
      const attribution = browser({ path, referrer: origin + '/documents/library.html', storage, requests });
      await attribution[route](order, proof, documentSource);
      assert.equal(requests.length, 1);
      const event = requests[0];
      assert.match(event.url, /^https:\/\/[^/]+\/v1\/orders$/);
      assert.equal(event.options.keepalive, true);
      assert.equal(event.options.referrerPolicy, 'no-referrer');
      assert.equal(event.options.credentials, 'omit');
      assert.deepEqual(event.body, {
        route, orderId: order, proof: digest(proof), documentSource, source: 'google_ads',
        campaign: 'online_notary_transactions', clickType: 'gclid', clickId: click
      });
      assert.equal(event.options.body.includes(proof), false);
    });
  }
}

test('organic and referral landings replace earlier paid attribution, and direct traffic stays unknown', async () => {
  for (const [referrer, expected] of [['https://www.google.com/search?q=test', 'organic_search'], ['https://example.org/', 'referral'], ['', 'direct_or_unknown']]) {
    const storage = new Map();
    const requests = [];
    if (referrer) browser({ path: '/start?gclid=' + click, storage, requests });
    browser({ path: '/online-notary.html', referrer, storage, requests });
    await browser({ path: '/book-ht.html', referrer: origin + '/online-notary.html', storage, requests }).standard(standardId, requestId, 'own');
    assert.equal(requests[0].body.source, expected);
    assert.equal(requests[0].body.clickId, undefined);
  }
});

test('privacy opt-out prevents collection and a missing click ID cannot be fabricated from tags', async () => {
  const requests = [];
  const path = '/book.html?utm_source=google&utm_medium=cpc&utm_campaign=vehicle_release_orlando';
  assert.equal(browser({ path, optedOut: true, requests }), undefined);
  await browser({ path, requests }).standard(standardId, requestId, 'own');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.source, 'google_ads');
  assert.equal(requests[0].body.clickId, undefined);
});

test('failed collection retries on the return page and excludes that page’s URL and referrer', async () => {
  const storage = new Map();
  const requests = [];
  await browser({ path: '/book?gclid=' + click, storage, requests, status: 503 }).standard(standardId, requestId, 'library');
  browser({ path: '/thank-you.html?order_id=' + standardId, referrer: 'https://example.org/upload', storage, requests });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].body, requests[0].body);
  await new Promise(resolve => setImmediate(resolve));
  browser({ path: '/thank-you.html', storage, requests });
  assert.equal(requests.length, 2);
});

test('both booking paths carry the original ChatGPT click reference only with the order', async () => {
  const path = '/start.html?utm_source=chatgpt&utm_medium=cpc&utm_campaign=online_notary_chatgpt&oppref=fixture-reference';
  for (const [route, service, booking, order, proof] of [
    ['standard', 'regular', '/book.html?document_ready=1&service=regular', standardId, requestId],
    ['premium', 'premium', '/premium.html?service=premium', premiumId, access]
  ]) {
    const storage = new Map();
    const requests = [];
    browser({ path, storage, requests }).serviceSelected(service);
    const form = browser({ path: booking, referrer: origin + '/start.html', storage, requests,
      standardFormOpen: route === 'standard' });
    if (route === 'premium') form.bookingStarted(route);
    await form[route](order, proof, 'own');
    const visitId = requests[0].body.visitId;
    assert.match(visitId, /^[\da-f-]{36}$/);
    assert.deepEqual(requests.slice(0, 3).map(request => request.body), [
      { stage: 'landing', route: '', visitId },
      { stage: 'service_selected', route, visitId },
      { stage: 'booking_started', route, visitId }
    ]);
    assert.ok(requests.slice(0, 3).every(request => request.url.endsWith('/v1/chatgpt-funnel')));
    assert.deepEqual(requests[3].body, {
      route, orderId: order, proof: digest(proof), documentSource: 'own', source: 'other_paid',
      chatgptVisitId: visitId, chatgptClickRef: 'fixture-reference'
    });
    assert.equal(JSON.stringify(requests.slice(0, 3)).includes('fixture-reference'), false);
    assert.equal(JSON.stringify(requests).includes(proof), false);
    browser({ path, storage, requests });
    assert.equal(requests.at(-1).body.visitId, visitId);
  }
});

test('ChatGPT preview clicks and browser privacy opt-outs cannot contribute paid-order attribution', async () => {
  const requests = [];
  const path = '/start.html?utm_source=chatgpt&utm_medium=cpc&utm_campaign=online_notary_chatgpt';
  assert.equal(browser({ path: path + '&oppref=fixture-reference', optedOut: true, requests }), undefined);
  assert.deepEqual(requests, []);
  await browser({ path: path + '&oppref=preview_mock', requests }).standard(standardId, requestId, 'own');
  assert.equal(requests.at(-1).body.chatgptClickRef, undefined);
});

test('other paid visits and privacy opt-outs do not report ChatGPT stages', () => {
  const requests = [];
  const path = '/start.html?utm_source=chatgpt&utm_medium=cpc&utm_campaign=online_notary_chatgpt';
  assert.equal(browser({ path, requests, optedOut: true }), undefined);
  const other = browser({ path: path.replace('online_notary_chatgpt', 'another-campaign'), requests });
  other.serviceSelected('regular');
  other.bookingStarted('standard');
  assert.deepEqual(requests, []);
});

test('the supported booking pages load attribution before notifying it of a real order', () => {
  for (const file of ['start.html', 'start-ht.html', 'book.html', 'book-ht.html', 'premium.html']) {
    assert.match(read(file), /<script src="\/assets\/order-attribution\.js\?v=\d+" defer><\/script>/);
  }
  for (const file of ['documents/vehicle-release-authorization.html', 'documents/library.html']) {
    assert.match(read(file), /<script src="\/assets\/order-attribution\.js\?v=\d+" defer><\/script>/);
  }
  for (const file of ['book.html', 'book-ht.html']) {
    assert.match(read(file), /const orderId = await submitIntake\(payload\);\s+await window\.SafeNotarizeOrderAttribution\?\.standard\(orderId, bookingRequestId, payload\.document_source\)/);
  }
  assert.match(read('assets/premium/checkout.js'), /payment_contract_invalid'\);\s+}\s+if \(live\) await window\.SafeNotarizeOrderAttribution\?\.premium\(id, access, source\);/);
  assert.match(read('assets/premium/checkout.js'), /form\.addEventListener\('submit', continueToNotary\);\s+status\.textContent = '';\s+window\.SafeNotarizeOrderAttribution\?\.bookingStarted\?\.\('premium'\);/);
  assert.match(read('assets/premium/services.js'), /addEventListener\('click', \(\) => window\.SafeNotarizeOrderAttribution\?\.serviceSelected\?\.\(service\)\)/);
  assert.match(read('premium.html'), /id="premium-status" role="status">Loading secure checkout…</);
});

test('Analytics identity is attached only to the existing order proof and does not send customer fields', async () => {
  const requests = [];
  const identity = { clientId: '12345678.1795040000', sessionId: '1795040000' };
  const api = browser({ path: '/book.html', requests, analytics: { context: async () => identity } });
  await api.standard(standardId, requestId, 'own');
  assert.deepEqual(requests[0].body.ga4, identity);
  assert.equal(requests[0].body.proof, digest(requestId));
  assert.doesNotMatch(JSON.stringify(requests[0].body), /email|phone|clientName|invoiceRecipient/);
});

for (const [route, path, order, proof] of [
  ['standard', '/book.html', standardId, requestId],
  ['premium', '/premium.html', premiumId, access]
]) {
  for (const clickType of ['gclid', 'gbraid', 'wbraid']) {
    test(`new account ${route} ${clickType} reaches its private collector without waiting for old Analytics`, async () => {
      const storage = new Map(), requests = [];
      const entry = '/start.html?utm_source=google&utm_medium=cpc&utm_campaign=online_notary_7872348986&' + clickType + '=' + click;
      browser({ path: entry, storage, requests });
      let identityReads = 0;
      const api = browser({ path, storage, requests, analytics: {
        context: () => { identityReads++; throw new Error('Old Analytics unavailable'); }
      } });
      await api[route](order, proof, 'library');
      assert.equal(identityReads, 0);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, 'https://safenotarize-google-ads-7872348986.karlberryj.workers.dev/v1/orders');
      assert.deepEqual(requests[0].body, {
        route, orderId: order, proof: digest(proof), documentSource: 'library', source: 'google_ads',
        campaign: 'online_notary_7872348986', clickType, clickId: click
      });
      assert.equal(requests[0].options.body.includes(proof), false);
      assert.doesNotMatch(requests[0].options.body, /ga4|clientId|sessionId|email|phone/);
    });
  }
}

test('new account retries preserve their destination and invalid proofs cannot enter the queue', async () => {
  const storage = new Map(), requests = [];
  const path = '/book.html?utm_source=google&utm_medium=cpc&utm_campaign=online_notary_7872348986&gclid=' + click;
  const api = browser({ path, storage, requests, status: 503 });
  await api.standard(standardId, 'invalid', 'own');
  await api.premium(premiumId, 'invalid', 'own');
  assert.deepEqual(requests, []);
  await api.standard(standardId, requestId, 'own');
  browser({ path: '/thank-you.html?order_id=' + standardId, storage, requests });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, requests[0].url);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.equal(requests[1].body.ga4, undefined);
});

test('previous account campaigns keep their existing endpoint and measurement context', async () => {
  const requests = [], identity = { clientId: '12345678.1795040000', sessionId: '1795040000' };
  for (const campaign of ['online_notary_transactions', 'vehicle_release_orlando']) {
    await browser({ path: '/book.html?utm_source=google&utm_medium=cpc&utm_campaign=' + campaign + '&gclid=' + click,
      requests, analytics: { context: async () => identity } }).standard(standardId, requestId, 'own');
  }
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, 'https://safenotarize-vehicle-release-metrics.karlberryj.workers.dev/v1/orders');
    assert.deepEqual(request.body.ga4, identity);
  }
});
