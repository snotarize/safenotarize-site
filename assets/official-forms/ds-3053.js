import { documentBookingUrl, selectedService } from '../document-service-links.js?v=2';
import { buildConsentPdf, passportDate } from './ds-3053-pdf.js';

const language = new URLSearchParams(location.search).get('lang') === 'ht' ? 'ht' : 'en';
const ht = language === 'ht';
const text = (english, creole) => ht ? creole : english;
const byId = id => document.getElementById(id);
const filename = 'DS-3053.pdf';
const documentType = 'ds-3053';

document.documentElement.lang = language;
if (ht) {
  document.title = 'Ranpli Fòm DS-3053 | SafeNotarize';
  for (const node of document.querySelectorAll('[data-ht]')) node.textContent = node.dataset.ht;
  byId('home-link').href = '/ht.html';
  byId('second-contact').setAttribute('aria-label', 'Adrès, telefòn ak imèl dezyèm paran oswa gadyen an');
}

const serviceQuery = selectedService ? `?service=${selectedService}` : '';
byId('library-link').href = `/documents/library${ht ? '-ht' : ''}.html${serviceQuery}`;
byId('guide-link').href = `/documents/${ht ? 'ht/' : ''}official/ds-3053.html${serviceQuery}`;
byId('upload-link').href = documentBookingUrl({ language, documentType });

const form = byId('consent-form');
const date = byId('birthdate');
const review = byId('review');
const download = byId('pdf-copy');
const formStatus = byId('form-status');
const handoffStatus = byId('handoff-status');
const next = byId('continue-button');
const edit = byId('edit-button');
const reviewButton = byId('review-button');
const manualUpload = byId('manual-upload');
const handoff = window.SafeNotarizeDocumentHandoff;
const templateUrl = new URL('./ds-3053-10-2024.pdf', import.meta.url);
const today = new Date();
date.max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
let template;
let pdf;

function ageInYears() {
  if (!date.value) return null;
  const [year, month, day] = date.value.split('-').map(Number);
  const beforeBirthday = today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day);
  return today.getFullYear() - year - Number(beforeBirthday);
}

function updateSections() {
  const age = ageInYears();
  const teen = age === 16 || age === 17;
  byId('applying-adult').hidden = byId('applying-adult').disabled = teen;
  byId('teen-note').hidden = !teen;
  date.setCustomValidity(age >= 18
    ? text('Enter a birth date for a child under 18.', 'Antre dat nesans yon timoun ki poko gen 18 an.') : '');

  const second = byId('second-parent').checked;
  const sameContact = byId('same-contact').checked;
  byId('second-details').hidden = byId('second-details').disabled = !second;
  byId('second-contact').hidden = byId('second-contact').disabled = sameContact;
}

function showReview(values) {
  const details = byId('review-details');
  details.replaceChildren();

  function addGroup(title, rows) {
    const group = document.createElement('div');
    const heading = document.createElement('h3');
    const list = document.createElement('dl');
    heading.textContent = title;
    for (const [label, value] of rows) {
      const key = document.createElement('dt');
      const item = document.createElement('dd');
      key.textContent = label;
      item.textContent = value;
      list.append(key, item);
    }
    group.append(heading, list);
    details.append(group);
  }

  const label = field => byId(field).labels[0].textContent;
  const contactRows = parent => ['Street', 'Locality', 'Phone', 'Email'].map(field => {
    const id = `${parent}${field}`;
    return [label(id), values[id]];
  });
  addGroup(text('Child', 'Timoun'), [
    [label('childName'), values.childName], [label('birthdate'), passportDate(values.birthdate)]
  ]);
  if (!values.olderTeen) {
    addGroup(text('Applying adult', 'Granmoun k ap aplike'), [
      [label('adultName'), values.adultName],
      [label('relationship'), byId('relationship').selectedOptions[0].textContent]
    ]);
  }
  addGroup(text('Consent', 'Konsantman'), [
    [label('parent1Name'), values.parent1Name], ...contactRows('parent1'),
    [label('passport'), byId('passport').selectedOptions[0].textContent]
  ]);
  if (values.parent2Name) {
    const rows = values.sameContact
      ? [[text('Contact details', 'Enfòmasyon kontak'), text('Same as the first parent or guardian', 'Menm jan ak premye paran oswa gadyen an')]]
      : contactRows('parent2');
    addGroup(text('Second parent or guardian', 'Dezyèm paran oswa gadyen'), [
      [label('parent2Name'), values.parent2Name], ...rows
    ]);
  }

  byId('two-signer-note').hidden = !values.parent2Name;
  download.href = URL.createObjectURL(pdf);
  form.hidden = true;
  review.hidden = false;
  next.hidden = !handoff?.enabled();
  manualUpload.hidden = !next.hidden;
  handoffStatus.textContent = next.hidden
    ? text('Download your PDF to continue.', 'Telechaje PDF ou a pou w kontinye.') : '';
  byId('review-title').focus();
}

