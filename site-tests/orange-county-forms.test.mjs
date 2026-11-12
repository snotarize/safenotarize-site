import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import pdfLib from '../assets/official-forms/vendor/pdf-lib-1.17.1.min.js';
import { buildCountyPdf, countyDate, countyForm } from '../assets/official-forms/orange-county-forms.js';

const { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } = pdfLib;
const revisions = [
  ['declaration-of-domicile', '115122d28442d2df559825469e4a8fe20cf187466748897dd8a4b86d9bd7e4ad', 6, 516],
  ['notice-of-commencement', '4f260bcd99ab466c469d1b9c858854c943e1ce5e0f155ab924c7069d27a24051', 33, 594]
];

function pageContents(page) {
  const contents = page.node.Contents();
  return contents instanceof PDFArray
    ? contents.asArray().map(ref => page.doc.context.lookup(ref, PDFRawStream)) : [contents];
}

async function readTemplate(definition) {
  return readFile(new URL(`../assets/official-forms/${definition.template}`, import.meta.url));
}

for (const [type, hash, fieldCount, lastBaseline] of revisions) {
  test(`${type} preserves the official page and places only the customer fields`, async () => {
    const definition = countyForm(type);
    const source = await readTemplate(definition);
    assert.equal(createHash('sha256').update(source).digest('hex'), hash);
    const groups = [...definition.groups, ...(definition.optionalGroups ?? [])];
    const values = Object.fromEntries(groups.flatMap(group => group.fields.map(({ id }) => [id, `TÉST ${id}`])));
    assert.equal(Object.keys(values).length, fieldCount);

    const bytes = await buildCountyPdf(source, definition, values, pdfLib);
    assert.ok(bytes.length < 5_000_000);
    const blank = await PDFDocument.load(source);
    const filled = await PDFDocument.load(bytes);
    assert.equal(filled.getPageCount(), 1);
    assert.equal(filled.catalog.has(PDFName.of('AcroForm')), false);
    assert.equal(filled.getPage(0).node.Annots()?.size() ?? 0, 0);
    const original = pageContents(blank.getPage(0));
    const filledStreams = pageContents(filled.getPage(0));
    assert.ok(filledStreams.length > original.length);
    assert.ok(filledStreams.some((_, start) => original.every((stream, offset) =>
      Buffer.from(stream.getContents()).equals(Buffer.from(filledStreams[start + offset]?.getContents() ?? [])))));

    const overlay = Buffer.from(decodePDFRawStream(filledStreams.at(-1)).decode()).toString('ascii');
    const font = await filled.embedFont(StandardFonts.Helvetica);
    for (const value of Object.values(values)) assert.ok(overlay.includes(font.encodeText(value).toString()));
    const baselines = [...overlay.matchAll(/1 0 0 1 \d+ (\d+) Tm/g)].map(match => Number(match[1]));
    assert.equal(baselines.length, fieldCount);
    assert.equal(Math.min(...baselines), 792 - lastBaseline);
  });
}

test('county PDF generation identifies overflowing and unsupported entries', async () => {
  const definition = countyForm('notice-of-commencement');
  const source = await readTemplate(definition);
  await assert.rejects(buildCountyPdf(source, definition, { property: 'W'.repeat(150) }, pdfLib),
    { field: 'property', reason: 'length' });
  await assert.rejects(buildCountyPdf(source, definition, { owner: 'Test 山' }, pdfLib),
    { field: 'owner', reason: 'characters' });
});

test('county editor recognizes the two county forms and formats an optional date', () => {
  assert.equal(countyForm('constructor'), undefined);
  assert.equal(countyDate('2027-04-08'), '04/08/2027');
});
