import { parseAppearancePackContract } from '@meeshy/shared/types/appearance-design';

import type { DesignPackSummary } from '@/lib/profile-decor/pack-summary';

import type { WallpaperNames, WallpaperPack } from './wallpaper-catalog';

/**
 * **LES PACKS DE FONDS NON EMBARQUÉS** (#10737, spec § 8 et § 9) — un pack
 * `official` hors du JSON embarqué ou un pack tiers (`community`, #10709) se
 * peint depuis son CONTRAT servi, adressé par contenu. Le sélecteur ne montre
 * que ce que le lecteur possède ET a installé ; un contrat absent ou illisible
 * laisse le pack hors de la feuille sans toucher à ses voisins.
 */
export type WallpaperContracts = ReadonlyMap<string, unknown>;

const SERVED_ORDER_BASE = 1000;

const servedPacks = (installed: readonly DesignPackSummary[]): readonly DesignPackSummary[] =>
  installed.filter((pack) => pack.origin !== 'builtin' && pack.installed && pack.owned !== false && pack.contract !== null);

/** Les adresses de contrat que ces packs demandent et que le magasin n'a pas encore. */
export const missingWallpaperContracts = (installed: readonly DesignPackSummary[], loaded: WallpaperContracts): readonly string[] =>
  servedPacks(installed).flatMap((pack) => (pack.contract === null || loaded.has(pack.contract.src) ? [] : [pack.contract.src]));

export function servedWallpaperPacks(installed: readonly DesignPackSummary[], contracts: WallpaperContracts): readonly WallpaperPack[] {
  return servedPacks(installed).flatMap((pack, index) => {
    const contract = parseAppearancePackContract(contracts.get(pack.contract?.src ?? ''));
    if (contract === null || contract.domain !== 'wallpaper') return [];
    return [{ slug: pack.slug, order: SERVED_ORDER_BASE + index, installedByDefault: false, removable: pack.removable, designs: contract.designs }];
  });
}

/** Les noms du pack servi dans la langue du lecteur (repli : le nom français du résumé) ; ceux des modèles retombent sur leur clé. */
export function withServedNames(names: WallpaperNames, installed: readonly DesignPackSummary[], language: string): WallpaperNames {
  const served = Object.fromEntries(
    servedPacks(installed).map((pack) => {
      const own = (pack.names as Readonly<Record<string, { readonly name: string; readonly description: string } | undefined>>)[language];
      return [pack.slug, own ?? { name: pack.name, description: pack.description }] as const;
    }),
  );
  return { ...names, packs: { ...served, ...names.packs } };
}

export function findServedDesign(params: {
  readonly installed: readonly DesignPackSummary[];
  readonly contracts: WallpaperContracts;
  readonly pack: string;
  readonly design: string;
}): ReturnType<typeof servedWallpaperPacks>[number]['designs'][number] | undefined {
  return servedWallpaperPacks(params.installed, params.contracts)
    .find((candidate) => candidate.slug === params.pack)
    ?.designs.find((candidate) => candidate.key === params.design);
}
