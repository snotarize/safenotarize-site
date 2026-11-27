import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../assets/visitor-journey.js', import.meta.url), 'utf8');
let seed = 0;
function browser(path = '/book.html', options = {}) {
  const events = [], attributes = [], tags = [], listeners = new Map(), timers = new Map();
  const storage = options.storage || new Map();
  let clock = 0;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.value = ''; this.disabled = false; }
    append(...items) { this.children.push(...items); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
    emit(name, value = {}) { this.listeners[name]?.(value); }
  }
  const body = new Element('body'), main = new Element('main');
  const loaded = () => {
    window.Tawk_API.addEvent = (name, meta, callback) => { events.push({ name, meta }); callback?.(options.apiError); };
    window.Tawk_API.setAttributes = (meta, callback) => { attributes.push(meta); callback?.(); };
    window.Tawk_API.hideWidget = () => {};
  };
  function on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); }
  const window = { Tawk_API: {}, addEventListener: on };
  window.parent = options.iframe ? {} : window;
  const document = { referrer: options.referrer || '', body, documentElement: { lang: options.lang || 'en' },
    visibilityState: 'visible', head: { append: node => tags.push(node) },
    querySelector: selector => selector === 'main' ? main : options.existingWidget ? {} : null,
    createElement: tag => new Element(tag), addEventListener: on };
  if (options.ready !== false) loaded();
  if (options.previousLoad) window.Tawk_API.onLoad = options.previousLoad;
  const context = { window, document, location: new URL(path, options.origin || 'https://safenotarize.com'),
    navigator: { globalPrivacyControl: options.gpc || false, doNotTrack: options.dnt ? '1' : '0' },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem(key, value) { if (options.blockStorage) throw Error('blocked'); storage.set(key, value); } },
    crypto: { getRandomValues: bytes => bytes.fill(++seed % 255) }, Uint8Array, URL, URLSearchParams, Date,
    setTimeout(fn, ms) { timers.set(++clock, { fn, ms }); return clock; }, clearTimeout(id) { timers.delete(id); } };
  runInNewContext(source, context);
  return { window, document, storage, events, attributes, tags, main, body, timers,
    api: window.SafeNotarizeJourney,
    emit(name, event = {}) { for (const fn of listeners.get(name) || []) fn(event); },
    load() { loaded(); window.Tawk_API.onLoad?.(); },
    reload() { runInNewContext(source, context); },
    find(tag) { const walk = node => node.tag === tag ? node : node.children?.map(walk).find(Boolean); return walk(main) || walk(body); }
  };
}

test('one anonymous visit links page and booking activity across public pages', () => {
  const first = browser('/start.html?utm_source=google&utm_medium=cpc');
  first.api.record('notarization_service_selected', { booking_route: 'premium' });
  const second = browser('/premium.html', { storage: first.storage });
  second.api.record('notarization_booking_step', { booking_route: 'premium', booking_step: 'payment_details' });
  assert.equal(first.events[0].meta.visit, second.events[0].meta.visit);
  assert.notEqual(first.events[0].meta['event-id'], second.events[0].meta['event-id']);
  assert.equal(second.events.at(-1).meta.step, 'payment_details');
  assert.equal(second.events.at(-1).meta.page, '/premium.html');
  assert.match(second.events.at(-1).meta.at, /^\d{4}-/);
});

test('private pages, resume links, privacy controls and frames do not create timelines', () => {
  for (const path of ['/upload.html?order_id=secret', '/thank-you.html', '/premium-complete.html', '/documents/create/ds-3053.html',
    '/book.html?email=secret@example.test', '/book.html#access=secret', '/premium.html?token=secret']) {
    const b = browser(path); assert.equal(b.api, undefined, path); assert.equal(b.events.length, 0); assert.equal(b.tags.length, 0);
  }
  for (const opts of [{ gpc: true }, { dnt: true }, { iframe: true }, { origin: 'https://other.example' },
    { referrer: 'https://safenotarize.com/upload.html?order_id=secret' }]) assert.equal(browser('/book.html', opts).api, undefined);
});

