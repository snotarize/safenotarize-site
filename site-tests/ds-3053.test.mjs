import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import pdfLib from '../assets/official-forms/vendor/pdf-lib-1.17.1.min.js';
import { buildConsentPdf } from '../assets/official-forms/ds-3053-pdf.js';

const { PDFDocument, PDFArray, PDFName, PDFRawStream, decodePDFRawStream, StandardFonts } = pdfLib;
const source = await readFile(new URL('../assets/official-forms/ds-3053-10-2024.pdf', import.meta.url));
const blank = await PDFDocument.load(source);
const fixture = {
  childName: 'TEST, JULES ÉMILE', birthdate: '2019-04-06', olderTeen: false,
  adultName: 'TEST, AVERY', relationship: 'guardian', passport: 'card',
  parent1Name: 'Jamie Test', parent1Street: '12 Example Street',
  parent1Locality: 'Orlando, FL 32801', parent1Phone: '+1 407 555 0100',
  parent1Email: 'jamie@example.test',
  parent2Name: 'Riley Test', parent2Street: '25 Example Lane',
  parent2Locality: 'Tampa, FL 33602', parent2Phone: '+1 813 555 0100',
  parent2Email: 'riley@example.test'
};

function pageContents(page) {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray
    ? contents.asArray().map(ref => page.doc.context.lookup(ref, PDFRawStream)) : [contents];
  return streams.map(stream => Buffer.from(stream.getContents()).toString('base64'));
}

async function fill(values) {
  const bytes = await buildConsentPdf(source, values, pdfLib);
  assert.ok(bytes.length < 5_000_000);
  const document = await PDFDocument.load(bytes);
  const streams = document.getPage(1).node.Contents();
  assert.ok(streams instanceof PDFArray);
  const overlay = streams.lookup(streams.size() - 1, PDFRawStream);
  const drawing = Buffer.from(decodePDFRawStream(overlay).decode()).toString('ascii');
  const font = await document.embedFont(StandardFonts.Helvetica);
  const includes = text => drawing.includes(font.encodeText(text).toString());
  return { document, drawing, includes };
}

test('DS-3053 fills sections 1–3 on the official two-page PDF and leaves section 4 blank', async () => {
  const { document, drawing, includes } = await fill(fixture);
  assert.equal(document.getPageCount(), 2);
  assert.equal(document.catalog.has(PDFName.of('AcroForm')), false);
  assert.deepEqual(pageContents(document.getPage(0)), pageContents(blank.getPage(0)));
  for (const value of [fixture.childName, '04-06-2019', fixture.adultName, 'Issue passport card only',
    ...Object.entries(fixture).filter(([field]) => field.startsWith('parent')).map(([, value]) => value)]) {
    assert.ok(includes(value), `Missing PDF value ${value}`);
  }
  const baselines = [...drawing.matchAll(/1 0 0 1 \d+(?:\.\d+)? (\d+(?:\.\d+)?) Tm/g)];
  assert.equal(baselines.length, 14);
  assert.ok(baselines.every(match => Number(match[1]) > 792 - 420));
  assert.match(drawing, /421 595 m/);
});

test('DS-3053 supports a 16- or 17-year-old and a second signer sharing contact details', async () => {
  const { drawing, includes } = await fill({ ...fixture, olderTeen: true, sameContact: true, passport: 'both' });
  assert.equal(includes(fixture.adultName), false);
  assert.equal(includes(fixture.parent2Name), true);
  assert.equal(includes(fixture.parent2Email), false);
  assert.equal(includes('Issue passport card only'), false);
  assert.match(drawing, /424 672 m/);
  assert.match(drawing, /314 436 m/);
});

test('DS-3053 flags text that cannot fit or render instead of losing characters', async () => {
  await assert.rejects(() => buildConsentPdf(source, { ...fixture, childName: 'TEST 🐈' }, pdfLib),
    { field: 'childName', reason: 'characters' });
  await assert.rejects(() => buildConsentPdf(source, { ...fixture, parent1Locality: 'W'.repeat(100) }, pdfLib),
    { field: 'parent1Locality', reason: 'length' });
});
