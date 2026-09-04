export const CORS_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE';

/**
 * Les en-têtes de réponse qu'un client d'une AUTRE origine a le droit de LIRE
 * (`response.headers.get(...)`). `ETag` n'est pas dans la safelist CORS
 * (fetch.spec.whatwg.org/#cors-safelisted-response-header-name) : sans cette
 * déclaration, `reply.header('ETag', …)` — posé par `conditionalGetOnSend`
 * (`utils/etag.ts`) sur ~200 endpoints GET, et par `GET /sync` directement —
 * est invisible à `apps/web`/`apps/web-v3` (origine distincte de la
 * passerelle), qui ne peut donc jamais composer `If-None-Match` et ne reçoit
 * jamais de 304 (#5015). iOS (`URLSession`, hors CORS) n'est pas concerné.
 */
export const CORS_EXPOSED_HEADERS = 'ETag';
