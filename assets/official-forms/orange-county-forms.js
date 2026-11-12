// Positions are x, baseline from the top of the page, and available width in points.
// Keep the county's original instructions, signature lines, and notary certificates intact.
function field(id, label, slot, options = {}) {
  return { id, label, slot, ...options };
}

const domicile = {
  title: ['Declaration of Domicile', 'Deklarasyon Domisil'],
  intro: [
    'Declare your permanent home in Orange County, Florida. You’ll review your entries before continuing to a notary.',
    'Deklare kote ou rete nèt nan Konte Orange, Florida. Verifye enfòmasyon ou yo anvan w kontinye ak yon notè.'
  ],
  filename: 'Orange-County-Declaration-of-Domicile.pdf',
  template: 'orange-county-declaration-of-domicile-2020.pdf',
  source: 'https://www.occompt.com/DocumentCenter/View/147/Declaration-Of-Domicile-Florida-PDF',
  recording: 'https://www.occompt.com/161/Official-Records',
  groups: [
    {
      title: ['Your name and permanent home', 'Non w ak adrès kote w rete nèt'],
      fields: [
        field('signerName', ['Full name', 'Non konplè'], [38, 516, 247], { required: true, wide: true }),
        field('currentStreet', ['Street address', 'Adrès ri a'], [38, 245, 211], { required: true }),
        field('currentLocality', ['City and ZIP code', 'Vil ak kòd postal'], [253, 245, 213], { required: true })
      ]
    },
    {
      title: ['Previous and other residences', 'Adrès anvan ak lòt kote w rete'],
      fields: [
        field('formerStreet', ['Previous street address', 'Adrès ri anvan an'], [38, 368, 211]),
        field('formerLocality', ['Previous city, county, state and ZIP code', 'Vil, konte, eta ak kòd postal anvan an'], [253, 368, 284]),
        field('otherResidence', ['Other residences, if any', 'Lòt kote w rete, si genyen'], [38, 442, 499], {
          wide: true,
          hint: [
            'Include the street address, city, county and state for each other residence.',
            'Mete adrès ri, vil, konte ak eta pou chak lòt kote w rete.'
          ]
        })
      ]
    }
  ]
};

