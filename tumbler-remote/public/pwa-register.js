/* Registers the service worker after Expo web export (sw.js exists in dist/ only).
 *
 * Bump SW_GENERATION whenever the bundle ships a change that older caches
 * would mask (e.g. removing a hardcoded LAN URL that caused mixed content).
 * The page reads the previous value from localStorage and, if it changed,
 * unregisters all existing service workers and wipes Cache Storage BEFORE
 * registering the new SW. The next load pulls fully fresh assets.
 */
(function () {
  var SW_GENERATION = 'v2-no-lan-url';
  var SW_KEY = 'tumbler-sw-generation';
  if (!('serviceWorker' in navigator)) return;

  function purgeAndRegister() {
    var purge = Promise.resolve();
    try {
      if (localStorage.getItem(SW_KEY) !== SW_GENERATION) {
        purge = navigator.serviceWorker
          .getRegistrations()
          .then(function (regs) {
            return Promise.all(regs.map(function (r) { return r.unregister(); }));
          })
          .then(function () {
            if (typeof caches !== 'undefined' && caches.keys) {
              return caches.keys().then(function (keys) {
                return Promise.all(keys.map(function (k) { return caches.delete(k); }));
              });
            }
          })
          .then(function () {
            try { localStorage.setItem(SW_KEY, SW_GENERATION); } catch (e) {}
          })
          .catch(function () {});
      }
    } catch (e) {}

    purge.then(function () {
      return fetch('/sw.js', { method: 'HEAD', cache: 'no-store' });
    }).then(function (res) {
      if (!res || !res.ok) return;
      return navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }).catch(function () {});
  }

  if (document.readyState === 'complete') {
    purgeAndRegister();
  } else {
    window.addEventListener('load', purgeAndRegister);
  }
})();
