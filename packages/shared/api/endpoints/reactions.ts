/**
 * Les adresses du groupe `reactions` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as reactionsEndpoints from '@meeshy/shared/api/endpoints/reactions';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/reactions/:messageId */
export const byMessageId = (messageId: string): string => `/api/v1/reactions/${encodeURIComponent(messageId)}`;

/** DELETE /api/v1/reactions/:messageId/:emoji */
export const byMessageIdByEmoji = (messageId: string, emoji: string): string => `/api/v1/reactions/${encodeURIComponent(messageId)}/${encodeURIComponent(emoji)}`;

/** POST /api/v1/reactions */
export const root = '/api/v1/reactions';

/** GET /api/v1/reactions/user/:userId */
export const userByUserId = (userId: string): string => `/api/v1/reactions/user/${encodeURIComponent(userId)}`;
