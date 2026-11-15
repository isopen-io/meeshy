import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import { loadCatalogueOf, loadDetailOf, loadInstalledOf, setInstalledOf, type PackDeps, type PackPort } from './packs';
import { decodeDesignPackSummary, type DesignPackSummary } from '@/lib/profile-decor/pack-summary';

/**
 * **LES PACKS DE CONTOURS D'AVATAR** (#10632) — le domaine `avatar-ring` du
 * port générique (`packs.ts`) : `/packs/avatar-ring`. Un ANCIEN serveur répond
 * 404 : boutique vide, sans erreur.
 */

export type AvatarRingPackSummary = DesignPackSummary;

export const decodeAvatarRingPackSummary = decodeDesignPackSummary('avatar-ring');

export const avatarRingPackPort: PackPort<AvatarRingPackSummary, AvatarRingPackSummary, AvatarRingPackSummary> = {
  catalogue: packsEndpoints.avatarRing,
  installed: packsEndpoints.avatarRingInstalled,
  bySlug: packsEndpoints.avatarRingBySlug,
  install: packsEndpoints.avatarRingBySlugInstall,
  decodeSummary: decodeAvatarRingPackSummary,
  decodeInstalled: decodeAvatarRingPackSummary,
  decodeDetail: decodeAvatarRingPackSummary,
  absentMeansEmpty: true,
};

export const loadAvatarRingCatalogue = (deps: PackDeps): Promise<ApiResult<readonly AvatarRingPackSummary[]>> => loadCatalogueOf(avatarRingPackPort, deps);

export const loadInstalledAvatarRingPacks = (deps: PackDeps): Promise<ApiResult<readonly AvatarRingPackSummary[]>> => loadInstalledOf(avatarRingPackPort, deps);

export const loadAvatarRingPack = (deps: PackDeps, slug: string): Promise<ApiResult<AvatarRingPackSummary>> => loadDetailOf(avatarRingPackPort, deps, slug);

export const setAvatarRingPackInstalled = (deps: ConversationsDeps, slug: string, installed: boolean): Promise<ApiResult<AvatarRingPackSummary>> =>
  setInstalledOf(avatarRingPackPort, deps, slug, installed);
