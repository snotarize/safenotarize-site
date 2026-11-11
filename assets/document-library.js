import './document-service-links.js';

const search = document.getElementById('document-search');
const clear = document.getElementById('clear-search');
const status = document.getElementById('search-status');
const empty = document.getElementById('no-results');
const quickActions = document.getElementById('quick-actions');
const filters = [...document.querySelectorAll('button[data-filter]')];
const sections = [...document.querySelectorAll('[data-library-category]')];
const ht = document.documentElement.lang === 'ht';
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
  quickActions.hidden = Boolean(query) || category !== 'all';
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
document.getElementById('browse-templates').addEventListener('click', event => {
  event.preventDefault();
  category = 'templates';
  updateResults();
  document.getElementById('tab-templates').focus();
});
window.addEventListener('pageshow', updateResults);
updateResults();
