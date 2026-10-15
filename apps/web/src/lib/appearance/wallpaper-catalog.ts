import wallpapers from '@meeshy/shared/design/appearance/wallpapers/designs.json';
import { parseAppearanceDesign, type AppearanceDesign } from '@meeshy/shared/types/appearance-design';

import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES 14 MODÈLES DE FOND, EMBARQUÉS** (#10631, § 6 et § 8) — les quatre packs
 * `builtin` du domaine `wallpaper` : leurs données (quelques Ko) voyagent avec
 * l'application, si bien que le PREMIER rendu d'un fond choisi ne dépend jamais
 * du réseau. Ce module est chargé À LA DEMANDE (`import()` par le fond et par
 * le sélecteur) : le socle du démarrage n'en porte pas un octet.
 *
 * Fail-closed PAR MODÈLE : un dessin que le contrat refuse tombe seul, le pack
 * et ses voisins restent.
 */
export type WallpaperPack = {
  readonly slug: string;
  readonly order: number;
  readonly installedByDefault: boolean;
  readonly removable: boolean;
  readonly designs: readonly AppearanceDesign[];
};

type RawPack = {
  readonly slug: string;
  readonly order: number;
  readonly installedByDefault: boolean;
  readonly removable: boolean;
  readonly designs: readonly unknown[];
};

const designsOf = (raw: readonly unknown[]): readonly AppearanceDesign[] =>
  raw.flatMap((design) => {
    const parsed = parseAppearanceDesign(design);
    return parsed === null ? [] : [parsed];
  });

export const WALLPAPER_PACKS: readonly WallpaperPack[] = (wallpapers.packs as readonly RawPack[])
  .map((pack) => ({
    slug: pack.slug,
    order: pack.order,
    installedByDefault: pack.installedByDefault,
    removable: pack.removable,
    designs: designsOf(pack.designs),
  }))
  .sort((a, b) => a.order - b.order);

export function findWallpaperDesign(pack: string, design: string): AppearanceDesign | undefined {
  return WALLPAPER_PACKS.find((candidate) => candidate.slug === pack)?.designs.find((candidate) => candidate.key === design);
}

/**
 * Les packs MONTRÉS dans le sélecteur : ceux qui sont installés par défaut, plus
 * ceux que la passerelle déclare installés. Un ancien serveur (404) ne déclare
 * rien : le sélecteur se réduit aux Essentiels, jamais à une erreur.
 */
export function visibleWallpaperPacks(installedSlugs: ReadonlySet<string>): readonly WallpaperPack[] {
  return WALLPAPER_PACKS.filter((pack) => pack.installedByDefault || installedSlugs.has(pack.slug));
}

/** Les noms affichés d'un fond (7 langues), tirés des chaînes partagées que lit aussi iOS. */
export type WallpaperNames = {
  readonly packs: Readonly<Record<string, { readonly name: string; readonly description: string }>>;
  readonly designs: Readonly<Record<string, string>>;
  readonly gamut: Readonly<Record<string, string>>;
};

const STRING_LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<{ readonly default: WallpaperNames }>>> = {
  fr: () => import('@meeshy/shared/design/appearance/strings/fr.json'),
  en: () => import('@meeshy/shared/design/appearance/strings/en.json'),
  es: () => import('@meeshy/shared/design/appearance/strings/es.json'),
  pt: () => import('@meeshy/shared/design/appearance/strings/pt.json'),
  de: () => import('@meeshy/shared/design/appearance/strings/de.json'),
  it: () => import('@meeshy/shared/design/appearance/strings/it.json'),
  ar: () => import('@meeshy/shared/design/appearance/strings/ar.json'),
};

export const loadWallpaperNames = (language: InterfaceLanguage): Promise<WallpaperNames> => STRING_LOADERS[language]().then((module) => module.default);
