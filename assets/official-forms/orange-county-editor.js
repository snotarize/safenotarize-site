import { documentBookingUrl, selectedService } from '../document-service-links.js';
import { buildCountyPdf, countyDate, countyForm } from './orange-county-forms.js?v=2';

const query = new URLSearchParams(location.search);
const ht = query.get('lang') === 'ht';
const language = ht ? 'ht' : 'en';
const text = (english, creole) => ht ? creole : english;
const byId = id => document.getElementById(id);
const documentType = query.get('type');
const definition = countyForm(documentType);

document.documentElement.lang = language;
if (ht) {
  document.title = 'Fòm Ofisyèl Konte Orange | SafeNotarize';
  for (const node of document.querySelectorAll('[data-ht]')) node.textContent = node.dataset.ht;
  byId('home-link').href = '/ht.html';
}
byId('library-link').href = `/documents/library${ht ? '-ht' : ''}.html${selectedService ? `?service=${selectedService}` : ''}`;
if (definition) mountEditor();

function renderGroup(group) {
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = text(...group.title);
  const grid = document.createElement('div');
  grid.className = 'fields';
  for (const field of group.fields) {
    const row = document.createElement('div');
    if (field.wide) row.className = 'wide';
    const label = document.createElement('label');
    label.htmlFor = field.id;
    label.textContent = text(...field.label);
    const input = document.createElement(field.multiline ? 'textarea' : 'input');
    input.id = field.id;
    input.required = field.required === true;
    if (field.type) input.type = field.type;
    if (field.inputMode) input.inputMode = field.inputMode;
    row.append(label, input);
    if (field.hint) {
      const hint = document.createElement('small');
      hint.id = `${field.id}-hint`;
      hint.textContent = text(...field.hint);
      input.setAttribute('aria-describedby', hint.id);
      row.append(hint);
    }
    grid.append(row);
  }
  fieldset.append(legend, grid);
  return fieldset;
}

