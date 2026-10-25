/**
 * Le domaine `glory-frame` du moteur des packs (#10148, LP0, § 5.10.4–5.10.5) :
 * les cadres de gloire (rangs, prestige, succès, moments), servis par le MÊME
 * moteur que les stickers. Aucun pack communautaire, aucune proposition : le
 * registre officiel est tout le catalogue.
 *
 * Chaque pack dit QUAND ses cadres sont utilisables (`usage`, et par
 * collection) — la loi d'usage des cadres (#10146, `types/frame-usage.ts`) :
 * un cadre de rang ne sert que son rang, un cadre de prestige que le prestige,
 * un cadre libre jamais un succès. Le client affiche ce libellé
 * (`describeFrameUsage`) sur chaque vignette, et l'applique (`canUseFrame`).
 *
 * Le registre est celui de `packages/shared/design/glory-frames/packs.json`
 * (L3, #10154) ; le pack d'exemple s'y ajoute sous `PACK_SAMPLES=1` (staging
 * seulement), sans jamais le remplacer. `removalGuard` est branché par les
 * routes (#10162, L10a, `atmosphereRemovalGuard`) : le pack de l'atmosphère
 * choisie ne se retire pas tant qu'elle l'est (PP7).
 */
import type { FrameUsage } from '@meeshy/shared/types/frame-usage';
import type { PackAssetRef, PackLanguage, PackSummary } from '@meeshy/shared/types/content-pack';
import type { PackIndexEntry } from '@meeshy/shared/types/content-pack-index';
import { servablePackPreview } from '@meeshy/shared/types/glory-frame-atlas';
import { STICKER_PACK_AUTHOR_MEESHY } from '@meeshy/shared/types/sticker-pack';
import type { PackDomainSpec, RegistryPack } from './PackCatalog';
import type { PackIndex } from './PackIndex';

/** Le magasin adressé par contenu (D-P5, servi au L5) : une adresse pour tous les domaines. */
export const PACK_ASSET_PATH = '/api/v1/pack-assets';

export type FramePackSummary = PackSummary & {
  /**
   * L'atlas des vignettes (#10275), servi par `/pack-assets` comme la couverture : le pack se montre
   * sans s'installer. `null` sans atlas, ou au-delà de `PACK_PREVIEW_MAX_BYTES` — `preview` l'est alors aussi.
   */
  readonly previewUrl: string | null;
  /** Quand les cadres de ce pack sont utilisables ; `null` ⇒ nulle part (fail-closed). */
  readonly usage: FrameUsage | null;
};

export type FramePackDetail = FramePackSummary & {
  /** La version de contrat qu'un client doit savoir lire ; sinon « Mettre à jour Meeshy », et rien ne se télécharge. */
  readonly contractSchema: number;
  readonly contract: PackAssetRef;
  readonly strings: { readonly [L in PackLanguage]?: PackAssetRef };
  /** L'usage propre à une collection, quand il remplace celui du pack. */
  readonly collections: readonly { readonly slug: string; readonly usage: FrameUsage | null }[];
};

export function framePackDetail(entry: PackIndexEntry, installed: boolean, itemCount = 0): FramePackDetail {
  const fr = entry.names.fr;
  const preview = servablePackPreview(entry.preview);
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
    preview,
    previewUrl: preview === null ? null : `${PACK_ASSET_PATH}/${preview.src}`,
    usage: entry.usage ?? null,
    contractSchema: entry.contractSchema,
    contract: entry.contract,
    strings: entry.strings,
    collections: (entry.collections ?? []).map(({ slug, usage }) => ({ slug, usage: usage ?? null })),
  };
}

export const framePackSummary = ({ contractSchema: _schema, contract: _contract, strings: _strings, collections: _collections, ...summary }: FramePackDetail): FramePackSummary =>
  summary;

const registryOf = (index: PackIndex): readonly RegistryPack<FramePackDetail>[] =>
  index.entries('glory-frame').map((entry) => ({
    slug: entry.slug,
    installedByDefault: entry.installedByDefault,
    removable: entry.removable,
    hidden: entry.hidden,
    availability: entry.availability,
    targeting: entry.targeting,
    project: (installed: boolean) => framePackDetail(entry, installed, index.itemCount(entry)),
  }));

export type GloryFramePackSpecOptions = {
  readonly index: PackIndex;
  readonly removalGuard?: ((userId: string, slug: string) => Promise<boolean>) | null;
};

export function gloryFramePackSpec(options: GloryFramePackSpecOptions): PackDomainSpec<FramePackSummary, FramePackDetail> {
  return {
    domain: 'glory-frame',
    // Relu à chaque accès : une surcharge d'administration (#11275) s'applique sans redémarrer.
    get registry() {
      return registryOf(options.index);
    },
    community: null,
    removalGuard: options.removalGuard ?? null,
    toSummary: framePackSummary,
  };
}
