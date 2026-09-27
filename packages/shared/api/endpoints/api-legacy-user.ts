/**
 * Les adresses du groupe `apiLegacyUser` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as apiLegacyUserEndpoints from '@meeshy/shared/api/endpoints/api-legacy-user';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/user/deleted-conversations */
export const deletedConversations = '/api/user/deleted-conversations';
