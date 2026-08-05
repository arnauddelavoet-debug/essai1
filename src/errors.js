export function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg; // textContent : aucun risque XSS
  el.hidden = false;
  setTimeout(() => hideError(), 6000);
}

export function hideError() {
  document.getElementById('error-banner').hidden = true;
}

export function showLoading() {
  document.getElementById('loading-overlay').hidden = false;
}

export function hideLoading() {
  document.getElementById('loading-overlay').hidden = true;
}