const commencement = {
  title: ['Notice of Commencement', 'Avi Kòmansman Travay'],
  intro: [
    'Complete the official notice for a construction project in Orange County, Florida. You’ll review your entries before continuing to a notary.',
    'Ranpli avi ofisyèl la pou yon pwojè konstriksyon nan Konte Orange, Florida. Verifye enfòmasyon ou yo anvan w kontinye ak yon notè.'
  ],
  filename: 'Orange-County-Notice-of-Commencement.pdf',
  template: 'orange-county-notice-of-commencement-2023.pdf',
  source: 'https://www.occompt.com/DocumentCenter/View/144/Notice-of-Commencement-Form---October-23-2023-PDF',
  recording: 'https://www.occompt.com/415/E-File-NOC',
  groups: [
    {
      title: ['Permit and recording details', 'Detay pèmi ak anrejistreman'],
      fields: [
        field('permit', ['Permit number, if available', 'Nimewo pèmi, si li disponib'], [128, 27, 202]),
        field('parcel', ['Folio or parcel ID, if available', 'Nimewo pasèl, si li disponib'], [135, 39, 196]),
        field('preparedBy', ['Prepared by', 'Non moun ki prepare fòm nan'], [116, 50, 212], { required: true, wide: true }),
        field('preparedStreet', ['Preparer’s street address', 'Adrès ri moun ki prepare fòm nan'], [56, 62, 272]),
        field('preparedLocality', ['Preparer’s city, state and ZIP code', 'Vil, eta ak kòd postal moun ki prepare fòm nan'], [56, 73, 272]),
        field('returnTo', ['Return to', 'Non moun pou voye fòm nan tounen bay'], [102, 85, 229], { required: true, wide: true }),
        field('returnStreet', ['Return street address', 'Adrès ri pou voye l tounen'], [56, 96, 272], { required: true }),
        field('returnLocality', ['Return city, state and ZIP code', 'Vil, eta ak kòd postal pou voye l tounen'], [56, 108, 272], { required: true })
      ]
    },
    {
      title: ['Property and project', 'Pwopriyete ak pwojè'],
      fields: [
        field('property', ['Legal description and street address', 'Deskripsyon legal ak adrès ri'], [70, 193, 475], {
          required: true, wide: true, multiline: true,
          hint: [
            'Copy the legal description and include the street address. If there is no street address, describe the property’s physical location.',
            'Kopye deskripsyon legal la epi mete adrès ri a. Si pa gen adrès ri, dekri kote pwopriyete a ye.'
          ]
        }),
        field('improvement', ['General description of the work', 'Deskripsyon jeneral travay la'], [70, 216, 475], { required: true, wide: true })
      ]
    },
    {
      title: ['Owner or lessee', 'Pwopriyetè oswa lokatè'],
      fields: [
        field('owner', ['Owner or lessee name', 'Non pwopriyetè oswa lokatè a'], [96, 239, 448], { required: true, wide: true }),
        field('ownerAddress', ['Full mailing address', 'Adrès postal konplè'], [106, 251, 437], { required: true, wide: true }),
        field('interest', ['Interest in the property', 'Dwa sou pwopriyete a'], [153, 262, 391], { required: true }),
        field('signerTitle', ['Signer’s title or role', 'Tit oswa wòl siyatè a'], [432, 594, 123], { required: true })
      ]
    },
    {
      title: ['Contractor', 'Kontraktè'],
      fields: [
        field('contractor', ['Contractor name', 'Non kontraktè a'], [96, 320, 265], { required: true }),
        field('contractorPhone', ['Phone', 'Telefòn'], [451, 320, 94], { type: 'tel' }),
        field('contractorAddress', ['Full mailing address', 'Adrès postal konplè'], [106, 331, 438], { required: true, wide: true })
      ]
    }
  ],
  optionalGroups: [
    {
      title: ['Fee simple titleholder, if different', 'Moun ki gen tit pwopriyete a, si se yon lòt moun'],
      fields: [
        field('titleholder', ['Name', 'Non'], [96, 285, 447]),
        field('titleholderAddress', ['Full mailing address', 'Adrès postal konplè'], [106, 297, 437])
      ]
    },
    {
      title: ['Surety and payment bond', 'Konpayi garanti ak garanti peman'],
      fields: [
        field('surety', ['Surety name', 'Non konpayi garanti a'], [96, 354, 265]),
        field('suretyPhone', ['Phone', 'Telefòn'], [451, 354, 94], { type: 'tel' }),
        field('suretyAddress', ['Full mailing address', 'Adrès postal konplè'], [106, 366, 254]),
        field('bondAmount', ['Bond amount in dollars', 'Montan garanti a an dola'], [446, 366, 99], { inputMode: 'decimal' })
      ]
    },
    {
      title: ['Lender', 'Prêtè'],
      fields: [
        field('lender', ['Name', 'Non'], [96, 389, 265]),
        field('lenderPhone', ['Phone', 'Telefòn'], [452, 389, 94], { type: 'tel' }),
        field('lenderAddress', ['Full mailing address', 'Adrès postal konplè'], [106, 401, 439], { wide: true })
      ]
    },
    {
      title: ['Florida contact for service of notices', 'Kontak nan Florida pou resevwa avi'],
      fields: [
        field('noticeContact', ['Name', 'Non'], [96, 435, 265]),
        field('noticePhone', ['Phone', 'Telefòn'], [452, 435, 94], { type: 'tel' }),
        field('noticeAddress', ['Full mailing address', 'Adrès postal konplè'], [106, 447, 438], { wide: true })
      ]
    },
    {
      title: ['Additional recipient of lienor’s notice', 'Lòt moun k ap resevwa kopi avi sou dwa privilèj la'],
      fields: [
        field('lienorContact', ['Name', 'Non'], [96, 481, 265]),
        field('lienorPhone', ['Phone', 'Telefòn'], [452, 481, 94], { type: 'tel' }),
        field('lienorAddress', ['Full mailing address', 'Adrès postal konplè'], [106, 493, 438], { wide: true })
      ]
    },
    {
      title: ['Expiration date', 'Dat ekspirasyon'],
      fields: [
        field('expires', ['Custom expiration date', 'Lòt dat ekspirasyon'], [246, 516, 164], {
          type: 'date',
          hint: [
            'The county form states that the notice expires one year after recording unless another date is specified.',
            'Fòm konte a di avi a ekspire yon ane apre anrejistreman an si ou pa mete yon lòt dat.'
          ]
        })
      ]
    }
  ]
};

