import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';

import type { ApiResult } from './http';
import { loadInstalledOf, type PackDeps, type PackPort } from './packs';
import { decodeDesignPackSummary, type DesignPackSummary } from '@/lib/profile-decor/pack-summary';

/**
 * **LES PACKS DE CADRES DE BANNIÈRE** (#10936) — le domaine `banner-frame` du
 * port générique (`packs.ts`) : `/packs/banner-frame`. Un ANCIEN serveur
 * répond 404 : aucun cadre proposé, sans erreur.
 */

export const decodeBannerFramePackSummary = decodeDesignPackSummary('banner-frame');

export const bannerFramePackPort: PackPort<DesignPackSummary, DesignPackSummary, DesignPackSummary> = {
  catalogue: packsEndpoints.bannerFrame,
  installed: packsEndpoints.bannerFrameInstalled,
  bySlug: packsEndpoints.bannerFrameBySlug,
  install: packsEndpoints.bannerFrameBySlugInstall,
  decodeSummary: decodeBannerFramePackSummary,
  decodeInstalled: decodeBannerFramePackSummary,
  decodeDetail: decodeBannerFramePackSummary,
  absentMeansEmpty: true,
};

export const loadInstalledBannerFramePacks = (deps: PackDeps): Promise<ApiResult<readonly DesignPackSummary[]>> => loadInstalledOf(bannerFramePackPort, deps);
