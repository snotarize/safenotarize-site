import { documentBookingUrl, selectedService } from './document-service-links.js?v=2';

const guide = document.getElementById('document-guide');
const catalog = document.getElementById('document-catalog');
const languageLink = document.getElementById('library-language');
const steps = new Map([...guide.querySelectorAll('[data-guide-step]')].map(step => [step.id, step]));
const start = steps.get('guide-start');

function showGuide(moveFocus = false) {
  const hash = location.hash.slice(1);
  const active = steps.get(hash) || start;
  for (const step of steps.values()) step.hidden = step !== active;
  languageLink.hash = active === start ? '' : active.id;

  const target = document.getElementById(hash);
  if (target && (target === catalog || catalog.contains(target))) {
    catalog.open = true;
    target.scrollIntoView();
  } else if (moveFocus) {
    active.querySelector('h2').focus();
  }
}

for (const link of guide.querySelectorAll('[data-guide-to]')) {
  link.hash = link.dataset.guideTo;
}
guide.addEventListener('click', event => {
  const link = event.target.closest('[data-guide-to]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const step = steps.get(link.dataset.guideTo);
  if (!step) return;
  event.preventDefault();
  history.pushState(null, '', step === start ? location.pathname + location.search : link.hash);
  catalog.open = false;
  showGuide(true);
});
window.addEventListener('hashchange', () => showGuide(true));
showGuide();

const mobileMenu = document.querySelector('.sn-mobile-menu');
document.addEventListener('click', event => {
  if (mobileMenu.open && !mobileMenu.contains(event.target)) mobileMenu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !mobileMenu.open) return;
  mobileMenu.open = false;
  mobileMenu.querySelector('summary').focus();
});

const language = document.documentElement.lang;
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
const filters = [...document.querySelectorAll('button[data-filter]')];
const sections = [...document.querySelectorAll('[data-library-category]')];
const ht = language === 'ht';
let category = 'all';

function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(ds|ps)\s*(\d+)/g, '$1$2').trim();
}

const searchText = new Map();
for (const card of document.querySelectorAll('.card')) {
  const translations = [...card.querySelectorAll('[data-en], [data-ht]')];
  searchText.set(card, normalize([
    card.textContent, card.dataset.search || '',
    ...translations.flatMap(node => [node.dataset.en || '', node.dataset.ht || ''])
  ].join(' ')));
}

function updateResults() {
  const query = normalize(search.value);
  const terms = query ? query.split(/\s+/) : [];
  let count = 0;
  for (const section of sections) {
    const inCategory = category === 'all' || category === section.dataset.libraryCategory;
    let matches = 0;
    for (const card of section.querySelectorAll('.card')) {
      card.hidden = !inCategory || !terms.every(term => searchText.get(card).includes(term));
      if (!card.hidden) matches++;
    }
    for (const group of section.querySelectorAll('.category-group')) {
      group.hidden = !group.querySelector('.card:not([hidden])');
    }
    section.hidden = matches === 0;
    count += matches;
  }

  for (const filter of filters) filter.setAttribute('aria-pressed', String(filter.dataset.filter === category));
  clear.hidden = !search.value;
  empty.hidden = count > 0;
  status.textContent = query || category !== 'all'
    ? ht ? `${count} dokiman` : `${count} ${count === 1 ? 'document' : 'documents'}`
    : '';
}

for (const filter of filters) {
  filter.addEventListener('click', () => {
    category = filter.dataset.filter;
    updateResults();
  });
}
search.addEventListener('input', updateResults);
search.addEventListener('search', updateResults);
clear.addEventListener('click', () => {
  search.value = '';
  updateResults();
  search.focus();
});
document.getElementById('reset-filters').addEventListener('click', () => {
  search.value = '';
  category = 'all';
  updateResults();
  search.focus();
});
window.addEventListener('pageshow', updateResults);
updateResults();
