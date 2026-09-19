/**
 * **Les méthodes HTTP que les deux URL de téléversement exposent — et `GET`
 * n'en fait JAMAIS partie** (#7132).
 *
 * ## Pourquoi ces deux listes vivent SEULES dans ce module
 *
 * `tus-handler.ts` importe `@tus/server`, qui est un module ESM : un témoin qui
 * importerait le handler pour lire ces listes ferait tomber toute sa suite
 * (`createRequireEsmError`). Le voisin `tus-handler-cors.test.ts` contourne en
 * chargeant le module APRÈS ses mocks — une mécanique qu'un import statique
 * casse. Une donnée qu'une garde doit lire ne traîne donc pas la plomberie
 * derrière elle.
 *
 * ## Pourquoi `GET` est proscrit
 *
 * La porte tus décide SEULE de ses en-têtes CORS : `tusServer.handle` écrit sur
 * la réponse BRUTE, donc ceux de `@fastify/cors` ne l'atteignent jamais
 * (#5298). Et `@tus/server` 2.4.5 porte une exception qu'il écrit lui-même
 * dans son code (`dist/server.js`) :
 *
 * > `// CORS must be set before the 412 and validation 400 returns below.`
 * > `// GET still dispatches earlier and stays CORS-less.`
 *
 * Un `GET` servi par tus repart donc **sans** `Access-Control-Allow-Origin`, et
 * un navigateur d'une autre origine ne peut pas le lire — mot pour mot le
 * message rapporté sur staging le 2026-09-19 (#7132).
 *
 * La règle tient parce qu'aucun octet ne se lit par cette route : les fichiers
 * sont servis par `GET /attachments/:id`. C'est cette dépendance qu'il faut
 * revoir avant de toucher à ces listes, pas la liste elle-même.
 *
 * ## Ce que chaque URL porte (#4190)
 *
 * - la COLLECTION crée une session (`POST`, extension Creation) et se décrit
 *   (`OPTIONS`) ;
 * - une session EXISTANTE se sonde (`HEAD`, la reprise), se poursuit
 *   (`PATCH`), se termine (`DELETE`) et se décrit (`OPTIONS`).
 *
 * `HEAD /uploads` et `POST /uploads/*` survivent volontairement : l'inventaire
 * de #4190 ne les a jamais énumérés, et la règle de ce lot-là est que la
 * confirmation précède le retrait.
 */
export const TUS_COLLECTION_METHODS = ['HEAD', 'POST', 'OPTIONS'] as const;
export const TUS_UPLOAD_METHODS = ['HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] as const;
