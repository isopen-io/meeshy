import avatarRingPacks from '@meeshy/shared/design/appearance/avatar-rings/rings.json';
import bannerFramePacks from '@meeshy/shared/design/appearance/banner-frames/frames.json';
import bannerPacks from '@meeshy/shared/design/appearance/banners/designs.json';
import { parseAppearanceDesign, type AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import { parseAvatarRingDesign, type AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import { parseBannerFrameDesign, type BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import type { ProfileDecorRef } from '@meeshy/shared/types/profile-decor';

import type { InterfaceLanguage } from '../interface-language';

/**
 * **LE CATALOGUE EMBARQUÉ DU DÉCOR DE PROFIL** (#10632, § 6 et § 8) — les
 * contours, les bannières et les cadres de bannière (#10936) `builtin`, lus depuis la donnée PARTAGÉE
 * (`packages/shared/design/appearance`) et validés par les contrats Zod : le
 * premier rendu ne dépend jamais du réseau, et un dessin illisible tombe seul.
 * Un pack `official` (non embarqué) se peint depuis son contrat servi
 * (`resolve.ts`).
 */

export type BuiltinPack<Design> = {
  readonly slug: string;
  readonly installedByDefault: boolean;
  readonly removable: boolean;
  readonly items: readonly Design[];
};

type RawPack = { readonly slug: string; readonly installedByDefault: boolean; readonly removable: boolean };

const packsOf = <Design,>(raw: readonly RawPack[], designsOf: (pack: RawPack) => readonly unknown[], parse: (input: unknown) => Design | null): readonly BuiltinPack<Design>[] =>
  raw.map((pack) => ({
    slug: pack.slug,
    installedByDefault: pack.installedByDefault,
    removable: pack.removable,
    items: designsOf(pack).flatMap((design) => {
      const parsed = parse(design);
      return parsed === null ? [] : [parsed];
    }),
  }));

export const BUILTIN_RING_PACKS: readonly BuiltinPack<AvatarRingDesign>[] = packsOf(avatarRingPacks.packs, (pack) => (pack as (typeof avatarRingPacks.packs)[number]).rings, parseAvatarRingDesign);
export const BUILTIN_BANNER_PACKS: readonly BuiltinPack<AppearanceDesign>[] = packsOf(bannerPacks.packs, (pack) => (pack as (typeof bannerPacks.packs)[number]).designs, (design) => parseAppearanceDesign(design, 'banner'));
export const BUILTIN_BANNER_FRAME_PACKS: readonly BuiltinPack<BannerFrameDesign>[] = packsOf(bannerFramePacks.packs, (pack) => (pack as (typeof bannerFramePacks.packs)[number]).frames, parseBannerFrameDesign);

const pick = <Design extends { readonly key: string }>(packs: readonly BuiltinPack<Design>[], ref: ProfileDecorRef): Design | null =>
  packs.find((pack) => pack.slug === ref.pack)?.items.find((item) => item.key === ref.item) ?? null;

export const builtinRingDesign = (ref: ProfileDecorRef): AvatarRingDesign | null => pick(BUILTIN_RING_PACKS, ref);
export const builtinBannerDesign = (ref: ProfileDecorRef): AppearanceDesign | null => pick(BUILTIN_BANNER_PACKS, ref);
export const builtinBannerFrameDesign = (ref: ProfileDecorRef): BannerFrameDesign | null => pick(BUILTIN_BANNER_FRAME_PACKS, ref);

export type AppearanceNames = {
  readonly packs: Readonly<Record<string, { readonly name: string; readonly description: string }>>;
  readonly designs: Readonly<Record<string, string>>;
  readonly rings: Readonly<Record<string, string>>;
  readonly frames: Readonly<Record<string, string>>;
  readonly modes: Readonly<Record<string, string>>;
  readonly avatarUsage: string;
};

type NamesModule = { readonly default: AppearanceNames };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<NamesModule>>> = {
  fr: () => import('@meeshy/shared/design/appearance/strings/fr.json') as Promise<NamesModule>,
  en: () => import('@meeshy/shared/design/appearance/strings/en.json') as Promise<NamesModule>,
  es: () => import('@meeshy/shared/design/appearance/strings/es.json') as Promise<NamesModule>,
  pt: () => import('@meeshy/shared/design/appearance/strings/pt.json') as Promise<NamesModule>,
  de: () => import('@meeshy/shared/design/appearance/strings/de.json') as Promise<NamesModule>,
  it: () => import('@meeshy/shared/design/appearance/strings/it.json') as Promise<NamesModule>,
  ar: () => import('@meeshy/shared/design/appearance/strings/ar.json') as Promise<NamesModule>,
};

const loaded = new Map<InterfaceLanguage, Promise<AppearanceNames>>();

/** Les noms des modèles, des contours et des packs dans la langue d'interface — chargés à la demande, une fois. */
export function appearanceNames(language: InterfaceLanguage): Promise<AppearanceNames> {
  const known = loaded.get(language);
  if (known !== undefined) return known;
  const request = LOADERS[language]().then((module) => module.default);
  loaded.set(language, request);
  request.catch(() => loaded.delete(language));
  return request;
}
