/**
 * Les adresses du groupe `stickerPacks` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as stickerPacksEndpoints from '@meeshy/shared/api/endpoints/sticker-packs';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/sticker-packs/:slug */
export const bySlug = (slug: string): string => `/api/v1/sticker-packs/${encodeURIComponent(slug)}`;

/** PUT · DELETE /api/v1/sticker-packs/:slug/install */
export const bySlugInstall = (slug: string): string => `/api/v1/sticker-packs/${encodeURIComponent(slug)}/install`;

/** POST /api/v1/sticker-packs/:slug/review */
export const bySlugReview = (slug: string): string => `/api/v1/sticker-packs/${encodeURIComponent(slug)}/review`;

/** GET /api/v1/sticker-packs/installed */
export const installed = '/api/v1/sticker-packs/installed';

/** GET /api/v1/sticker-packs/pending */
export const pending = '/api/v1/sticker-packs/pending';

/** GET /api/v1/sticker-packs */
export const root = '/api/v1/sticker-packs';

/** GET · POST /api/v1/sticker-packs/submissions */
export const submissions = '/api/v1/sticker-packs/submissions';
