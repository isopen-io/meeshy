/**
 * Les adresses du groupe `anonymous` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as anonymousEndpoints from '@meeshy/shared/api/endpoints/anonymous';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/anonymous/join/:linkId */
export const joinByLinkId = (linkId: string): string => `/api/v1/anonymous/join/${encodeURIComponent(linkId)}`;

/** POST /api/v1/anonymous/leave */
export const leave = '/api/v1/anonymous/leave';

/** GET /api/v1/anonymous/link/:identifier */
export const linkByIdentifier = (identifier: string): string => `/api/v1/anonymous/link/${encodeURIComponent(identifier)}`;

/** POST /api/v1/anonymous/refresh */
export const refresh = '/api/v1/anonymous/refresh';
