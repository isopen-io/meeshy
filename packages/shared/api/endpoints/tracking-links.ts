/**
 * Les adresses du groupe `trackingLinks` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as trackingLinksEndpoints from '@meeshy/shared/api/endpoints/tracking-links';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/tracking-links/admin/all */
export const adminAll = '/api/v1/tracking-links/admin/all';

/** GET /api/v1/tracking-links/admin/:token/clicks */
export const adminByTokenClicks = (token: string): string => `/api/v1/tracking-links/admin/${encodeURIComponent(token)}/clicks`;

/** GET · PATCH · DELETE /api/v1/tracking-links/:token */
export const byToken = (token: string): string => `/api/v1/tracking-links/${encodeURIComponent(token)}`;

/** POST /api/v1/tracking-links/:token/click */
export const byTokenClick = (token: string): string => `/api/v1/tracking-links/${encodeURIComponent(token)}/click`;

/** GET /api/v1/tracking-links/:token/clicks */
export const byTokenClicks = (token: string): string => `/api/v1/tracking-links/${encodeURIComponent(token)}/clicks`;

/** PATCH /api/v1/tracking-links/:token/deactivate */
export const byTokenDeactivate = (token: string): string => `/api/v1/tracking-links/${encodeURIComponent(token)}/deactivate`;

/** POST /api/v1/tracking-links/:token/redirect-status */
export const byTokenRedirectStatus = (token: string): string => `/api/v1/tracking-links/${encodeURIComponent(token)}/redirect-status`;

/** GET /api/v1/tracking-links/:token/resolve */
export const byTokenResolve = (token: string): string => `/api/v1/tracking-links/${encodeURIComponent(token)}/resolve`;

/** GET /api/v1/tracking-links/:token/stats */
export const byTokenStats = (token: string): string => `/api/v1/tracking-links/${encodeURIComponent(token)}/stats`;

/** GET /api/v1/tracking-links/check-token/:token */
export const checkTokenByToken = (token: string): string => `/api/v1/tracking-links/check-token/${encodeURIComponent(token)}`;

/** GET /api/v1/tracking-links/conversation/:conversationId */
export const conversationByConversationId = (conversationId: string): string => `/api/v1/tracking-links/conversation/${encodeURIComponent(conversationId)}`;

/** POST /api/v1/tracking-links */
export const root = '/api/v1/tracking-links';

/** GET /api/v1/tracking-links/stats */
export const stats = '/api/v1/tracking-links/stats';

/** GET /api/v1/tracking-links/user/me */
export const userMe = '/api/v1/tracking-links/user/me';
