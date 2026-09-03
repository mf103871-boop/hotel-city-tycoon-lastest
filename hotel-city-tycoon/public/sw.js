/**
 * Service worker.
 *
 * Two strategies, chosen by what the file is.
 *
 * Assets are content-addressed by the build or are art that never changes
 * under the same name, so they are served cache-first: instant, and the game
 * opens with no network at all.
 *
 * The app shell is network-first with a cache fallback, because serving a
 * stale index.html after a deploy strands players on an old build that may not
 * understand their save.
 */
// Stamped by the build: tools/stamp-sw.mjs replaces these two placeholders
// in dist/sw.js — VERSION with the bundle's hash, ART_VERSION with a digest
// of every shipped art and audio file — so a worker from an older build, or
// one that cached art since replaced under the same name, cannot keep
// serving its caches once a newer one installs. The two are separate so a
// code-only deploy does not make every installed phone re-download the art.
// This file is never registered in development.
const VERSION = 'hct-dev';
const ART_VERSION = 'art-dev';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${ART_VERSION}-assets`;

console.info(`[sw] ${VERSION} / ${ART_VERSION} installing`);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Art, audio and icons only.
  //
  // The earlier rule was `/assets/`, which also matched the built JavaScript
  // bundle — Vite emits it into the same directory. Hashed filenames meant a
  // new build usually fetched fresh anyway, but a caching layer that works by
  // coincidence is not a design, and a stale bundle is indistinguishable from
  // a deployment that never happened.
  const isAsset = /\.(png|wav|woff2?)$/.test(url.pathname)
    || /\/assets\/(rooms|characters|decor|effects|ui|audio)\//.test(url.pathname)
    || url.pathname.endsWith('/icons/')
    || /\/icons\//.test(url.pathname);

  if (isAsset) {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(ASSETS).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(SHELL).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match('./index.html'))),
  );
});