async function loadTemplate() {
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error('Template unavailable');
  return response.arrayBuffer();
}

form.addEventListener('input', event => {
  event.target.setCustomValidity?.('');
  formStatus.textContent = '';
  updateSections();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (reviewButton.disabled) return;
  updateSections();
  if (!form.reportValidity()) return;
  const values = {
    olderTeen: byId('applying-adult').disabled,
    sameContact: byId('same-contact').checked
  };
  for (const field of form.querySelectorAll('input:not([type="checkbox"]):enabled, select:enabled')) {
    values[field.id] = field.value.trim().normalize('NFC');
    if (field.required && !values[field.id]) {
      field.setCustomValidity(text('Complete this field.', 'Ranpli espas sa a.'));
      field.reportValidity();
      return;
    }
  }

  const editable = [...form.querySelectorAll('input:enabled, select:enabled')];
  for (const field of editable) field.disabled = true;
  reviewButton.disabled = true;
  formStatus.textContent = text('Preparing your PDF…', 'N ap prepare PDF ou a…');
  let failure;
  try {
    const [bytes] = await Promise.all([
      template || loadTemplate(), import('./vendor/pdf-lib-1.17.1.min.js')
    ]);
    template = bytes;
    pdf = new Blob([await buildConsentPdf(bytes, values, window.PDFLib)], { type: 'application/pdf' });
    formStatus.textContent = '';
    showReview(values);
  } catch (error) {
    failure = error;
  } finally {
    for (const field of editable) field.disabled = false;
    reviewButton.disabled = false;
  }
  if (failure) {
    const field = failure.field && byId(failure.field);
    if (field) {
      const message = failure.reason === 'characters'
        ? text('This spelling includes a character the PDF cannot display. Check how the information appears on the passport application.', 'Gen yon karaktè PDF la pa ka montre. Verifye kijan enfòmasyon an ekri sou aplikasyon paspò a.')
        : text('This entry is too long for the official PDF field.', 'Sa ou antre a twò long pou espas ki sou fòm ofisyèl la.');
      formStatus.textContent = '';
      field.setCustomValidity(message);
      field.reportValidity();
    } else {
      formStatus.textContent = text('We couldn’t prepare the PDF. Please try again.', 'Nou pa t kapab prepare PDF la. Tanpri eseye ankò.');
    }
  }
});

edit.addEventListener('click', () => {
  URL.revokeObjectURL(download.href);
  download.removeAttribute('href');
  pdf = null;
  review.hidden = true;
  form.hidden = false;
  byId('childName').focus();
});

next.addEventListener('click', async () => {
  if (next.disabled || !pdf) return;
  window.SafeNotarizeFormAnalytics?.continueBooking(documentType, true);
  next.disabled = edit.disabled = true;
  handoffStatus.textContent = text('Sending your PDF securely…', 'N ap voye PDF ou a an sekirite…');
  try {
    await handoff.stage(pdf, filename, documentType);
    if (!handoff.canBook({ document_source: 'library', document_type: documentType })) {
      throw new Error('Missing saved PDF');
    }
    location.assign(documentBookingUrl({ language, documentType, saved: true }));
  } catch {
    handoffStatus.textContent = text('We couldn’t send your PDF. Try again or download it to continue.', 'Nou pa t kapab voye PDF la. Eseye ankò oswa telechaje l pou w kontinye.');
    manualUpload.hidden = false;
  } finally {
    next.disabled = edit.disabled = false;
  }
});

window.addEventListener('pageshow', event => {
  if (event.persisted) handoffStatus.textContent = '';
});
updateSections();
form.hidden = false;
