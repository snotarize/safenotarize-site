const requestedService = new URLSearchParams(location.search).get('service');
export const selectedService = ['regular', 'premium'].includes(requestedService) ? requestedService : '';

export function documentBookingUrl({ language, documentType, saved = false, documentSource = documentType ? 'official' : 'own' }) {
  const ht = language === 'ht';
  const premium = selectedService === 'premium';
  const path = premium ? '/premium.html' : ht ? '/book-ht.html' : '/book.html';
  const query = new URLSearchParams();
  if (selectedService) query.set('service', selectedService);
  if (premium && ht) query.set('lang', 'ht');
  if (!premium) query.set('document_ready', '1');
  query.set('document_source', saved ? 'library' : premium ? 'own' : documentSource);
  if (documentType && (saved || !premium)) query.set('document_type', documentType);
  return `${path}?${query}`;
}

for (const link of document.querySelectorAll('a[data-document-booking]')) {
  link.href = documentBookingUrl({
    language: document.documentElement.lang,
    documentType: link.dataset.documentBooking
  });
}

if (selectedService) {
  for (const link of document.querySelectorAll('a[data-document-service]')) {
    const url = new URL(link.href);
    if (url.origin !== location.origin) continue;
    url.searchParams.set('service', selectedService);
    link.href = url.pathname + url.search + url.hash;
  }
}
