/**
 * Les adresses du groupe `app` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as appEndpoints from '@meeshy/shared/api/endpoints/app';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/app/min-version */
export const minVersion = '/api/v1/app/min-version';

/** GET /api/v1/app/shell-version */
export const shellVersion = '/api/v1/app/shell-version';
