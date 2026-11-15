/**
 * Les adresses du groupe `apiLegacyConversations` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as apiLegacyConversationsEndpoints from '@meeshy/shared/api/endpoints/api-legacy-conversations';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/conversations/:conversationId/clear-history */
export const byConversationIdClearHistory = (conversationId: string): string => `/api/conversations/${encodeURIComponent(conversationId)}/clear-history`;

/** DELETE /api/conversations/:conversationId/delete-for-me */
export const byConversationIdDeleteForMe = (conversationId: string): string => `/api/conversations/${encodeURIComponent(conversationId)}/delete-for-me`;

/** POST /api/conversations/:conversationId/restore-for-me */
export const byConversationIdRestoreForMe = (conversationId: string): string => `/api/conversations/${encodeURIComponent(conversationId)}/restore-for-me`;
