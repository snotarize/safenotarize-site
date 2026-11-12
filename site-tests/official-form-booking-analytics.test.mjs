import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const origin = 'https://safenotarize.com';
const channel = 'safenotarize-official-form-analytics';
const psForm = '/documents/official/ps-1583.html';
const dsForm = '/documents/ht/official/ds-3053.html';
const frameOrigin = origin;
const framePath = '/assets/official-forms/booking-analytics.html';
const vehicleGuide = '/documents/vehicle-release-authorization.html';
const referralTags = '?utm_source=ketterle_sons&utm_medium=referral&utm_campaign=vehicle_release';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('assets/official-forms/booking-analytics.js');
const standardOrder = 'rec12345678901234';
const premiumOrder = 'a914a7d1-df8b-4f25-90a0-52cc4277f309';

function storage() {
  const items = new Map();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key)
  };
}

function open(path, { referrer = '', session = storage(), bookings = storage(), navigator = {},
  parent, navigation = 'navigate' } = {}) {
  const location = new URL(path, origin);
  const pageListeners = new Map(), documentListeners = new Map(), outgoing = [];
  const window = {
    addEventListener: (name, listener) => pageListeners.set(name, listener),
    removeEventListener() {}
  };
  window.parent = parent ?? window;
  const head = [];
  const document = {
    referrer,
    addEventListener: (name, listener) => documentListeners.set(name, listener),
    body: { append: node => node.onLoad?.() },
    head: { append: node => head.push(node) },
    createElement: () => ({
      addEventListener(name, listener) { if (name === 'load') this.onLoad = listener; },
      remove() {},
      setAttribute(name, value) { this[name] = value; },
      contentWindow: {
        postMessage(payload, destination) {
          assert.equal(destination, frameOrigin);
          if (!payload.name) return;
          outgoing.push(payload);
          pageListeners.get('message')?.({ origin: frameOrigin, source: this, data: { channel, sequence: payload.sequence } });
        }
      }
    })
  };
  runInNewContext(source, {
    URL, URLSearchParams, Date, window, document, location, navigator, crypto: globalThis.crypto,
    sessionStorage: session, localStorage: bookings, setTimeout, clearTimeout,
    performance: { getEntriesByType: () => [{ type: navigation }] }
  });
  return {
    window, outgoing, head, session, bookings,
    message: payload => pageListeners.get('message')?.(payload),
    click: type => documentListeners.get('click')?.({
      target: { closest: () => ({ dataset: { documentBooking: type } }) }
    })
  };
}

const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

test('organic USPS landing, continue, and Standard confirmation are tied to the saved order', async () => {
  const landing = open(psForm + '?email=synthetic%40example.test', {
    referrer: 'https://www.bing.com/search?q=synthetic'
  });
  await tick();
  assert.deepEqual(landing.outgoing.map(event => event.name), ['page_view']);
  landing.click('ps-1583');
  const booking = open('/book.html?document_source=official&document_type=ps-1583', landing);
  await tick();
  assert.deepEqual(booking.outgoing.map(event => event.name), ['notarization_continue']);
  booking.window.SafeNotarizeFormAnalytics.rememberStandardBooking('ps-1583', standardOrder);
  assert.equal(booking.outgoing.length, 1);

  const confirmation = open('/thank-you.html?order_id=' + standardOrder, { bookings: landing.bookings });
  const api = confirmation.window.SafeNotarizeFormAnalytics;
  await api.confirmStandardBooking('rec09876543210987');
  assert.deepEqual(confirmation.outgoing, []);
  await api.confirmStandardBooking(standardOrder);
  await api.confirmStandardBooking(standardOrder);
  const [event] = confirmation.outgoing;
  assert.equal(confirmation.outgoing.length, 1);
  assert.equal(event.name, 'notarization_booking_confirmed');
  assert.equal(event.route, 'standard');
  assert.equal(event.journey.page, psForm);
  assert.equal(event.journey.engine, 'bing');
  assert.equal(event.journey.clientId, landing.outgoing[0].journey.clientId);
  assert.doesNotMatch(JSON.stringify(event), /synthetic|rec12345678901234/);
});

