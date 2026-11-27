import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('assets/ga4-tracking.js');
function browser(path, { optedOut = false, dnt = false, blocked = false, clientId = '12345678.1795040000',
  referrer = 'https://www.google.com/search?q=private-search' } = {}) {
  const commands = [], tags = [], listeners = new Map();
  const window = { gtag(...args) {
    commands.push(args);
    if (args[0] === 'get' && !blocked) args[3](args[2] === 'client_id' ? clientId : 1795040000);
  }};
  window.parent = window;
  const context = {
    location: new URL(path, 'https://safenotarize.com'), window,
    document: { referrer,
      querySelector: () => null, createElement: () => ({}), head: { append: tag => tags.push(tag) },
      addEventListener: (name, callback) => listeners.set(name, callback) },
    navigator: { globalPrivacyControl: optedOut, doNotTrack: dnt ? '1' : '0' },
    URL, URLSearchParams, Promise, Date, setTimeout: fn => setTimeout(fn, 5), clearTimeout
  };
  runInNewContext(source, context);
  return { commands, tags, api: window.SafeNotarizeAnalytics,
    reloadScript: () => runInNewContext(source, context),
    click: href => listeners.get('click')?.({ button: 0, target: { closest: () => ({ href }) } }) };
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
  assert.equal(tags.filter(tag => tag.src.includes('googletagmanager.com/gtag/js')).length, 1);
  assert.equal(tags.filter(tag => tag.src.includes('/assets/visitor-journey.js')).length, 1);
  assert.ok(tags.every(tag => tag.referrerPolicy === 'no-referrer'));
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
  assert.equal(browser('/documents/vehicle-release-authorization.html?utm_source=ketterle_sons&utm_medium=referral&utm_campaign=vehicle_release').api, undefined);
  assert.ok(browser('/documents/vehicle-release-authorization.html?utm_source=google&utm_medium=cpc').api);
  assert.ok(browser('/documents/vehicle-release-authorization.html', { referrer: '' }).api);
});

test('official-form organic page views stay isolated and paid/direct visits are now covered', () => {
  for (const path of ['/documents/official/ds-3053.html', '/documents/ht/official/ps-1583.html']) {
    assert.equal(browser(path).api, undefined);
    assert.equal(browser(path + '?utm_source=bing&utm_medium=organic', { referrer: '' }).api, undefined);
    assert.ok(browser(path, { referrer: '' }).api);
    assert.ok(browser(path + '?gclid=test-paid-click').api);
    assert.ok(browser(path + '?utm_source=google&utm_medium=cpc').api);
  }
});

test('public ad entry and booking pages load Analytics before order attribution', () => {
  for (const page of ['start.html', 'start-ht.html', 'book.html', 'book-ht.html', 'premium.html', 'documents/library.html']) {
    const html = read(page);
    assert.ok(html.indexOf('/assets/ga4-tracking.js') > 0, page);
    assert.ok(html.indexOf('/assets/ga4-tracking.js') < html.indexOf('/assets/order-attribution.js'), page);
  }
  assert.doesNotMatch(read('premium-complete.html'), /ga4-tracking/);
});

test('funnel steps reject customer data and repeated callbacks do not inflate the funnel', () => {
  const { api, commands, reloadScript } = browser('/start.html?email=private@example.test');
  reloadScript();
  api.serviceSelected('regular');
  api.serviceSelected('regular');
  api.serviceSelected('premium');
  api.serviceSelected('private@example.test');
  api.documentChoiceSelected('regular', 'own');
  api.documentChoiceSelected('regular', 'template');
  api.documentChoiceSelected('regular', 'private document contents');
  api.bookingStarted('standard');
  api.bookingStarted('standard');
  api.bookingStep('standard', 'session_details');
  api.bookingStep('standard', 'session_details');
  api.bookingStep('standard', 'private person name');
  api.bookingStep('premium', 'session_details');
  api.intakeSubmitted('standard');
  api.intakeSubmitted('standard');
  api.intakeSubmitted('private@example.test');
  const names = commands.filter(args => args[0] === 'event').map(args => args[1]);
  assert.equal(names.filter(name => name === 'page_view').length, 1);
  assert.equal(names.filter(name => name === 'begin_checkout').length, 1);
  assert.equal(names.filter(name => name === 'notarization_service_selected').length, 2);
  assert.equal(names.filter(name => name === 'notarization_document_choice').length, 2);
  assert.equal(names.filter(name => name === 'notarization_booking_step').length, 2);
  assert.equal(names.filter(name => name === 'notarization_intake_submitted').length, 1);
  assert.doesNotMatch(JSON.stringify(commands), /private|person name|purchase|transaction_id|value|currency/);
});

test('navigation measurement never transmits destination queries, private contents or external URLs', () => {
  const { click, commands } = browser('/affidavit-notary.html');
  click('https://safenotarize.com/start.html?email=private@example.test');
  click('https://safenotarize.com/book.html?order=private-order&access=private-access');
  click('https://safenotarize.com/documents/create/affidavit-of-support.html?name=private-name');
  click('https://example.test/book.html?email=private@example.test');
  click('mailto:private@example.test');
  const navigation = commands.filter(args => args[1] === 'notarization_cta_click');
  assert.deepEqual(navigation.map(args => args[2].cta_target), ['start', 'standard_booking', 'document_editor']);
  assert.ok(navigation.every(args => args[2].transport_type === 'beacon'));
  assert.doesNotMatch(JSON.stringify(commands), /private|example\.test|document contents|access=/);
});

test('all public sitemap pages are covered while receipt and editor pages stay private', () => {
  const pages = [...read('sitemap.xml').matchAll(/<loc>(https:\/\/safenotarize\.com[^<]*)<\/loc>/g)]
    .map(match => new URL(match[1]).pathname.slice(1) || 'index.html');
  assert.ok(pages.length > 90);
  for (const page of pages) {
    const html = read(page);
    assert.equal((html.match(/src="\/assets\/ga4-tracking\.js/g) || []).length, 1, page);
    assert.ok(html.indexOf('/assets/ga4-tracking.js') < html.indexOf('/assets/order-attribution.js'), page);
  }
  for (const page of ['premium-complete.html', 'thank-you.html', 'thank-you-ht.html', 'upload.html',
    'upload-ht.html', 'documents/create.html', 'documents/create/ds-3053.html']) {
    assert.doesNotMatch(read(page), /src="\/assets\/ga4-tracking\.js/, page);
  }
});
