/**
 * Les domaines `wallpaper`, `banner`, `avatar-ring` et `banner-frame` du moteur
 * des packs (#10632, § 3 et § 5.3 ; #10936) : fonds de conversation, bannières
 * de profil, contours d'avatar et cadres posés sur la bannière, servis par le
 * MÊME moteur que les stickers et les cadres de gloire.
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
import type { PackAvailability } from '@meeshy/shared/types/pack-availability';
import { STICKER_PACK_AUTHOR_MEESHY } from '@meeshy/shared/types/sticker-pack';
import type { CommunityPackStore, PackDomainSpec, RegistryPack } from './PackCatalog';
import type { PackIndex } from './PackIndex';
import { PACK_ASSET_PATH } from './gloryFramePackSpec';

export const APPEARANCE_PACK_DOMAINS = ['wallpaper', 'avatar-ring', 'banner', 'banner-frame'] as const satisfies readonly PackDomain[];
export type AppearancePackDomain = (typeof APPEARANCE_PACK_DOMAINS)[number];

export const isAppearancePackDomain = (value: string): value is AppearancePackDomain =>
  (APPEARANCE_PACK_DOMAINS as readonly string[]).includes(value);

export type AppearancePackSummary = PackSummary & {
  /** Contours et cadres de bannière : où le cadre est utilisable (`avatar`, `banner`). `null` ⇒ nulle part. */
  readonly usage?: FrameUsage | null;
  /** La fenêtre d'offre (#11274), pour dire « jusqu'au … » ; absente = toujours offert. */
  readonly availability?: PackAvailability;
};

export type AppearancePackDetail = AppearancePackSummary & {
  readonly contractSchema: number;
  readonly contract: PackAssetRef;
  readonly strings: { readonly [L in PackLanguage]?: PackAssetRef };
};

/** Les domaines dont un pack annonce sa loi d'usage : ce sont des CADRES. */
const FRAMED_DOMAINS: ReadonlySet<PackDomain> = new Set<PackDomain>(['avatar-ring', 'banner-frame']);

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
    ...(entry.availability === undefined ? {} : { availability: entry.availability }),
    ...(FRAMED_DOMAINS.has(entry.domain) ? { usage: entry.usage ?? null } : {}),
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
    reward: entry.reward,
    version: entry.version,
    availability: entry.availability,
    targeting: entry.targeting,
    project: (installed: boolean, owned: boolean) => appearancePackDetail(entry, installed, owned, index.itemCount(entry)),
  }));

export function appearancePackSpec(options: {
  readonly index: PackIndex;
  readonly domain: AppearancePackDomain;
  /** Les packs de vendeurs tiers publiés (#10709) ; absent = catalogue officiel seul. */
  readonly community?: CommunityPackStore<AppearancePackDetail>;
}): PackDomainSpec<AppearancePackSummary, AppearancePackDetail> {
  // Le registre se RELIT à chaque accès : une surcharge d'administration (#11275) s'applique sans redémarrer.
  return {
    domain: options.domain,
    get registry() {
      return registryOf(options.index, options.domain);
    },
    community: options.community ?? null,
    removalGuard: null,
    toSummary: appearancePackSummary,
  };
}
