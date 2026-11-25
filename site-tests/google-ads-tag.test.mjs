import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ads = read('assets/google-ads-tag.js');
const analytics = read('assets/ga4-tracking.js');

function browser(path, { optedOut = false, dnt = false, framed = false } = {}) {
  const tags = [];
  const window = {};
  window.parent = framed ? {} : window;
  const context = {
    window, location: new URL(path, 'https://safenotarize.com'),
    navigator: { globalPrivacyControl: optedOut, doNotTrack: dnt ? '1' : '0' },
    document: {
      referrer: 'https://www.google.com/search?q=private-search',
      querySelector: selector => tags.find(tag => selector.includes('gtag/js') && tag.src.includes('gtag/js')) ?? null,
      createElement: () => ({}), head: { append: tag => tags.push(tag) }, addEventListener() {}
    },
    URL, URLSearchParams, Date, Promise, setTimeout: fn => setTimeout(fn, 5), clearTimeout
  };
  const runAds = () => runInNewContext(ads, context);
  runAds();
  return { window, tags, runAds, runAnalytics: () => runInNewContext(analytics, context),
    commands: () => Array.from(window.dataLayer ?? [], args => Array.from(args)) };
}

test('new account base tag loads once without issuing a sale or a legacy conversion', () => {
  const page = browser('/start.html?utm_source=google&utm_medium=cpc&utm_campaign=online_notary_fresh&gclid=fixture-click-123');
  page.runAds();
  assert.equal(page.tags.length, 1);
  assert.equal(page.tags[0].src, 'https://www.googletagmanager.com/gtag/js?id=AW-18594593652');
  assert.equal(page.tags[0].referrerPolicy, 'no-referrer');
  const commands = page.commands();
  assert.equal(commands.filter(args => args[0] === 'js').length, 1);
  assert.deepEqual(commands.filter(args => args[0] === 'config').map(args => args[1]), ['AW-18594593652']);
  assert.equal(commands.some(args => args[0] === 'event'), false);
  assert.doesNotMatch(JSON.stringify(commands), /purchase|conversion|transaction_id|value|private-search|AW-18058269024|AW-17220906816/);
});

test('private URLs, documents, receipts and visitor opt-outs never load Ads', () => {
  for (const path of ['/book.html?email=private%40example.test', '/premium.html?access=private-token',
    '/start.html#resume=private-token', '/premium-complete.html', '/thank-you.html', '/thank-you-ht.html',
    '/upload.html', '/documents/create.html', '/documents/create/ds-3053.html',
    'https://preview.example.test/start.html']) {
    const page = browser(path);
    assert.equal(page.tags.length, 0, path);
    assert.deepEqual(page.commands(), [], path);
  }
  for (const options of [{ optedOut: true }, { dnt: true }]) {
    assert.equal(browser('/start.html', options).tags.length, 0);
  }
  // Public pages remain measurable when opened by an embedded tag verifier.
  assert.equal(browser('/start.html', { framed: true }).tags.length, 1);
});

test('both Standard and Premium public booking URLs retain base measurement', () => {
  for (const path of ['/start-ht.html?service=regular', '/book.html?document_ready=1&document_source=own&service=regular',
    '/premium.html?lang=ht&document_source=library&document_type=ds-3053', '/#pricing-block',
    '/?_dbg=1', '/start.html?gtm_debug=x', '/start.html?gtm_debug=1795582800000']) {
    const page = browser(path);
    assert.equal(page.tags.length, 1, path);
    assert.equal(page.commands()[0][1].page_location, 'https://safenotarize.com' + path.split('#')[0]);
    assert.equal(page.commands()[0][1].page_referrer, 'https://www.google.com/');
  }
});

test('website Analytics and booking events keep their own destination and share initialization safely', () => {
  const page = browser('/book.html');
  page.runAnalytics();
  assert.deepEqual(page.tags.map(tag => tag.src), [
    'https://www.googletagmanager.com/gtag/js?id=AW-18594593652'
  ]);
  page.window.SafeNotarizeAnalytics.bookingStarted('standard');
  const commands = page.commands();
  assert.equal(commands.filter(args => args[0] === 'js').length, 1);
  const events = commands.filter(args => args[0] === 'event');
  assert.ok(events.some(args => args[1] === 'begin_checkout'));
  assert.ok(events.every(args => args[2].send_to === 'G-EJKPHSTSNH'));
  assert.ok(events.every(args => !['purchase', 'conversion', 'close_convert_lead'].includes(args[1])));
});

test('private-query exclusions for Ads do not interrupt sanitized website Analytics', () => {
  const page = browser('/book.html?email=private%40example.test&access=private-token');
  page.runAnalytics();
  assert.equal(page.tags.length, 1);
  assert.equal(page.tags[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-EJKPHSTSNH');
  assert.doesNotMatch(JSON.stringify(page.commands()), /private|access=/);
  assert.ok(page.window.SafeNotarizeAnalytics);
});

test('all public pages use the new loader and legacy Ads IDs are absent throughout HTML', () => {
  function check(directory = '') {
    for (const file of readdirSync(new URL('../' + directory, import.meta.url), { withFileTypes: true })) {
      if (file.name.startsWith('.')) continue;
      const path = directory + file.name;
      if (file.isDirectory()) { check(path + '/'); continue; }
      if (!path.endsWith('.html')) continue;
      const html = read(path);
      assert.doesNotMatch(html, /AW-(?:18058269024|17220906816)|gtag_report_conversion/, path);
      const count = (html.match(/src="\/assets\/google-ads-tag\.js/g) ?? []).length;
      if (html.includes('/assets/ga4-tracking.js')) {
        assert.equal(count, 1, path);
        assert.ok(html.indexOf('/assets/google-ads-tag.js') < html.indexOf('/assets/ga4-tracking.js'), path);
        assert.match(html, /<head>\s*<script src="\/assets\/google-ads-tag\.js\?v=20261125-explicit"><\/script>/, path);
      } else assert.equal(count, 0, path);
    }
  }
  check();
  const partner = read('partner.html');
  assert.equal((partner.match(/<a class="btn btn-navy" href="\/start\.html">/g) ?? []).length, 2);
});
