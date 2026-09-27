/**
 * Les adresses du groupe `links` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as linksEndpoints from '@meeshy/shared/api/endpoints/links';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/links/:identifier */
export const byIdentifier = (identifier: string): string => `/api/v1/links/${encodeURIComponent(identifier)}`;

/** GET /api/v1/links/:identifier/card */
export const byIdentifierCard = (identifier: string): string => `/api/v1/links/${encodeURIComponent(identifier)}/card`;

/** GET · POST /api/v1/links/:identifier/messages */
export const byIdentifierMessages = (identifier: string): string => `/api/v1/links/${encodeURIComponent(identifier)}/messages`;

/** POST /api/v1/links/:key/members */
export const byKeyMembers = (key: string): string => `/api/v1/links/${encodeURIComponent(key)}/members`;

/** PATCH · DELETE /api/v1/links/:linkId */
export const byLinkId = (linkId: string): string => `/api/v1/links/${encodeURIComponent(linkId)}`;

/** PATCH /api/v1/links/:linkId/extend */
export const byLinkIdExtend = (linkId: string): string => `/api/v1/links/${encodeURIComponent(linkId)}/extend`;

/** GET /api/v1/links/:linkId/stats */
export const byLinkIdStats = (linkId: string): string => `/api/v1/links/${encodeURIComponent(linkId)}/stats`;

/** PATCH /api/v1/links/:linkId/toggle */
export const byLinkIdToggle = (linkId: string): string => `/api/v1/links/${encodeURIComponent(linkId)}/toggle`;

/** GET /api/v1/links/check-identifier/:identifier */
export const checkIdentifierByIdentifier = (identifier: string): string => `/api/v1/links/check-identifier/${encodeURIComponent(identifier)}`;

/** GET /api/v1/links/my-links */
export const myLinks = '/api/v1/links/my-links';

/** GET · POST /api/v1/links */
export const root = '/api/v1/links';

/** GET /api/v1/links/stats */
export const stats = '/api/v1/links/stats';
