import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import { loadCatalogueOf, loadDetailOf, loadInstalledOf, setInstalledOf, type PackDeps, type PackPort } from './packs';
import { decodeDesignPackSummary, type DesignPackSummary } from '@/lib/profile-decor/pack-summary';

/**
 * **LES PACKS DE BANNIÈRES DE PROFIL** (#10632) — le domaine `banner` du
 * port générique (`packs.ts`) : `/packs/banner`. Un ANCIEN serveur répond
 * 404 : boutique vide, sans erreur.
 */

export type BannerPackSummary = DesignPackSummary;

export const decodeBannerPackSummary = decodeDesignPackSummary('banner');

export const bannerPackPort: PackPort<BannerPackSummary, BannerPackSummary, BannerPackSummary> = {
  catalogue: packsEndpoints.banner,
  installed: packsEndpoints.bannerInstalled,
  bySlug: packsEndpoints.bannerBySlug,
  install: packsEndpoints.bannerBySlugInstall,
  decodeSummary: decodeBannerPackSummary,
  decodeInstalled: decodeBannerPackSummary,
  decodeDetail: decodeBannerPackSummary,
  absentMeansEmpty: true,
};

export const loadBannerCatalogue = (deps: PackDeps): Promise<ApiResult<readonly BannerPackSummary[]>> => loadCatalogueOf(bannerPackPort, deps);

export const loadInstalledBannerPacks = (deps: PackDeps): Promise<ApiResult<readonly BannerPackSummary[]>> => loadInstalledOf(bannerPackPort, deps);

export const loadBannerPack = (deps: PackDeps, slug: string): Promise<ApiResult<BannerPackSummary>> => loadDetailOf(bannerPackPort, deps, slug);

export const setBannerPackInstalled = (deps: ConversationsDeps, slug: string, installed: boolean): Promise<ApiResult<BannerPackSummary>> =>
  setInstalledOf(bannerPackPort, deps, slug, installed);
