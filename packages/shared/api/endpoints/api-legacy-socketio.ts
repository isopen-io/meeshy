/**
 * Les adresses du groupe `apiLegacySocketio` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as apiLegacySocketioEndpoints from '@meeshy/shared/api/endpoints/api-legacy-socketio';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/socketio/disconnect-user */
export const disconnectUser = '/api/socketio/disconnect-user';

/** GET /api/socketio/stats */
export const stats = '/api/socketio/stats';