function mountEditor() {
  const { title, intro, filename, template, source, recording, groups, optionalGroups = [] } = definition;
  const isTermination = documentType === 'notice-of-termination';
  const allGroups = [...groups, ...optionalGroups];
  const form = byId('county-form');
  const review = byId('review');
  const download = byId('pdf-copy');
  const formStatus = byId('form-status');
  const handoffStatus = byId('handoff-status');
  const next = byId('continue-button');
  const edit = byId('edit-button');
  const reviewButton = byId('review-button');
  const manualUpload = byId('manual-upload');
  const completedForm = byId('completed-form-link');
  const handoff = window.SafeNotarizeDocumentHandoff;
  const templateUrl = new URL(template, import.meta.url);
  let sourceBytes;
  let pdf;

  document.title = `${text(...title)} | SafeNotarize`;
  byId('form-title').textContent = text(...title);
  byId('form-intro').textContent = text(...intro);
  byId('termination-rules').hidden = !isTermination;
  byId('official-pdf').href = source;
  byId('recording-link').href = recording;
  byId('county-resources').hidden = false;
  byId('upload-link').href = completedForm.href = documentBookingUrl({ language, documentType });
  completedForm.hidden = !isTermination;
  download.download = filename;
  form.prepend(...groups.map(renderGroup));
  if (optionalGroups.length) {
    const details = document.createElement('details');
    details.className = 'county-optional';
    const summary = document.createElement('summary');
    summary.textContent = text('Additional details, if applicable', 'Lòt detay, si sa aplikab');
    const note = document.createElement('p');
    note.className = 'section-note';
    note.textContent = text(
      'Titleholder, surety, lender, notice recipients or a different expiration date.',
      'Moun ki gen tit la, konpayi garanti, prêtè, moun k ap resevwa avi oswa yon lòt dat ekspirasyon.'
    );
    details.append(summary, note, ...optionalGroups.map(renderGroup));
    form.querySelector('.privacy').before(details);
  }
  const inputs = [...form.querySelectorAll('input, textarea')];

  function showReview(values) {
    const details = byId('review-details');
    details.replaceChildren();
    for (const group of allGroups) {
      const filled = group.fields.filter(field => values[field.id]);
      if (!filled.length) continue;
      const section = document.createElement('div');
      const heading = document.createElement('h3');
      heading.textContent = text(...group.title);
      const list = document.createElement('dl');
      for (const field of filled) {
        const key = document.createElement('dt');
        const value = document.createElement('dd');
        key.textContent = text(...field.label);
        value.textContent = values[field.id];
        list.append(key, value);
      }
      section.append(heading, list);
      details.append(section);
    }
    byId('bond-note').hidden = !(values.surety || values.bondAmount || values.suretyAddress || values.suretyPhone);
    download.href = URL.createObjectURL(pdf);
    form.hidden = true;
    review.hidden = false;
    completedForm.hidden = !isTermination;
    next.hidden = !handoff?.enabled();
    manualUpload.hidden = !next.hidden;
    handoffStatus.textContent = next.hidden
      ? text('Download your PDF to continue.', 'Telechaje PDF ou a pou w kontinye.') : '';
    byId('review-title').focus();
  }

  async function loadTemplate() {
    const response = await fetch(templateUrl);
    if (!response.ok) throw new Error('County template unavailable');
    return response.arrayBuffer();
  }

  form.addEventListener('invalid', event => {
    const details = event.target.closest('details');
    if (details) details.open = true;
  }, true);

  form.addEventListener('input', event => {
    event.target.setCustomValidity?.('');
    formStatus.textContent = '';
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (reviewButton.disabled) return;
    const values = {};
    for (const input of inputs) {
      const value = input.value.trim().replace(/\s+/gu, ' ').normalize('NFC');
      if (input.required && !value) {
        input.setCustomValidity(text('Complete this field.', 'Ranpli espas sa a.'));
        input.reportValidity();
        return;
      }
      values[input.id] = value && input.type === 'date' ? countyDate(value) : value;
    }

    for (const input of inputs) input.disabled = true;
    reviewButton.disabled = true;
    formStatus.textContent = text('Preparing your PDF…', 'N ap prepare PDF ou a…');
    let failure;
    try {
      const [bytes] = await Promise.all([
        sourceBytes || loadTemplate(), import('./vendor/pdf-lib-1.17.1.min.js')
      ]);
      sourceBytes = bytes;
      pdf = new Blob([await buildCountyPdf(bytes, definition, values, window.PDFLib)], { type: 'application/pdf' });
      formStatus.textContent = '';
      showReview(values);
    } catch (error) {
      failure = error;
    } finally {
      for (const input of inputs) input.disabled = false;
      reviewButton.disabled = false;
    }
    if (failure) {
      completedForm.hidden = false;
      const field = failure.field && byId(failure.field);
      if (field) {
        formStatus.textContent = failure.reason === 'characters'
          ? text('This entry uses a character this editor can’t print. Open the county PDF below to prepare the form.', 'Gen yon karaktè PDF sa a pa ka montre. Louvri PDF konte a anba a pou prepare fòm nan.')
          : text('This entry exceeds the space on the county form. Open the county PDF below if you need to keep the full entry.', 'Sa ou antre a depase espas ki sou fòm konte a. Louvri PDF konte a anba a si ou bezwen mete tout enfòmasyon yo.');
        field.setCustomValidity(formStatus.textContent);
        field.reportValidity();
      } else {
        formStatus.textContent = text('We couldn’t prepare the PDF. Try again or open the official PDF below.', 'Nou pa t kapab prepare PDF la. Eseye ankò oswa louvri PDF ofisyèl la anba a.');
      }
    }
  });

  edit.addEventListener('click', () => {
    URL.revokeObjectURL(download.href);
    download.removeAttribute('href');
    pdf = null;
    review.hidden = true;
    form.hidden = false;
    inputs[0].focus();
  });

  next.addEventListener('click', async () => {
    if (next.disabled || !pdf) return;
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
    if (event.persisted && !next.hidden) handoffStatus.textContent = '';
  });
  form.hidden = false;
}
