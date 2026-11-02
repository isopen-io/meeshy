/**
 * Les adresses du groupe `bring` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as bringEndpoints from '@meeshy/shared/api/endpoints/bring';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** DELETE /api/v1/bring/:bringId */
export const byBringId = (bringId: string): string => `/api/v1/bring/${encodeURIComponent(bringId)}`;

/** GET · POST /api/v1/bring/:userId */
export const byUserId = (userId: string): string => `/api/v1/bring/${encodeURIComponent(userId)}`;
