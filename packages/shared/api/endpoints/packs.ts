/**
 * Les adresses du groupe `packs` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/packs/glory-frame */
export const gloryFrame = '/api/v1/packs/glory-frame';

/** GET /api/v1/packs/glory-frame/:slug */
export const gloryFrameBySlug = (slug: string): string => `/api/v1/packs/glory-frame/${encodeURIComponent(slug)}`;

/** PUT · DELETE /api/v1/packs/glory-frame/:slug/install */
export const gloryFrameBySlugInstall = (slug: string): string => `/api/v1/packs/glory-frame/${encodeURIComponent(slug)}/install`;

/** GET /api/v1/packs/glory-frame/installed */
export const gloryFrameInstalled = '/api/v1/packs/glory-frame/installed';
