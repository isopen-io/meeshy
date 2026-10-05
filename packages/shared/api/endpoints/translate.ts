/**
 * Les adresses du groupe `translate` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as translateEndpoints from '@meeshy/shared/api/endpoints/translate';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET · DELETE /api/v1/translate/jobs/:jobId */
export const jobsByJobId = (jobId: string): string => `/api/v1/translate/jobs/${encodeURIComponent(jobId)}`;

/** POST /api/v1/translate */
export const root = '/api/v1/translate';
