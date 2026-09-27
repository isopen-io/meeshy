/**
 * Les adresses du groupe `userPreferences` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as userPreferencesEndpoints from '@meeshy/shared/api/endpoints/user-preferences';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/user-preferences/communities */
export const communities = '/api/v1/user-preferences/communities';

/** GET · PUT · DELETE /api/v1/user-preferences/communities/:communityId */
export const communitiesByCommunityId = (communityId: string): string => `/api/v1/user-preferences/communities/${encodeURIComponent(communityId)}`;

/** POST /api/v1/user-preferences/communities/reorder */
export const communitiesReorder = '/api/v1/user-preferences/communities/reorder';

/** GET /api/v1/user-preferences/conversations */
export const conversations = '/api/v1/user-preferences/conversations';

/** GET · PUT · DELETE /api/v1/user-preferences/conversations/:conversationId */
export const conversationsByConversationId = (conversationId: string): string => `/api/v1/user-preferences/conversations/${encodeURIComponent(conversationId)}`;

/** POST /api/v1/user-preferences/reorder */
export const reorder = '/api/v1/user-preferences/reorder';
