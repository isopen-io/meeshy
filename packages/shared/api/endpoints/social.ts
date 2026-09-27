/**
 * Les adresses du groupe `social` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as socialEndpoints from '@meeshy/shared/api/endpoints/social';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/social/events */
export const events = '/api/v1/social/events';

/** GET /api/v1/social/posts */
export const posts = '/api/v1/social/posts';