const termination = {
  title: ['Notice of Termination', 'Avi pou Mete Fen'],
  intro: [
    'Prepare the Orange County, Florida form to end a recorded Notice of Commencement.',
    'Prepare fòm Konte Orange, Florida, pou mete fen nan yon Avi Kòmansman Travay ki te anrejistre.'
  ],
  filename: 'Orange-County-Notice-of-Termination.pdf',
  template: 'orange-county-notice-of-termination-2020.pdf',
  source: 'https://www.occompt.com/DocumentCenter/View/154/Notice-of-Termination-of-Notice-of-Commencement-PDF',
  recording: 'https://www.occompt.com/415/E-File-NOC',
  groups: [
    {
      title: ['Recorded Notice of Commencement', 'Avi Kòmansman Travay ki te anrejistre'],
      fields: [
        field('recordedDate', ['Recording date', 'Dat anrejistreman'], [235, 238, 118], {
          type: 'date', yearSlot: [363, 238, 30], required: true,
          hint: ['Use the date stamped on the recorded notice.', 'Sèvi ak dat ki make sou avi ki te anrejistre a.']
        }),
        field('instrumentNumber', ['Official records instrument number', 'Nimewo dokiman nan rejis ofisyèl la'], [365, 251, 128], { required: true })
      ]
    },
    {
      title: ['Property and termination date', 'Pwopriyete ak dat avi a ap fini'],
      fields: [
        field('propertyDescription', ['Legal description for a partial termination', 'Deskripsyon legal si avi a fini pou yon pati sèlman'], [92, 357, 438], {
          wide: true, multiline: true,
          hint: [
            'Leave this blank if the termination applies to all property covered by the recorded notice.',
            'Kite espas sa a vid si avi a ap fini pou tout pwopriyete ki nan avi anrejistre a.'
          ]
        }),
        field('propertyStreet', ['Property street address, if available', 'Adrès ri pwopriyete a, si li disponib'], [230, 371, 300], { wide: true }),
        field('effectiveDate', ['Termination date, if specified', 'Dat avi a ap fini, si ou mete youn'], [342, 430, 86], {
          type: 'date', yearSlot: [440, 430, 26], wide: true,
          hint: [
            'Leave blank to use the county form’s 30-day default. A date you enter must be at least 30 days after the termination is recorded.',
            'Kite li vid pou sèvi ak 30 jou ki sou fòm konte a. Si ou mete yon dat, li dwe omwen 30 jou apre anrejistreman avi fen an.'
          ]
        })
      ]
    },
    {
      title: ['Property owner', 'Pwopriyetè'],
      fields: [
        field('ownerName', ['Owner’s full name', 'Non konplè pwopriyetè a'], [74, 561, 283], { required: true }),
        field('ownerMailingAddress', ['Owner’s full mailing address', 'Adrès postal konplè pwopriyetè a'], [74, 587, 283], { required: true })
      ]
    },
    {
      title: ['Preparer and return address', 'Moun ki prepare fòm nan ak adrès pou voye l tounen'],
      fields: [
        field('preparedBy', ['Prepared by', 'Non moun ki prepare fòm nan'], [74, 74, 250], { required: true, wide: true }),
        field('preparedStreet', ['Preparer’s street address', 'Adrès ri moun ki prepare fòm nan'], [74, 86, 250]),
        field('preparedLocality', ['Preparer’s city, state and ZIP code', 'Vil, eta ak kòd postal moun ki prepare fòm nan'], [74, 98, 250]),
        field('returnTo', ['Return to', 'Non moun pou voye fòm nan tounen bay'], [74, 132, 250], { required: true, wide: true }),
        field('returnStreet', ['Return street address', 'Adrès ri pou voye l tounen'], [74, 144, 250], { required: true }),
        field('returnLocality', ['Return city, state and ZIP code', 'Vil, eta ak kòd postal pou voye l tounen'], [74, 156, 250], { required: true })
      ]
    }
  ]
};

const forms = new Map([
  ['declaration-of-domicile', domicile],
  ['notice-of-commencement', commencement],
  ['notice-of-termination', termination]
]);

export function countyForm(type) {
  return forms.get(type);
}

export function countyDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

export async function buildCountyPdf(source, definition, values, pdfLib) {
  const { PDFDocument, PDFName, StandardFonts, rgb } = pdfLib;
  const pdf = await PDFDocument.load(source, { updateMetadata: false });
  if (pdf.getPageCount() !== 1) throw new Error('Unexpected county template');
  const page = pdf.getPage(0);
  if (page.getWidth() !== 612 || page.getHeight() !== 792) throw new Error('Unexpected county page size');

  // This session copy uses the original printed lines with fixed text. Remove
  // the blank form widgets so signing providers receive the same PDF customers review.
  page.node.delete(PDFName.of('Annots'));
  pdf.catalog.delete(PDFName.of('AcroForm'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const black = rgb(0, 0, 0);

  function drawField(id, [x, top, width], value) {
    let size;
    try {
      size = Math.min(9.5, width / font.widthOfTextAtSize(value, 1));
    } catch {
      throw Object.assign(new Error('Unsupported PDF character'), { field: id, reason: 'characters' });
    }
    if (size < 8) throw Object.assign(new Error('County PDF field is too long'), { field: id, reason: 'length' });
    page.drawText(value, { x, y: page.getHeight() - top, size, font, color: black });
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  for (const group of [...definition.groups, ...(definition.optionalGroups ?? [])]) {
    for (const { id, slot, yearSlot } of group.fields) {
      const value = values[id];
      if (!value) continue;
      if (yearSlot) {
        const [month, day, year] = value.split('/');
        drawField(id, slot, `${monthNames[Number(month) - 1]} ${Number(day)}`);
        drawField(id, yearSlot, year);
      } else {
        drawField(id, slot, value);
      }
    }
  }

  return pdf.save({ addDefaultPage: false, updateFieldAppearances: false });
}
