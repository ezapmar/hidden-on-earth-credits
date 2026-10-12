/* Hidden on Earth service worker: keeps the paintings playable offline.

   It handles only two kinds of request and leaves everything else to the browser:

     assets/paintings.json   network first, cached copy when offline
     assets/img/...          cache first; the files are content-hashed and served immutable,
                             so a cached copy is never stale
     play/...                the game shell, network first: a new build wins, the cached one
                             keeps the game playable on a plane

   On install it stores the card and fit tiers of every painting (about 2 MB), so the picker
   and a first play work with no network. The play and zoom tiers are stored as they are
   fetched, newest kept, up to PLAY_LIMIT files. The format precached is the one this browser
   can decode (AVIF, else WebP), which is also the one <picture> will ask for.

   Bump VERSION to drop every cache on the next visit (a changed manifest alone needs no bump:
   new files have new names and are fetched on use). */
var VERSION = 'v2';
var STATIC_CACHE = 'hoe-static-' + VERSION;   // manifest + card + fit
var PLAY_CACHE = 'hoe-play-' + VERSION;       // play + zoom, on use
var PLAY_LIMIT = 16;                           // files: about 8 paintings with both tiers
var BASE = new URL(self.registration.scope).pathname;
var MANIFEST = 'assets/paintings.json';
var SHELL = [
  'play/',
  'play/levels.json',
  'play/app.js',
  'play/core/gameSession.js',
  'play/core/index.js',
  'play/core/l10n.js',
  'play/core/level.js',
  'play/core/progress.js',
  'play/core/targetKey.js',
  'play/core/tiers.js',
  'play/core/viewport.js',
  'play/data.js',
  'play/game.js',
  'play/home.js',
  'play/symbols.js'
];
var IMG_DIR = 'assets/img/';

/* 1x1 AVIF, made by sharp; decoding it tells us whether this engine can show AVIF at all. */
var AVIF_PROBE = 'AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAAGgAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAibWRhdBIACgc4AA5QENBpMg0bAAAAQAAAnjWAT6RQ';

function supportsAvif() {
  if (typeof createImageBitmap !== 'function') return Promise.resolve(false);
  var bytes = Uint8Array.from(atob(AVIF_PROBE), function (c) { return c.charCodeAt(0); });
  return createImageBitmap(new Blob([bytes], { type: 'image/avif' }))
    .then(function () { return true; }, function () { return false; });
}

function rel(url) {
  return url.origin === self.location.origin && url.pathname.indexOf(BASE) === 0
    ? url.pathname.slice(BASE.length) : null;
}

function isPlayTier(path) {
  var name = path.slice(path.lastIndexOf('/') + 1);
  return name.indexOf('play.') === 0 || name.indexOf('zoom.') === 0;
}

function precache() {
  return caches.open(STATIC_CACHE).then(function (cache) {
    return fetch(BASE + MANIFEST, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) return;
      return res.clone().json().then(function (manifest) {
        return cache.put(BASE + MANIFEST, res).then(function () { return supportsAvif(); }).then(function (avif) {
          var format = avif ? 'avif' : 'webp';
          var manifestUrl = self.location.origin + BASE + MANIFEST;
          var urls = [];
          Object.keys(manifest.levels).forEach(function (id) {
            var tiers = manifest.levels[id].tiers;
            ['card', 'fit'].forEach(function (t) {
              if (tiers[t] && tiers[t][format]) urls.push(new URL(manifest.base + tiers[t][format].path, manifestUrl).href);
            });
          });
          // One at a time keeps install light; a failure leaves that file to be fetched on use.
          return urls.reduce(function (chain, url) {
            return chain.then(function () {
              return cache.match(url).then(function (hit) {
                return hit || cache.add(url).catch(function () {});
              });
            });
          }, Promise.resolve());
        });
      });
    }).catch(function () {});
  });
}

function trim(cache) {
  return cache.keys().then(function (keys) {
    var extra = keys.length - PLAY_LIMIT;
    if (extra <= 0) return;
    return Promise.all(keys.slice(0, extra).map(function (k) { return cache.delete(k); }));
  });
}

function cacheFirst(request, path) {
  return caches.match(request).then(function (hit) {
    if (hit) return hit;
    return fetch(request).then(function (res) {
      if (!res.ok || res.type !== 'basic') return res;
      var copy = res.clone();
      var name = isPlayTier(path) ? PLAY_CACHE : STATIC_CACHE;
      caches.open(name).then(function (cache) {
        return cache.put(request, copy).then(function () { if (name === PLAY_CACHE) return trim(cache); });
      });
      return res;
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(STATIC_CACHE).then(function (cache) { return cache.put(request, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(request).then(function (hit) { return hit || Response.error(); });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(Promise.all([
    precache(),
    caches.open(STATIC_CACHE).then(function (cache) {
      /* one missing file must not fail the install and take the paintings down with it */
      return Promise.all(SHELL.map(function (f) { return cache.add(BASE + f).catch(function () {}); }));
    })
  ]).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.map(function (n) {
      if (n.indexOf('hoe-') === 0 && n !== STATIC_CACHE && n !== PLAY_CACHE) return caches.delete(n);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var path = rel(new URL(e.request.url));
  if (path === null) return;
  if (path === MANIFEST) e.respondWith(networkFirst(e.request));
  else if (path.indexOf(IMG_DIR) === 0) e.respondWith(cacheFirst(e.request, path));
  else if (path === 'play/' || path.indexOf('play/') === 0) e.respondWith(networkFirst(e.request));
});
