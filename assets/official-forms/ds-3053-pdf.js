// Coordinates are in points from the top of page 2 of the State Department's
// DS-3053 revision 10-2024. The published PDF has no fillable fields.
// Source: https://eforms.state.gov/Forms/ds3053.pdf
// Blank source SHA-256: 207b4f4376ea095d4eb141b1ae61fb1c0d555acaea231f089ed68f357e80b75e
const lines = {
  childName: [22, 143, 382],
  birthdate: [422, 143, 165],
  adultName: [22, 201, 296],
  parent1Name: [58, 272, 236],
  parent2Name: [329, 272, 253],
  passport: [248, 320, 334],
  parent1Street: [94, 374, 201],
  parent1Locality: [157, 388, 141],
  parent1Phone: [56, 401, 242],
  parent1Email: [51, 415, 246],
  parent2Street: [382, 375, 203],
  parent2Locality: [448, 388, 137],
  parent2Phone: [348, 402, 237],
  parent2Email: [341, 415, 244]
};

const relationshipBoxes = { parent: [333, 195], guardian: [421, 195], 'third-party': [522, 195] };
const passportRestrictions = { book: 'Issue passport book only', card: 'Issue passport card only' };

export function passportDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${month}-${day}-${year}`;
}

export async function buildConsentPdf(source, values, pdfLib) {
  const { PDFDocument, PDFName, StandardFonts, rgb } = pdfLib;
  const pdf = await PDFDocument.load(source, { updateMetadata: false });
  const page = pdf.getPage(1);
  if (pdf.getPageCount() !== 2 || page.getWidth() !== 612 || page.getHeight() !== 792) {
    throw new Error('Unexpected DS-3053 template');
  }
  pdf.catalog.delete(PDFName.of('AcroForm'));

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const black = rgb(0, 0, 0);
  const y = top => page.getHeight() - top;

  function drawField(field, text) {
    if (!text) return;
    const [x, top, width] = lines[field];
    let size;
    try {
      size = Math.min(10, width / font.widthOfTextAtSize(text, 1));
    } catch {
      throw Object.assign(new Error('Unsupported character'), { field, reason: 'characters' });
    }
    if (size < 8) throw Object.assign(new Error('Field too long'), { field, reason: 'length' });
    page.drawText(text, { x, y: y(top), size, font, color: black });
  }

  function checkBox([x, top]) {
    const points = [
      { x, y: y(top + 2) },
      { x: x + 2.5, y: y(top + 4.5) },
      { x: x + 6, y: y(top - 0.5) }
    ];
    page.drawLine({ start: points[0], end: points[1], thickness: 1.15, color: black });
    page.drawLine({ start: points[1], end: points[2], thickness: 1.15, color: black });
  }

  drawField('childName', values.childName);
  drawField('birthdate', passportDate(values.birthdate));
  if (values.olderTeen) {
    checkBox([424, 118]);
  } else {
    drawField('adultName', values.adultName);
    checkBox(relationshipBoxes[values.relationship]);
  }
  drawField('parent1Name', values.parent1Name);
  drawField('passport', passportRestrictions[values.passport]);
  for (const field of ['Street', 'Locality', 'Phone', 'Email']) {
    drawField(`parent1${field}`, values[`parent1${field}`]);
  }
  if (values.parent2Name) {
    drawField('parent2Name', values.parent2Name);
    if (values.sameContact) {
      checkBox([314, 354]);
    } else {
      for (const field of ['Street', 'Locality', 'Phone', 'Email']) {
        drawField(`parent2${field}`, values[`parent2${field}`]);
      }
    }
  }

  // Leave the oath, signatures, ID details and notary area in section 4 blank.
  return pdf.save({ addDefaultPage: false, updateFieldAppearances: false });
}
