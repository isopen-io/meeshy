/**
 * CE QUE LA V2 A CESSÉ DE RANGER NE SURVIT PAS À L'ACTIVATION DU WORKER.
 *
 * Cesser de ranger une réponse ne l'efface pas : le Cache Storage vit à
 * l'échelle de l'ORIGINE, et un profil existant garde ce qu'un worker
 * précédent y a mis. Ce script retire, à l'activation, ce qui ne doit plus y
 * être :
 *
 *  - LES RÉPONSES DE L'ANNUAIRE ET DES ENVELOPPES CHIFFRÉS (#18987). Le seau
 *    `api` (`API_RESPONSE_CACHE_PATTERN`, `src/lib/net/api-runtime-cache.ts`)
 *    les refuse désormais ; celles qu'il a déjà rangées — `/e2ee/devices`,
 *    appelé par « Mes appareils chiffrés » depuis #13013 — se rejoueraient
 *    encore avec un `200` sur une passerelle injoignable : un bundle dont la
 *    pré-clé unique est déjà réservée, une liste d'appareils périmée.
 *
 *  - L'ANCIEN SEAU DE `/config.js` (#18988). Il gardait un SCRIPT que tout
 *    code de l'origine pouvait réécrire et que la page exécutait à chaque
 *    chargement ; la configuration est désormais une DONNÉE lue par `fetch`
 *    (`src/lib/api/runtime-config.ts`) qu'aucun seau ne garde. Ce qu'un
 *    script a pu y déposer disparaît avec lui.
 *
 * POURQUOI À L'ACTIVATION. C'est le moment où ce worker devient celui de
 * l'origine. L'opération est idempotente : après la première activation, plus
 * rien ne correspond.
 *
 * UNE PURGE QUI ÉCHOUE N'EMPÊCHE RIEN : la promesse remise à `waitUntil` ne
 * rejette jamais, un stockage qui refuse la lecture ne fait pas échouer
 * l'activation du worker qui sert l'application.
 *
 * Il est chargé par `importScripts` EN TÊTE du service worker généré
 * (`SERVICE_WORKER_SCRIPTS`, `vite/pwa.ts`) et n'intercepte aucune requête.
 */
/** JUMEAU de `SW_RUNTIME_CACHES.api` (`src/lib/sw-caches.ts`) — un script classique n'importe rien. */
const API_CACHE = 'api';
/** JUMEAU de `SW_RETIRED_DEPLOYMENT_CONFIG_CACHE` (`src/lib/sw-caches.ts`). */
const RETIRED_DEPLOYMENT_CONFIG_CACHE = 'deployment-config';
const E2EE_RESPONSE = /^https?:\/\/[^/]+\/api\/v1\/e2ee(?:[/?#]|$)/;

const purgeSealedResponses = () =>
  caches.has(API_CACHE).then((present) =>
    present
      ? caches
          .open(API_CACHE)
          .then((cache) =>
            cache.keys().then((requests) => Promise.all(requests.filter((request) => E2EE_RESPONSE.test(request.url)).map((request) => cache.delete(request)))),
          )
      : undefined,
  );

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([purgeSealedResponses().catch(() => undefined), caches.delete(RETIRED_DEPLOYMENT_CONFIG_CACHE).catch(() => undefined)]),
  );
});
