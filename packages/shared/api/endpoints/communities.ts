/**
 * Les adresses du groupe `communities` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as communitiesEndpoints from '@meeshy/shared/api/endpoints/communities';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET · PUT · DELETE /api/v1/communities/:id */
export const byId = (id: string): string => `/api/v1/communities/${encodeURIComponent(id)}`;

/** GET /api/v1/communities/:id/conversations */
export const byIdConversations = (id: string): string => `/api/v1/communities/${encodeURIComponent(id)}/conversations`;

/** POST /api/v1/communities/:id/conversations/:conversationId */
export const byIdConversationsByConversationId = (id: string, conversationId: string): string => `/api/v1/communities/${encodeURIComponent(id)}/conversations/${encodeURIComponent(conversationId)}`;

/** POST /api/v1/communities/:id/invite */
export const byIdInvite = (id: string): string => `/api/v1/communities/${encodeURIComponent(id)}/invite`;

/** POST /api/v1/communities/:id/join */
export const byIdJoin = (id: string): string => `/api/v1/communities/${encodeURIComponent(id)}/join`;

/** POST /api/v1/communities/:id/leave */
export const byIdLeave = (id: string): string => `/api/v1/communities/${encodeURIComponent(id)}/leave`;

/** GET · POST /api/v1/communities/:id/members */
export const byIdMembers = (id: string): string => `/api/v1/communities/${encodeURIComponent(id)}/members`;

/** DELETE /api/v1/communities/:id/members/:memberId */
export const byIdMembersByMemberId = (id: string, memberId: string): string => `/api/v1/communities/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`;

/** PATCH /api/v1/communities/:id/members/:memberId/role */
export const byIdMembersByMemberIdRole = (id: string, memberId: string): string => `/api/v1/communities/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/role`;

/** GET /api/v1/communities/check-identifier/:identifier */
export const checkIdentifierByIdentifier = (identifier: string): string => `/api/v1/communities/check-identifier/${encodeURIComponent(identifier)}`;

/** GET /api/v1/communities/mine */
export const mine = '/api/v1/communities/mine';

/** GET · POST /api/v1/communities */
export const root = '/api/v1/communities';

/** GET /api/v1/communities/search */
export const search = '/api/v1/communities/search';
