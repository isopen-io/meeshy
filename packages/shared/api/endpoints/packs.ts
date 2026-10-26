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

/** GET /api/v1/packs/avatar-ring */
export const avatarRing = '/api/v1/packs/avatar-ring';

/** GET /api/v1/packs/avatar-ring/:slug */
export const avatarRingBySlug = (slug: string): string => `/api/v1/packs/avatar-ring/${encodeURIComponent(slug)}`;

/** GET /api/v1/packs/avatar-ring/:slug/contract */
export const avatarRingBySlugContract = (slug: string): string => `/api/v1/packs/avatar-ring/${encodeURIComponent(slug)}/contract`;

/** PUT · DELETE /api/v1/packs/avatar-ring/:slug/install */
export const avatarRingBySlugInstall = (slug: string): string => `/api/v1/packs/avatar-ring/${encodeURIComponent(slug)}/install`;

/** POST /api/v1/packs/avatar-ring/:slug/purchase */
export const avatarRingBySlugPurchase = (slug: string): string => `/api/v1/packs/avatar-ring/${encodeURIComponent(slug)}/purchase`;

/** POST /api/v1/packs/avatar-ring/:slug/review */
export const avatarRingBySlugReview = (slug: string): string => `/api/v1/packs/avatar-ring/${encodeURIComponent(slug)}/review`;

/** GET /api/v1/packs/avatar-ring/installed */
export const avatarRingInstalled = '/api/v1/packs/avatar-ring/installed';

/** GET /api/v1/packs/avatar-ring/pending */
export const avatarRingPending = '/api/v1/packs/avatar-ring/pending';

/** GET · POST /api/v1/packs/avatar-ring/submissions */
export const avatarRingSubmissions = '/api/v1/packs/avatar-ring/submissions';

/** GET /api/v1/packs/banner */
export const banner = '/api/v1/packs/banner';

/** GET /api/v1/packs/banner/:slug */
export const bannerBySlug = (slug: string): string => `/api/v1/packs/banner/${encodeURIComponent(slug)}`;

/** GET /api/v1/packs/banner/:slug/contract */
export const bannerBySlugContract = (slug: string): string => `/api/v1/packs/banner/${encodeURIComponent(slug)}/contract`;

/** PUT · DELETE /api/v1/packs/banner/:slug/install */
export const bannerBySlugInstall = (slug: string): string => `/api/v1/packs/banner/${encodeURIComponent(slug)}/install`;

/** POST /api/v1/packs/banner/:slug/purchase */
export const bannerBySlugPurchase = (slug: string): string => `/api/v1/packs/banner/${encodeURIComponent(slug)}/purchase`;

/** POST /api/v1/packs/banner/:slug/review */
export const bannerBySlugReview = (slug: string): string => `/api/v1/packs/banner/${encodeURIComponent(slug)}/review`;

/** GET /api/v1/packs/banner-frame */
export const bannerFrame = '/api/v1/packs/banner-frame';

/** GET /api/v1/packs/banner-frame/:slug */
export const bannerFrameBySlug = (slug: string): string => `/api/v1/packs/banner-frame/${encodeURIComponent(slug)}`;

/** PUT · DELETE /api/v1/packs/banner-frame/:slug/install */
export const bannerFrameBySlugInstall = (slug: string): string => `/api/v1/packs/banner-frame/${encodeURIComponent(slug)}/install`;

/** POST /api/v1/packs/banner-frame/:slug/purchase */
export const bannerFrameBySlugPurchase = (slug: string): string => `/api/v1/packs/banner-frame/${encodeURIComponent(slug)}/purchase`;

/** GET /api/v1/packs/banner-frame/installed */
export const bannerFrameInstalled = '/api/v1/packs/banner-frame/installed';

/** GET /api/v1/packs/banner/installed */
export const bannerInstalled = '/api/v1/packs/banner/installed';

/** GET /api/v1/packs/banner/pending */
export const bannerPending = '/api/v1/packs/banner/pending';

/** GET · POST /api/v1/packs/banner/submissions */
export const bannerSubmissions = '/api/v1/packs/banner/submissions';

/** GET /api/v1/packs/capture-frame */
export const captureFrame = '/api/v1/packs/capture-frame';

/** GET /api/v1/packs/capture-frame/:slug */
export const captureFrameBySlug = (slug: string): string => `/api/v1/packs/capture-frame/${encodeURIComponent(slug)}`;