test('the Kreyòl DS-3053 editor and Premium booking share one journey and one confirmation', async () => {
  const landing = open(dsForm, { referrer: 'https://www.google.fr/search?q=synthetic' });
  const editor = open('/documents/create/ds-3053.html?lang=ht', landing);
  editor.window.SafeNotarizeFormAnalytics.continueBooking('ds-3053');
  editor.window.SafeNotarizeFormAnalytics.continueBooking('ds-3053');
  await tick();
  assert.deepEqual(editor.outgoing, []);
  const checkout = open('/premium.html?lang=ht&document_source=library&document_type=ds-3053', editor);
  const api = checkout.window.SafeNotarizeFormAnalytics;
  await api.confirmPremiumBooking('ps-1583', premiumOrder);
  await api.confirmPremiumBooking('ds-3053', premiumOrder);
  await api.confirmPremiumBooking('ds-3053', premiumOrder);
  assert.deepEqual(checkout.outgoing.map(event => [event.name, event.route]), [
    ['notarization_continue', undefined],
    ['notarization_booking_confirmed', 'premium']
  ]);
  assert.equal(checkout.outgoing[0].journey.page, dsForm);
  assert.equal(checkout.outgoing[0].journey.clientId, landing.outgoing[0].journey.clientId);
});

test('paid search, direct visits, other forms and opted-out visits produce no events', async () => {
  for (const [path, options] of [
    [psForm + '?gclid=synthetic', { referrer: 'https://www.google.com/' }],
    [psForm + '?utm_medium=cpc', { referrer: 'https://www.bing.com/' }],
    [psForm, {}],
    [psForm, { referrer: 'https://www.google.com.example.test/' }],
    ['/documents/child-travel-consent.html', { referrer: 'https://www.google.com/' }],
    [psForm, { referrer: 'https://www.google.com/', navigator: { globalPrivacyControl: true } }]
  ]) {
    const page = open(path, options);
    await tick();
    assert.deepEqual(page.outgoing, [], path);
  }
});

test('the isolated Google tag only receives allowlisted event fields and clean public URLs', async () => {
  const landing = open(psForm + '?email=synthetic%40example.test', {
    referrer: 'https://www.google.com/search?q=synthetic'
  });
  await tick();
  const parent = { postMessage() {} };
  const isolated = open(framePath, { parent });
  const data = { ...landing.outgoing[0], unknown: 'synthetic', journey: {
    ...landing.outgoing[0].journey, email: 'synthetic@example.test'
  }};
  isolated.message({ source: parent, origin: 'https://example.test', data });
  isolated.message({ source: {}, origin, data });
  assert.equal(isolated.head.length, 0);
  isolated.message({ source: parent, origin, data });
  assert.equal(isolated.head.length, 1);
  const commands = isolated.window.dataLayer.map(args => Array.from(args));
  const config = commands.find(args => args[0] === 'config');
  const event = commands.find(args => args[0] === 'event');
  assert.equal(config[2].send_page_view, false);
  assert.equal(config[2].allow_ad_personalization_signals, false);
  assert.equal(event[2].page_location, origin + psForm);
  assert.equal(event[2].page_referrer, 'https://www.google.com/');
  assert.equal(event[2].form_type, 'ps-1583');
  assert.equal(event[2].form_language, 'en');
  assert.equal(event[2].send_to, config[1]);
  assert.doesNotMatch(JSON.stringify(commands), /synthetic/);
});