test('arbitrary data, raw errors and input contents never enter events or the stored queue', () => {
  const b = browser('/book.html');
  b.api.record('notarization_booking_step', { booking_route: 'standard', booking_step: 'session_details', email: 'secret@example.test', text: 'private document' });
  b.api.record('notarization_issue', { error_type: 'secret@example.test' });
  b.api.record('visitor_feedback', { reason: 'private document' });
  b.api.record('secret@example.test', { error_type: 'submission_failed' });
  b.emit('error', { message: 'secret@example.test', error: Error('private document') });
  assert.doesNotMatch(JSON.stringify([b.events, b.attributes, [...b.storage.values()]]), /secret|private document/);
  assert.ok(b.events.some(e => e.meta.category === 'browser_script_error'));
});

test('technical observations are separated from an explicitly reported reason', () => {
  const b = browser();
  b.api.failure('intake_request_failed', 'standard');
  b.api.record('visitor_feedback', { reason: 'another_time' });
  assert.equal(b.events.find(e => e.meta.category).meta.evidence, 'technical-observation');
  assert.equal(b.events.find(e => e.meta.reason).meta.evidence, 'visitor-reported');
});

test('background and resume record observed activity without inventing abandonment', () => {
  const b = browser();
  b.document.visibilityState = 'hidden'; b.emit('visibilitychange'); b.emit('pagehide');
  b.document.visibilityState = 'visible'; b.emit('visibilitychange');
  assert.equal(b.events.filter(e => e.name === 'sn-page-hidden').length, 1);
  assert.equal(b.events.filter(e => e.name === 'sn-page-resumed').length, 1);
  assert.equal(b.events.some(e => e.meta.reason), false);
  assert.doesNotMatch(JSON.stringify(b.events), /abandoned|visitor-left/);
});

test('delayed widget loading preserves pending events across navigation and chains an existing callback', () => {
  let called = 0;
  const first = browser('/start.html', { ready: false });
  const widget = first.tags.find(tag => tag.src?.startsWith('https://embed.tawk.to/'));
  assert.equal(widget.referrerPolicy, 'strict-origin-when-cross-origin');
  first.api.record('notarization_cta_click', { cta_target: 'premium_booking' });
  assert.equal(first.events.length, 0);
  const next = browser('/premium.html', { storage: first.storage, ready: false, existingWidget: true, previousLoad: () => called++ });
  next.load();
  assert.equal(called, 1);
  assert.equal(next.events.length, 3);
  assert.equal(new Set(next.events.map(x => x.meta['event-id'])).size, 3);
});

test('a tampered persisted queue cannot transmit arbitrary metadata', () => {
  const b = browser('/start.html', { ready: false });
  const stored = JSON.parse(b.storage.get('sn_visitor_journey_v1'));
  stored.pending[0].meta.email = 'secret@example.test';
  b.storage.set('sn_visitor_journey_v1', JSON.stringify(stored));
  const next = browser('/book.html', { storage: b.storage });
  assert.equal(next.events.length, 1);
  assert.doesNotMatch(JSON.stringify(next.events), /secret/);
});

test('optional feedback never assumes a reason and confirms receipt only after acknowledgement', () => {
  const b = browser();
  const dialog = b.find('dialog'), select = b.find('select');
  const actions = dialog.children.at(-1), send = actions.children.at(-1);
  assert.equal(select.value, ''); assert.equal(send.disabled, true);
  send.emit('click'); assert.equal(b.events.some(e => e.meta.reason), false);
  select.value = 'price'; select.emit('change'); assert.equal(send.disabled, false);
  send.emit('click');
  assert.equal(b.events.at(-1).meta.reason, 'price');
  assert.equal(dialog.children.at(-2).textContent, 'Thank you. Your feedback was received.');
  const failed = browser('/book.html', { apiError: 'SESSION_EXPIRED' });
  const failedDialog = failed.find('dialog'), failedSelect = failed.find('select');
  failedSelect.value = 'technical_problem'; failedSelect.emit('change'); failedDialog.children.at(-1).children.at(-1).emit('click');
  assert.match(failedDialog.children.at(-2).textContent, /could not be sent/);
});

test('storage failures and duplicate initialization do not interrupt the page', () => {
  const b = browser('/book.html', { blockStorage: true });
  assert.equal(b.events.length, 1);
  b.reload(); assert.equal(b.events.length, 1);
  b.api.failure('validation_failed'); b.api.failure('validation_failed');
  assert.equal(b.events.filter(e => e.meta.category === 'validation_failed').length, 1);
});

test('Haitian booking pages receive translated optional feedback', () => {
  const b = browser('/book-ht.html', { lang: 'ht' });
  assert.equal(b.find('dialog').children[0].textContent, 'Ki sa ki anpeche w kontinye?');
});
