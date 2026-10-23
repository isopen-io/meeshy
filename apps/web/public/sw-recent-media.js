/**
 * LES MÉDIAS VUS RÉCEMMENT SE RELISENT HORS LIGNE, PLAGES COMPRISES (#11326).
 *
 * Un `<video>` ou un `<audio>` demande d'emblée une PLAGE (`Range`) ; la
 * passerelle rend `206`, qu'aucun cache ne sait resservir seule. La page range
 * donc à part le fichier ENTIER d'un média qu'on vient de voir, dans le seau
 * `recent-media` (`src/lib/media/recent-media-store.ts`, trois jours, Wi-Fi,
 * 500 Mo) ; ce script y DÉCOUPE les plages demandées — le rôle du
 * `RangeRequestsPlugin` de Workbox, écrit ici parce que la coque n'embarque
 * pas Workbox. UN script, deux régimes : le worker du web l'importe
 * (`SERVICE_WORKER_SCRIPTS`, `vite/pwa.ts`), la coque l'inscrit seul.
 *
 * Il N'ÉCRIT JAMAIS : rien n'entre dans le seau sans la loi de la page (vue
 * unique, flouté, éphémère, adresse signée exclus). Il ne resert ni une entrée
 * de plus de trois jours (retirée au passage) ni une entrée `no-store` /
 * `no-cache` (#9478). Absent du seau, le média part au réseau tel quel.
 *
 * Les littéraux sont les JUMEAUX de `src/lib/sw-caches.ts` et
 * `recent-media-policy.ts` — un script classique n'importe rien ;
 * `src/sw-recent-media.test.ts` les confronte.
 */
(() => {
  const CACHE = 'recent-media';
  const STORED_AT = 'X-Meeshy-Stored-At';
  const MAX_AGE_MS = 259200000;
  const NO_STORE_OR_NO_CACHE = /(?:^|,)\s*no-(?:store|cache)\s*(?:[,=]|$)/i;

  const isTimedMedia = (request) => request.method === 'GET' && (request.destination === 'video' || request.destination === 'audio');

  const servable = (response) => {
    const storedAt = Number(response.headers.get(STORED_AT));
    return (
      Number.isFinite(storedAt) &&
      Date.now() - storedAt <= MAX_AGE_MS &&
      !NO_STORE_OR_NO_CACHE.test(response.headers.get('Cache-Control') || '')
    );
  };

  const rangeOf = (header, size) => {
    const match = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
    if (match === null || (match[1] === '' && match[2] === '')) return null;
    if (match[1] === '') {
      const suffix = Math.min(Number(match[2]), size);
      return { start: size - suffix, end: size - 1 };
    }
    const start = Number(match[1]);
    const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    return { start, end };
  };

  const sliced = async (request, response) => {
    const header = request.headers.get('Range');
    if (header === null) return response;
    const blob = await response.blob();
    const range = rangeOf(header, blob.size);
    const headers = new Headers(response.headers);
    if (range === null || range.start > range.end || range.start >= blob.size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
    }
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${blob.size}`);
    headers.set('Content-Length', String(range.end - range.start + 1));
    headers.set('Accept-Ranges', 'bytes');
    return new Response(blob.slice(range.start, range.end + 1), { status: 206, statusText: 'Partial Content', headers });
  };

  const serve = async (request) => {
    try {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request.url);
      if (cached === undefined) return fetch(request);
      if (!servable(cached)) {
        await cache.delete(request.url);
        return fetch(request);
      }
      return await sliced(request, cached);
    } catch {
      return fetch(request);
    }
  };

  self.addEventListener('fetch', (event) => {
    if (!isTimedMedia(event.request)) return;
    event.respondWith(serve(event.request));
  });
})();
