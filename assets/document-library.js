import { documentBookingUrl, selectedService } from './document-service-links.js?v=2';

const catalog = document.getElementById('document-catalog');
const language = document.documentElement.lang;
const ht = language === 'ht';
const languageLink = document.getElementById('library-language');

function showLinkedSection() {
  const id = location.hash.slice(1);
  languageLink.hash = location.hash;
  if (!id) return;
  const renamed = {
    'guide-start': 'document-guide',
    'guide-family': 'guide-templates',
    'guide-statements': 'guide-templates',
    'guide-business': 'guide-templates'
  };
  const target = document.getElementById(renamed[id] || id);
  if (!target) return;
  if (target === catalog || catalog.contains(target)) catalog.open = true;
  target.scrollIntoView();
}
window.addEventListener('hashchange', showLinkedSection);

const mobileMenu = document.querySelector('.sn-mobile-menu');
document.addEventListener('click', event => {
  if (mobileMenu.open && !mobileMenu.contains(event.target)) mobileMenu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !mobileMenu.open) return;
  mobileMenu.open = false;
  mobileMenu.querySelector('summary').focus();
});

if (selectedService) {
  for (const link of catalog.querySelectorAll('a[href^="/book.html?"], a[href^="/book-ht.html?"]')) {
    const { searchParams } = new URL(link.href);
    if (searchParams.get('document_source') !== 'own') continue;
    link.href = documentBookingUrl({ language, documentSource: 'own', documentType: searchParams.get('document_type') });
  }
}

const search = document.getElementById('document-search');
const clear = document.getElementById('clear-search');
const status = document.getElementById('search-status');
const empty = document.getElementById('no-results');
const panels = document.getElementById('document-panels');
const ownPanel = document.getElementById('notarize-panel');
const formsPanel = document.getElementById('guide-forms');
const templatesPanel = document.getElementById('guide-templates');
const guidesPanel = document.getElementById('search-guides');
const lists = {
  form: document.getElementById('official-form-links'),
  template: document.getElementById('template-links'),
  guide: document.getElementById('guide-links')
};

// Put SafeNotarize's main services first. New catalog templates appear after these.
const priority = [
  'child-travel-consent', 'child-passport-consent', 'affidavit', 'proof-of-residency-affidavit',
  'affidavit-of-support', 'temporary-guardianship-authorization', 'vehicle-release',
  'letter-of-authorization', 'vehicle-bill-of-sale', 'invitation-letter', 'employment-verification-letter',
  'minor-medical-consent', 'business-authorization-letter'
];
const rank = new Map(priority.map((key, index) => [key, index]));
const aliases = {
  'proof-of-residency': 'proof of address residency letter prèv adrès',
  'proof-of-residency-affidavit': 'proof of address residency affidavit prèv adrès',
  'child-travel-consent': 'permission for a child to travel konsantman vwayaj timoun',
  'vehicle-release': 'car release authorization lage machin',
  'letter-of-authorization': 'authorization letter lèt otorizasyon'
};

function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(ds|ps)\s*(\d+)/g, '$1$2').trim();
}

function documentLink(source, title, className) {
  const link = document.createElement('a');
  link.href = source.href;
  link.className = className;
  link.textContent = title;
  if (source.target) {
    link.target = source.target;
    link.rel = source.rel || 'noopener';
  }
  return link;
}

const entries = [];
for (const card of catalog.querySelectorAll('article.card')) {
  const heading = card.querySelector('h3');
  const form = card.querySelector('a[data-library-form]');
  const creator = card.querySelector('a.btn.create[href*="create"]');
  const source = form || creator || card.querySelector('a[href]');
  if (!heading || !source) continue;

  const kind = form ? 'form' : creator ? 'template' : 'guide';
  const url = new URL(source.href);
  const key = form?.dataset.libraryForm || url.searchParams.get('type') || url.pathname.split('/').pop().replace(/\.html$/, '');
  const title = heading.textContent.trim();
  const translations = [...card.querySelectorAll('[data-en], [data-ht]')];
  const searchable = normalize([
    card.textContent, card.dataset.search, key, aliases[key],
    ...translations.flatMap(node => [node.dataset.en, node.dataset.ht])
  ].join(' '));

  const row = document.createElement('li');
  row.append(documentLink(source, title, 'document-link'));
  if (form) {
    const detail = form.dataset.libraryDetail;
    if (detail) {
      const note = document.createElement('p');
      note.textContent = detail;
      note.className = 'form-detail';
      row.append(note);
    }
    const booking = card.querySelector('a[data-document-booking]');
    if (booking) row.append(documentLink(booking, booking.textContent.trim(), 'panel-secondary'));
  }
  entries.push({ kind, key, title, searchable, row });
}

const templateRank = entry => entry.key === 'custom' ? priority.length + 1 : rank.get(entry.key) ?? priority.length;
for (const [kind, list] of Object.entries(lists)) {
  const group = entries.filter(entry => entry.kind === kind);
  if (kind === 'template') {
    group.sort((a, b) => templateRank(a) - templateRank(b) || a.title.localeCompare(b.title, language));
  }
  list.append(...group.map(entry => entry.row));
}

function updateResults() {
  const query = normalize(search.value);
  const terms = query ? query.split(/\s+/) : [];
  const searching = terms.length > 0;
  const exactForm = entries.find(entry => entry.kind === 'form' && terms.includes(normalize(entry.key)));
  const matches = { form: 0, template: 0, guide: 0 };
  for (const entry of entries) {
    const visible = exactForm ? entry === exactForm :
      (searching || entry.kind !== 'guide') && terms.every(term => entry.searchable.includes(term));
    entry.row.hidden = !visible;
    if (visible) matches[entry.kind]++;
  }

  const count = matches.form + matches.template + matches.guide;
  panels.classList.toggle('searching', searching);
  ownPanel.hidden = searching;
  formsPanel.hidden = !matches.form;
  templatesPanel.hidden = !matches.template;
  guidesPanel.hidden = !matches.guide;
  panels.hidden = !matches.form && !matches.template && searching;
  catalog.hidden = searching;
  clear.hidden = !search.value;
  empty.hidden = !searching || count > 0;
  status.textContent = searching ? (ht ? `${count} rezilta` : `${count} ${count === 1 ? 'result' : 'results'}`) : '';
}

function clearSearch() {
  search.value = '';
  updateResults();
  search.focus();
}

search.addEventListener('input', updateResults);
search.addEventListener('search', updateResults);
clear.addEventListener('click', clearSearch);
document.getElementById('reset-search').addEventListener('click', clearSearch);

const filters = [...catalog.querySelectorAll('button[data-filter]')];
const sections = [...catalog.querySelectorAll('[data-library-category]')];
for (const filter of filters) {
  filter.addEventListener('click', () => {
    const category = filter.dataset.filter;
    for (const section of sections) {
      section.hidden = category !== 'all' && section.dataset.libraryCategory !== category;
    }
    for (const option of filters) option.setAttribute('aria-pressed', String(option === filter));
  });
}

window.addEventListener('pageshow', updateResults);
updateResults();
showLinkedSection();
