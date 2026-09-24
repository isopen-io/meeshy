/**
 * EFFACE LES CACHES DU LEGACY QUAND LE SERVICE WORKER DE LA V2 S'ACTIVE
 * (bascule de meeshy.me, #6702).
 *
 * LE PROBLÈME. Le Cache Storage vit à l'échelle de l'ORIGINE, pas du worker.
 * Le service worker du legacy (`apps/web/public/sw.js`) y a rangé, sous le
 * préfixe `meeshy-cache-`, sa coquille ET des réponses d'API privées de ses
 * lecteurs. La v2 le remplace dans la MÊME inscription (`/sw.js`) : le worker
 * qui savait purger ces caches ne s'exécutera plus jamais, et ils resteraient
 * sur le disque du lecteur sans qu'aucune application ne les lise ni ne les
 * efface.
 *
 * CE QUE CE FICHIER FAIT. À l'activation, il supprime les caches dont le nom
 * COMMENCE par `meeshy-cache-` — le préfixe que le legacy déclarait lui-même
 * comme sa frontière de propriété (`CACHE_NAMESPACE`, `apps/web/public/sw.js`),
 * et eux seuls : le précache de Workbox, `api` et `medias` appartiennent à la
 * v2 et restent intacts.
 *
 * POURQUOI À L'ACTIVATION. C'est le moment où ce worker devient celui de
 * l'origine ; avant, l'ancien peut encore servir une page ouverte. L'opération
 * est idempotente : après la première activation, plus rien ne correspond.
 *
 * UNE PURGE QUI ÉCHOUE N'EMPÊCHE RIEN. Un stockage qui refuse la lecture ne
 * doit pas faire échouer l'activation du worker qui sert l'application : la
 * promesse remise à `waitUntil` ne rejette jamais.
 *
 * Il est chargé par `importScripts` EN TÊTE du service worker généré
 * (`SERVICE_WORKER_SCRIPTS`, `vite.config.ts`) et n'intercepte aucune requête.
 */
const LEGACY_CACHE_NAMESPACE = 'meeshy-cache-';

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name.startsWith(LEGACY_CACHE_NAMESPACE)).map((name) => caches.delete(name))),
      )
      .catch(() => undefined),
  );
});