test('each Ketterle placement follows customer PDFs and templates through verified bookings', async () => {
  for (const [placement, suffix, documentSource, route] of [
    ['counter_qr', '&utm_content=counter_qr', 'own', 'standard'],
    ['checklist_pdf', '&utm_content=checklist_pdf', 'own', 'premium'],
    ['website_link', '', 'library', 'premium'],
    ['counter_qr', '&utm_content=counter_qr', 'library', 'standard']
  ]) {
    const url = vehicleGuide + referralTags + suffix + '&email=synthetic%40example.test';
    const landing = open(url);
    const reload = open(url, { ...landing, navigation: 'reload' });
    await tick();
    assert.deepEqual(landing.outgoing.map(event => event.name), ['page_view']);
    assert.deepEqual(reload.outgoing, []);

    const path = route === 'standard' ? '/book.html' : '/premium.html';
    const booking = open(`${path}?document_source=${documentSource}&document_type=vehicle-release`, landing);
    await tick();
    assert.deepEqual(booking.outgoing.map(event => event.name), ['notarization_continue']);
    const api = booking.window.SafeNotarizeFormAnalytics;
    let confirmation = booking;
    if (route === 'standard') {
      api.rememberStandardBooking('vehicle-release', standardOrder);
      confirmation = open('/thank-you.html', { bookings: landing.bookings });
      const confirmed = confirmation.window.SafeNotarizeFormAnalytics;
      await confirmed.confirmStandardBooking('rec09876543210987');
      assert.deepEqual(confirmation.outgoing, []);
      await confirmed.confirmStandardBooking(standardOrder);
      await confirmed.confirmStandardBooking(standardOrder);
    } else {
      await api.confirmPremiumBooking('ps-1583', premiumOrder);
      assert.equal(booking.outgoing.length, 1);
      await api.confirmPremiumBooking('vehicle-release', premiumOrder);
      await api.confirmPremiumBooking('vehicle-release', premiumOrder);
    }
    const confirmations = confirmation.outgoing.filter(event => event.name === 'notarization_booking_confirmed');
    assert.equal(confirmations.length, 1);
    const [event] = confirmations;
    assert.equal(event.route, route);
    assert.equal(event.journey.placement, placement);
    assert.equal(event.journey.clientId, landing.outgoing[0].journey.clientId);

    const parent = { postMessage() {} };
    const frame = open(framePath + '?v=2', { parent });
    frame.message({ source: parent, origin, data: event });
    const tagEvent = frame.window.dataLayer.find(args => args[0] === 'event')[2];
    assert.equal(tagEvent.campaign_source, 'ketterle_sons');
    assert.equal(tagEvent.campaign_medium, 'referral');
    assert.equal(tagEvent.campaign_name, 'vehicle_release');
    assert.equal(tagEvent.campaign_content, placement);
    assert.equal(tagEvent.page_location, origin + vehicleGuide + referralTags + '&utm_content=' + placement);
    assert.equal(tagEvent.page_referrer, '');
    assert.equal(tagEvent.document_type, 'vehicle-release');
    assert.equal(tagEvent.booking_route, route);
    assert.doesNotMatch(JSON.stringify(frame.window.dataLayer), /synthetic|rec12345678901234|a914a7d1/);
  }
});

test('invalid and paid campaign tags clear an earlier Ketterle journey on a new landing', async () => {
  for (const query of ['', referralTags + '&gclid=example', referralTags + '&utm_content=unknown',
    referralTags.replace('ketterle_sons', 'other_source')]) {
    const landing = open(vehicleGuide + referralTags + '&utm_content=counter_qr');
    const next = open(vehicleGuide + query, landing);
    const booking = open('/book.html?document_source=own&document_type=vehicle-release', next);
    await tick();
    assert.deepEqual(next.outgoing, []);
    assert.deepEqual(booking.outgoing, []);
  }
});

test('English and Kreyòl vehicle guides load tracking and carry the document type on every PDF link', () => {
  for (const page of [vehicleGuide, '/documents/ht/vehicle-release-authorization.html']) {
    const html = read(page.slice(1));
    assert.match(html, /src="\/assets\/official-forms\/booking-analytics\.js\?v=2"/);
    const ownPdfLinks = [...html.matchAll(/href="(\/book(?:-ht)?\.html\?[^\"]*document_source=own[^\"]*)"/g)];
    assert.ok(ownPdfLinks.length > 0);
    assert.ok(ownPdfLinks.every(([, href]) => new URL(href.replaceAll('&amp;', '&'), origin)
      .searchParams.get('document_type') === 'vehicle-release'));
  }
});
