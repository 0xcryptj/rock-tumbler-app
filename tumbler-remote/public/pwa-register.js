/* Registers the service worker after Expo web export (sw.js exists in dist/ only). */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    fetch('/sw.js', { method: 'HEAD', cache: 'no-store' })
      .then((res) => {
        if (!res.ok) return;
        return navigator.serviceWorker.register('/sw.js', { scope: '/' });
      })
      .catch(() => {});
  });
}
