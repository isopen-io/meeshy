import { parseAppearancePackContract, type AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import { parseAvatarRingPackContract, type AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import { parseBannerFramePackContract, type BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import type { ProfileDecorRef, ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { BUILTIN_BANNER_FRAME_PACKS, BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS, builtinBannerDesign, builtinBannerFrameDesign, builtinRingDesign, type BuiltinPack } from './catalog';
import type { DesignPackSummary } from './pack-summary';

/**
 * **RÉSOUDRE UN DÉCOR** (#10632, § 8) — du choix servi (`pack/item` + adresse
 * du contrat) au dessin à peindre. Un `builtin` se lit dans le catalogue
 * EMBARQUÉ, sans réseau ; un `official` se lit dans son contrat, adressé par
 * contenu, déjà chargé (`contracts` : adresse → JSON). Contrat absent ou
 * illisible = `null` : le profil se peint sans décor, jamais en erreur.
 *
 * `ringOptions` / `bannerOptions` disent ce que le sélecteur PROPOSE : les
 * packs installés ET possédés, rien d'autre (§ 9).
 */

export type ContractStore = ReadonlyMap<string, unknown>;

const embedded = (item: ServedProfileDecorItem): boolean => item.origin === 'builtin' || item.contract === null;

export function resolveRing(item: ServedProfileDecorItem | null, contracts: ContractStore): AvatarRingDesign | null {
  if (item === null) return null;
  if (embedded(item)) return builtinRingDesign(item);
  const contract = parseAvatarRingPackContract(contracts.get(item.contract ?? ''));
  return contract?.rings.find((ring) => ring.key === item.item) ?? null;
}

export function resolveBanner(item: ServedProfileDecorItem | null, contracts: ContractStore): AppearanceDesign | null {
  if (item === null) return null;
  if (embedded(item)) return builtinBannerDesign(item);
  const contract = parseAppearancePackContract(contracts.get(item.contract ?? ''));
  return contract?.domain === 'banner' ? (contract.designs.find((design) => design.key === item.item) ?? null) : null;
}

/**
 * Le cadre posé SUR la bannière (#10932, #10935) : un `builtin` se lit dans le
 * catalogue embarqué (#10936), un `official` dans son contrat `banner-frame`.
 */
export function resolveBannerFrame(item: ServedProfileDecorItem | null | undefined, contracts: ContractStore): BannerFrameDesign | null {
  if (item === null || item === undefined) return null;
  if (embedded(item)) return builtinBannerFrameDesign(item);
  const contract = parseBannerFramePackContract(contracts.get(item.contract ?? ''));
  return contract?.frames.find((frame) => frame.key === item.item) ?? null;
}

export type OptionGroup<Design> = {
  readonly pack: string;
  readonly origin: 'builtin' | 'official' | 'community';
  /** L'adresse `<sha16>.json` du contrat d'un pack non embarqué ; `null` pour un `builtin`. */
  readonly contract: string | null;
  readonly items: readonly { readonly ref: ProfileDecorRef; readonly design: Design }[];
};

type OptionParams = { readonly installed: readonly DesignPackSummary[] | undefined; readonly contracts: ContractStore };

const usable = (pack: DesignPackSummary): boolean => pack.installed && pack.owned !== false;

const groupOf = <Design extends { readonly key: string }>(pack: string, origin: OptionGroup<Design>['origin'], contract: string | null, designs: readonly Design[]): OptionGroup<Design>[] =>
  designs.length === 0 ? [] : [{ pack, origin, contract, items: designs.map((design) => ({ ref: { pack, item: design.key }, design })) }];

function optionsOf<Design extends { readonly key: string }>(
  { installed, contracts }: OptionParams,
  builtin: readonly BuiltinPack<Design>[],
  contractDesigns: (raw: unknown) => readonly Design[],
): readonly OptionGroup<Design>[] {
  if (installed === undefined) return builtin.filter((pack) => pack.installedByDefault).flatMap((pack) => groupOf(pack.slug, 'builtin', null, pack.items));
  return installed.filter(usable).flatMap((pack) => {
    if (pack.origin === 'builtin') return groupOf(pack.slug, 'builtin', null, builtin.find((candidate) => candidate.slug === pack.slug)?.items ?? []);
    return groupOf(pack.slug, pack.origin, pack.contract?.src ?? null, pack.contract === null ? [] : contractDesigns(contracts.get(pack.contract.src)));
  });
}

export const ringOptions = (params: OptionParams): readonly OptionGroup<AvatarRingDesign>[] =>
  optionsOf(params, BUILTIN_RING_PACKS, (raw) => parseAvatarRingPackContract(raw)?.rings ?? []);

export const bannerOptions = (params: OptionParams): readonly OptionGroup<AppearanceDesign>[] =>
  optionsOf(params, BUILTIN_BANNER_PACKS, (raw) => {
    const contract = parseAppearancePackContract(raw);
    return contract?.domain === 'banner' ? contract.designs : [];
  });

export const bannerFrameOptions = (params: OptionParams): readonly OptionGroup<BannerFrameDesign>[] =>
  optionsOf(params, BUILTIN_BANNER_FRAME_PACKS, (raw) => parseBannerFramePackContract(raw)?.frames ?? []);
