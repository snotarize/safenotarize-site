(() => {
  const checker = document.querySelector('[data-ps1583-id-check]');
  if (!checker) return;

  const photo = checker.querySelector('#ps1583-photo-id');
  const address = checker.querySelector('#ps1583-address-id');
  const status = checker.querySelector('#ps1583-id-status');

  function update() {
    const selected = [photo.value, address.value];
    if (selected.includes('other')) {
      status.textContent = status.dataset.other;
    } else if (selected.includes('')) {
      status.textContent = status.dataset.prompt;
    } else if (photo.value === 'driver-id' && address.value === 'driver-id') {
      status.textContent = status.dataset.duplicate;
    } else {
      status.textContent = status.dataset.listed;
    }
  }

  photo.addEventListener('change', update);
  address.addEventListener('change', update);
  update();
  checker.hidden = false;
})();
