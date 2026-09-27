/**
 * Les adresses du groupe `socketio` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as socketioEndpoints from '@meeshy/shared/api/endpoints/socketio';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/socketio/disconnect-user */
export const disconnectUser = '/api/v1/socketio/disconnect-user';

/** GET /api/v1/socketio/stats */
export const stats = '/api/v1/socketio/stats';
