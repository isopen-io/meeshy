/**
 * Les packs d'APPARENCE — `/packs/wallpaper`, `/packs/avatar-ring`,
 * `/packs/banner`, `/packs/banner-frame` (#10632, § 3 et § 4 ; #10936) : fonds
 * de conversation, contours d'avatar, bannières de profil et cadres posés sur
 * la bannière, par le MÊME moteur que les stickers et les cadres de gloire. Un
 * montage PAR DOMAINE, jamais un `:domain`.
 *
 *   - `GET    /`                  la boutique ;      `GET /installed` les packs installés ;
 *   - `GET    /:slug`             un pack, son contrat et ses chaînes ;
 *   - `PUT    /:slug/install`     l'installer (403 `PACK_NOT_OWNED` si payant non possédé) ; `DELETE` le retirer ;
 *   - `POST   /:slug/purchase`    l'acheter en Meeshes, idempotent par `requestId`.
 *
 * Les quatre packs de fonds, celui de bannières et celui de contours sont
 * `builtin` (embarqués) ; le registre est lu au démarrage (`PackIndex`).
 *
 * Les VENDEURS TIERS (#10709) proposent, par `POST /submissions`, des packs
 * `community` que la modération publie (`packs-appearance-community.ts`) — sur
 * les seuls domaines de `COMMUNITY_APPEARANCE_DOMAINS` : un cadre de bannière
 * n'a pas de vitrine tierce.
 */
import type { FastifyInstance } from 'fastify';
import { PACK_DOMAINS } from '@meeshy/shared/types/content-pack';
import { isCommunityAppearanceDomain } from '@meeshy/shared/types/community-appearance-pack';

import { PackCatalog } from '../services/packs/PackCatalog';
import { startupPackIndex, type PackIndex } from '../services/packs/PackIndex';
import { CommunityAppearancePacks, prismaCommunityAppearanceStore } from '../services/packs/CommunityAppearancePacks';
import { appearancePackSpec, type AppearancePackDetail, type AppearancePackDomain, type AppearancePackSummary } from '../services/packs/appearancePackSpec';
import { framePackDetailJsonSchema, framePackSummaryJsonSchema } from './packs-glory-frame';
import { packInstallationBroadcaster, packRouteGuard, registerPackPurchaseRoute, registerPackRoutes } from './pack-routes';
import { registerCommunityAppearanceRoutes } from './packs-appearance-community';

export const APPEARANCE_PACK_ERROR_CODES = { NOT_FOUND: 'PACK_NOT_FOUND', NOT_REMOVABLE: 'PACK_NOT_REMOVABLE' } as const;

const appearanceSummaryProperties = {
  ...framePackSummaryJsonSchema.properties,
  domain: { type: 'string', enum: [...PACK_DOMAINS] },
  price: { type: 'integer', nullable: true, description: 'Prix en Meeshes ; null = gratuit' },
  owned: { type: 'boolean', description: 'Gratuit ⇒ true ; payant ⇒ possession enregistrée' },
} as const;

export const appearancePackSummaryJsonSchema = { type: 'object', additionalProperties: false, properties: appearanceSummaryProperties } as const;

export const appearancePackDetailJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...appearanceSummaryProperties,
    reviewNote: { type: 'string', nullable: true },
    contractSchema: framePackDetailJsonSchema.properties.contractSchema,
    contract: framePackDetailJsonSchema.properties.contract,
    strings: framePackDetailJsonSchema.properties.strings,
  },
} as const;

export type AppearancePacksRoutesOptions = {
  readonly catalog?: PackCatalog<AppearancePackSummary, AppearancePackDetail>;
  readonly index?: PackIndex;
  readonly community?: CommunityAppearancePacks;
};

const LABELS: Readonly<Record<AppearancePackDomain, { readonly one: string; readonly many: string }>> = {
  wallpaper: { one: 'wallpaper', many: 'conversation wallpapers' },
  'avatar-ring': { one: 'avatar ring', many: 'avatar rings' },
  banner: { one: 'profile banner', many: 'profile banners' },
  'banner-frame': { one: 'banner frame', many: 'banner frames' },
};

export function appearancePacksPlugin(domain: AppearancePackDomain) {
  return async function appearancePacksRoutes(fastify: FastifyInstance, options: AppearancePacksRoutesOptions = {}) {
    const index = options.index ?? startupPackIndex();
    const catalog =
      options.catalog ??
      new PackCatalog({
        prisma: fastify.prisma,
        spec: appearancePackSpec({ index, domain, ...(isCommunityAppearanceDomain(domain) ? { community: prismaCommunityAppearanceStore(fastify.prisma, domain) } : {}) }),
        broadcast: packInstallationBroadcaster(fastify),
      });
    const community = options.community ?? new CommunityAppearancePacks({ prisma: fastify.prisma, index });
    const guard = packRouteGuard(fastify, { internalErrorMessage: `Error handling ${LABELS[domain].many} packs` });
    const basePath = `/packs/${domain}`;
    const notFound = { message: 'Pack not found', code: APPEARANCE_PACK_ERROR_CODES.NOT_FOUND };

    registerPackRoutes(fastify, {
      catalog,
      guard,
      basePath,
      tags: ['packs'],
      summaryJsonSchema: appearancePackSummaryJsonSchema,
      detailJsonSchema: appearancePackDetailJsonSchema,
      notFound,
      notRemovable: { message: 'This pack cannot be removed', code: APPEARANCE_PACK_ERROR_CODES.NOT_REMOVABLE },
      texts: {
        list: { description: `La boutique des packs de ${LABELS[domain].many} (#10632) : prix, possession et état d'installation.`, summary: `List ${LABELS[domain].one} packs` },
        installed: { description: `Les packs de ${LABELS[domain].many} installés par l'appelant (#10632).`, summary: `List my installed ${LABELS[domain].one} packs` },
        detail: { description: `Un pack de ${LABELS[domain].many} (#10632) : son contrat et ses chaînes adressés par contenu.`, summary: `Get a ${LABELS[domain].one} pack` },
        install: { description: `Installe un pack de ${LABELS[domain].many} (#10632). 403 PACK_NOT_OWNED pour un pack payant non possédé.`, summary: `Install a ${LABELS[domain].one} pack` },
        uninstall: { description: `Retire un pack de ${LABELS[domain].many} (#10632). 409 PACK_NOT_REMOVABLE pour un pack non retirable.`, summary: `Uninstall a ${LABELS[domain].one} pack` },
      },
    });
    if (isCommunityAppearanceDomain(domain)) registerCommunityAppearanceRoutes(fastify, { domain, guard, packs: community, detailJsonSchema: appearancePackDetailJsonSchema });
    registerPackPurchaseRoute(fastify, { catalog, guard, basePath, tags: ['packs'], summaryJsonSchema: appearancePackSummaryJsonSchema, notFound });
  };
}

export const wallpaperPacksRoutes = appearancePacksPlugin('wallpaper');
export const avatarRingPacksRoutes = appearancePacksPlugin('avatar-ring');
export const bannerPacksRoutes = appearancePacksPlugin('banner');
export const bannerFramePacksRoutes = appearancePacksPlugin('banner-frame');
