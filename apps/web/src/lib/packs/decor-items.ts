import { parseAppearancePackContract, type AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import { parseAvatarRingPackContract, type AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import { parseBannerFramePackContract, type BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { WALLPAPER_PACKS } from '@/lib/appearance/wallpaper-catalog';
import { BUILTIN_BANNER_FRAME_PACKS, BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS } from '@/lib/profile-decor/catalog';
import type { DecorSide } from '@/lib/profile-decor/equip';

import type { DecorDomain } from './decor-domains';

/**
 * **LES ÉLÉMENTS D'UN PACK DE DÉCOR** (#16267) — ce que la fiche d'un pack et
 * son plein écran montrent : les contours, bannières, cadres de bannière et
 * fonds d'un pack, lus dans le catalogue EMBARQUÉ (aucun réseau) ou, pour un
 * pack qui n'y est pas, dans son contrat servi (adressé par contenu). Un
 * contrat illisible ou d'un autre domaine ne donne aucun élément, jamais une
 * erreur. Module pur : le chargement vit dans `use-pack-items.ts`.
 */

export { DECOR_DOMAINS, isDecorDomain, type DecorDomain } from './decor-domains';

type DesignOf = {
  readonly 'avatar-ring': AvatarRingDesign;
  readonly banner: AppearanceDesign;
  readonly 'banner-frame': BannerFrameDesign;
  readonly wallpaper: AppearanceDesign;
};

export type DecorItem = {
  [D in DecorDomain]: { readonly domain: D; readonly pack: string; readonly key: string; readonly design: DesignOf[D] };
}[DecorDomain];

const itemsOf = <D extends DecorDomain>(domain: D, pack: string, designs: readonly DesignOf[D][]): readonly DecorItem[] =>
  designs.map((design) => ({ domain, pack, key: design.key, design }) as DecorItem);

const EMBEDDED: { readonly [D in DecorDomain]: (slug: string) => readonly DesignOf[D][] | undefined } = {
  'avatar-ring': (slug) => BUILTIN_RING_PACKS.find((pack) => pack.slug === slug)?.items,
  banner: (slug) => BUILTIN_BANNER_PACKS.find((pack) => pack.slug === slug)?.items,
  'banner-frame': (slug) => BUILTIN_BANNER_FRAME_PACKS.find((pack) => pack.slug === slug)?.items,
  wallpaper: (slug) => WALLPAPER_PACKS.find((pack) => pack.slug === slug)?.designs,
};

/** Les éléments d'un pack embarqué ; `null` s'il ne l'est pas (il se lira dans son contrat). */
export function embeddedDecorItems(domain: DecorDomain, slug: string): readonly DecorItem[] | null {
  const designs = EMBEDDED[domain](slug);
  return designs === undefined ? null : itemsOf(domain, slug, designs);
}

const appearanceDesigns = (raw: unknown, surface: 'banner' | 'wallpaper'): readonly AppearanceDesign[] => {
  const contract = parseAppearancePackContract(raw);
  return contract?.domain === surface ? contract.designs : [];
};

const CONTRACT: { readonly [D in DecorDomain]: (raw: unknown) => readonly DesignOf[D][] } = {
  'avatar-ring': (raw) => parseAvatarRingPackContract(raw)?.rings ?? [],
  banner: (raw) => appearanceDesigns(raw, 'banner'),
  'banner-frame': (raw) => parseBannerFramePackContract(raw)?.frames ?? [],
  wallpaper: (raw) => appearanceDesigns(raw, 'wallpaper'),
};

export function contractDecorItems(domain: DecorDomain, slug: string, raw: unknown): readonly DecorItem[] {
  return itemsOf(domain, slug, CONTRACT[domain](raw));
}

export function isAnimatedDecor(item: DecorItem): boolean {
  if (item.design.lottie !== undefined) return true;
  return 'motion' in item.design && (item.design.motion?.length ?? 0) > 0;
}

export type DecorPackState = 'embedded' | 'installed' | 'download';

export function decorPackState({ embedded, installed }: { readonly embedded: boolean; readonly installed: boolean }): DecorPackState {
  if (embedded) return 'embedded';
  return installed ? 'installed' : 'download';
}

/** L'alternative voisine, en faisant le tour du pack. */
export function stepIndex({ count, current, delta }: { readonly count: number; readonly current: number; readonly delta: number }): number {
  if (count <= 0) return 0;
  return (((current + delta) % count) + count) % count;
}

/** Les éléments des AUTRES packs du même domaine, dans l'ordre reçu, bornés. */
export function otherProposals(params: {
  readonly domain: DecorDomain;
  readonly pack: string;
  readonly candidates: readonly DecorItem[];
  readonly limit: number;
}): readonly DecorItem[] {
  return params.candidates.filter((item) => item.domain === params.domain && item.pack !== params.pack).slice(0, params.limit);
}

const SIDES: { readonly [D in DecorDomain]: DecorSide | null } = {
  'avatar-ring': 'avatarRing',
  banner: 'banner',
  'banner-frame': 'bannerFrame',
  wallpaper: null,
};

/**
 * Ce que `equipProfileDecor` reçoit pour cet élément. Un fond se choisit PAR
 * conversation (« Fond et couleur ») : la boutique ne l'équipe pas, `null`.
 */
export function equipChoiceOf(item: DecorItem, contract: string | null): { readonly side: DecorSide; readonly choice: ServedProfileDecorItem } | null {
  const side = SIDES[item.domain];
  if (side === null) return null;
  return { side, choice: { pack: item.pack, item: item.key, origin: contract === null ? 'builtin' : 'official', contract } };
}
