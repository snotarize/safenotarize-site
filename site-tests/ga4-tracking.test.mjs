import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('assets/ga4-tracking.js');
function browser(path, { optedOut = false, dnt = false, blocked = false, clientId = '12345678.1795040000' } = {}) {
  const commands = [], tags = [];
  const window = { gtag(...args) {
    commands.push(args);
    if (args[0] === 'get' && !blocked) args[3](args[2] === 'client_id' ? clientId : 1795040000);
  }};
  window.parent = window;
  runInNewContext(source, {
    location: new URL(path, 'https://safenotarize.com'), window,
    document: { referrer: 'https://www.google.com/search?q=private-search',
      querySelector: () => null, createElement: () => ({}), head: { append: tag => tags.push(tag) } },
    navigator: { globalPrivacyControl: optedOut, doNotTrack: dnt ? '1' : '0' },
    URL, URLSearchParams, Promise, Date, setTimeout: fn => setTimeout(fn, 5), clearTimeout
  });
  return { commands, tags, api: window.SafeNotarizeAnalytics };
}

test('ad visits record one page view without passing private URL fields or enabling advertising personalization', () => {
  const { commands, tags } = browser('/start.html?utm_source=google&utm_medium=cpc&utm_campaign=online_notary_transactions&gclid=test-click-123&email=private%40example.test&order=private-order&access=private-access#resume=private-resume');
  const config = commands.find(args => args[0] === 'config');
  assert.equal(config[1], 'G-EJKPHSTSNH');
  assert.equal(config[2].send_page_view, false);
  assert.equal(config[2].allow_google_signals, false);
  assert.equal(config[2].allow_ad_personalization_signals, false);
  assert.equal(commands.filter(args => args[0] === 'event' && args[1] === 'page_view').length, 1);
  assert.doesNotMatch(JSON.stringify(commands), /private-|private%40|search\?q|resume/);
  assert.match(config[2].page_location, /gclid=test-click-123/);
  assert.equal(config[2].page_referrer, 'https://www.google.com/');
  assert.equal(tags.length, 1);
  assert.equal(tags[0].referrerPolicy, 'no-referrer');
});

test('bookings are checkout steps, and no public page emits purchases', async () => {
  const { api, commands } = browser('/book.html');
  api.bookingStarted('standard');
  api.bookingStarted('unknown');
  const identity = await api.context();
  assert.deepEqual(JSON.parse(JSON.stringify(identity)), { clientId: '12345678.1795040000', sessionId: '1795040000' });
  assert.equal(commands.filter(args => args[0] === 'event' && args[1] === 'begin_checkout').length, 1);
  assert.equal(commands.some(args => args[1] === 'purchase'), false);
  assert.equal(api.purchase, undefined);
});

test('blocked tags and invalid identities produce no fabricated Analytics identity', async () => {
  assert.equal(await browser('/premium.html', { blocked: true }).api.context(), null);
  assert.equal(await browser('/premium.html', { clientId: 'private@example.test' }).api.context(), null);
});

test('private receipt pages, uploads, editors and opted-out visitors are excluded', () => {
  for (const path of ['/premium-complete.html?order=private', '/thank-you.html', '/upload.html', '/documents/create/ds-3053.html']) {
    const page = browser(path);
    assert.equal(page.api, undefined, path);
    assert.equal(page.commands.length, 0, path);
  }
  assert.equal(browser('/start.html', { optedOut: true }).api, undefined);
  assert.equal(browser('/start.html', { dnt: true }).api, undefined);
});

test('vehicle-release referral measurement is preserved without duplicating its page view', () => {
  assert.equal(browser('/documents/vehicle-release-authorization.html?utm_source=ketterle_sons&utm_medium=referral').api, undefined);
  assert.ok(browser('/documents/vehicle-release-authorization.html?utm_source=google&utm_medium=cpc').api);
});

test('public ad entry and booking pages load Analytics before order attribution', () => {
  for (const page of ['start.html', 'start-ht.html', 'book.html', 'book-ht.html', 'premium.html', 'documents/library.html']) {
    const html = read(page);
    assert.ok(html.indexOf('/assets/ga4-tracking.js') > 0, page);
    assert.ok(html.indexOf('/assets/ga4-tracking.js') < html.indexOf('/assets/order-attribution.js'), page);
  }
  assert.doesNotMatch(read('premium-complete.html'), /ga4-tracking/);
});
