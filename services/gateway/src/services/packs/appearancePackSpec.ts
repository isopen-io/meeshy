/**
 * Les domaines `wallpaper`, `banner` et `avatar-ring` du moteur des packs
 * (#10632, § 3 et § 5.3) : fonds de conversation, bannières de profil et
 * contours d'avatar, servis par le MÊME moteur que les stickers et les cadres.
 *
 * Un pack porte des DONNÉES vectorielles (`AppearanceDesign`,
 * `AvatarRingDesign`) validées par Zod — jamais un SVG brut. Il peut porter un
 * prix en Meeshes (`price`) ; le résumé dit alors s'il est possédé (`owned`),
 * la loi de possession étant `isPackOwned`. Les quatre packs de fonds, le pack
 * de bannières et celui de contours sont `builtin` : embarqués dans les
 * clients, gratuits. Un pack d'exemple PAYANT `official` n'existe que sous
 * `PACK_SAMPLES=1`.
 */
import type { FrameUsage } from '@meeshy/shared/types/frame-usage';
import type { PackAssetRef, PackDomain, PackLanguage, PackSummary } from '@meeshy/shared/types/content-pack';
import type { PackIndexEntry } from '@meeshy/shared/types/content-pack-index';
import { STICKER_PACK_AUTHOR_MEESHY } from '@meeshy/shared/types/sticker-pack';
import type { PackDomainSpec, RegistryPack } from './PackCatalog';
import type { PackIndex } from './PackIndex';
import { PACK_ASSET_PATH } from './gloryFramePackSpec';

export const APPEARANCE_PACK_DOMAINS = ['wallpaper', 'avatar-ring', 'banner'] as const satisfies readonly PackDomain[];
export type AppearancePackDomain = (typeof APPEARANCE_PACK_DOMAINS)[number];

export const isAppearancePackDomain = (value: string): value is AppearancePackDomain =>
  (APPEARANCE_PACK_DOMAINS as readonly string[]).includes(value);

export type AppearancePackSummary = PackSummary & {
  /** Contours seulement : quand le cadre est utilisable (`avatar`). `null` ⇒ nulle part. */
  readonly usage?: FrameUsage | null;
};

export type AppearancePackDetail = AppearancePackSummary & {
  readonly contractSchema: number;
  readonly contract: PackAssetRef;
  readonly strings: { readonly [L in PackLanguage]?: PackAssetRef };
};

export function appearancePackDetail(entry: PackIndexEntry, installed: boolean, owned: boolean, itemCount = 0): AppearancePackDetail {
  const fr = entry.names.fr;
  return {
    slug: entry.slug,
    name: fr?.name ?? entry.slug,
    description: fr?.description ?? '',
    author: STICKER_PACK_AUTHOR_MEESHY,
    builtin: entry.origin === 'builtin',
    status: 'approved',
    itemCount,
    coverUrl: `${PACK_ASSET_PATH}/${entry.cover.src}`,
    installed,
    installCount: 0,
    domain: entry.domain,
    origin: entry.origin,
    version: entry.version,
    downloadBytes: { story: entry.downloadBytes.story, square: entry.downloadBytes.square ?? null },
    removable: entry.removable,
    names: entry.names,
    price: entry.price ?? null,
    owned,
    preview: entry.preview,
    ...(entry.domain === 'avatar-ring' ? { usage: entry.usage ?? null } : {}),
    contractSchema: entry.contractSchema,
    contract: entry.contract,
    strings: entry.strings,
  };
}

export const appearancePackSummary = ({ contractSchema: _schema, contract: _contract, strings: _strings, ...summary }: AppearancePackDetail): AppearancePackSummary => summary;

const registryOf = (index: PackIndex, domain: AppearancePackDomain): readonly RegistryPack<AppearancePackDetail>[] =>
  index.entries(domain).map((entry) => ({
    slug: entry.slug,
    installedByDefault: entry.installedByDefault,
    removable: entry.removable,
    hidden: entry.hidden,
    price: entry.price,
    version: entry.version,
    project: (installed: boolean, owned: boolean) => appearancePackDetail(entry, installed, owned, index.itemCount(entry)),
  }));

export function appearancePackSpec(options: { readonly index: PackIndex; readonly domain: AppearancePackDomain }): PackDomainSpec<AppearancePackSummary, AppearancePackDetail> {
  return { domain: options.domain, registry: registryOf(options.index, options.domain), community: null, removalGuard: null, toSummary: appearancePackSummary };
}