/** PUT · DELETE /api/v1/packs/capture-frame/:slug/install */
export const captureFrameBySlugInstall = (slug: string): string => `/api/v1/packs/capture-frame/${encodeURIComponent(slug)}/install`;

/** GET /api/v1/packs/capture-frame/installed */
export const captureFrameInstalled = '/api/v1/packs/capture-frame/installed';

/** GET /api/v1/packs/glory-frame */
export const gloryFrame = '/api/v1/packs/glory-frame';

/** GET /api/v1/packs/glory-frame/:slug */
export const gloryFrameBySlug = (slug: string): string => `/api/v1/packs/glory-frame/${encodeURIComponent(slug)}`;

/** PUT · DELETE /api/v1/packs/glory-frame/:slug/install */
export const gloryFrameBySlugInstall = (slug: string): string => `/api/v1/packs/glory-frame/${encodeURIComponent(slug)}/install`;

/** GET /api/v1/packs/glory-frame/installed */
export const gloryFrameInstalled = '/api/v1/packs/glory-frame/installed';

/** GET /api/v1/packs/lens */
export const lens = '/api/v1/packs/lens';

/** GET /api/v1/packs/lens/:slug */
export const lensBySlug = (slug: string): string => `/api/v1/packs/lens/${encodeURIComponent(slug)}`;

/** GET /api/v1/packs/lens/:slug/document */
export const lensBySlugDocument = (slug: string): string => `/api/v1/packs/lens/${encodeURIComponent(slug)}/document`;

/** PUT · DELETE /api/v1/packs/lens/:slug/install */
export const lensBySlugInstall = (slug: string): string => `/api/v1/packs/lens/${encodeURIComponent(slug)}/install`;

/** POST /api/v1/packs/lens/:slug/restore */
export const lensBySlugRestore = (slug: string): string => `/api/v1/packs/lens/${encodeURIComponent(slug)}/restore`;

/** POST /api/v1/packs/lens/:slug/review */
export const lensBySlugReview = (slug: string): string => `/api/v1/packs/lens/${encodeURIComponent(slug)}/review`;

/** POST /api/v1/packs/lens/:slug/withdraw */
export const lensBySlugWithdraw = (slug: string): string => `/api/v1/packs/lens/${encodeURIComponent(slug)}/withdraw`;

/** GET /api/v1/packs/lens/installed */
export const lensInstalled = '/api/v1/packs/lens/installed';

/** GET /api/v1/packs/lens/pending */
export const lensPending = '/api/v1/packs/lens/pending';

/** GET · POST /api/v1/packs/lens/submissions */
export const lensSubmissions = '/api/v1/packs/lens/submissions';

/** GET /api/v1/packs/shop */
export const shop = '/api/v1/packs/shop';

/** GET /api/v1/packs/wallpaper */
export const wallpaper = '/api/v1/packs/wallpaper';

/** GET /api/v1/packs/wallpaper/:slug */
export const wallpaperBySlug = (slug: string): string => `/api/v1/packs/wallpaper/${encodeURIComponent(slug)}`;

/** GET /api/v1/packs/wallpaper/:slug/contract */
export const wallpaperBySlugContract = (slug: string): string => `/api/v1/packs/wallpaper/${encodeURIComponent(slug)}/contract`;

/** PUT · DELETE /api/v1/packs/wallpaper/:slug/install */
export const wallpaperBySlugInstall = (slug: string): string => `/api/v1/packs/wallpaper/${encodeURIComponent(slug)}/install`;

/** POST /api/v1/packs/wallpaper/:slug/purchase */
export const wallpaperBySlugPurchase = (slug: string): string => `/api/v1/packs/wallpaper/${encodeURIComponent(slug)}/purchase`;

/** POST /api/v1/packs/wallpaper/:slug/review */
export const wallpaperBySlugReview = (slug: string): string => `/api/v1/packs/wallpaper/${encodeURIComponent(slug)}/review`;

/** GET /api/v1/packs/wallpaper/installed */
export const wallpaperInstalled = '/api/v1/packs/wallpaper/installed';

/** GET /api/v1/packs/wallpaper/pending */
export const wallpaperPending = '/api/v1/packs/wallpaper/pending';

/** GET · POST /api/v1/packs/wallpaper/submissions */
export const wallpaperSubmissions = '/api/v1/packs/wallpaper/submissions';
