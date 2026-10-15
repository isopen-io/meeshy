/**
 * La PROPOSITION d'un pack d'apparence par un vendeur tiers (#10709, spec
 * § 12) : fonds de conversation, contours d'avatar, bannières de profil.
 *
 * Le contenu proposé est un CONTRAT de données — jamais un SVG ni un fichier :
 * la porte d'entrée est le MÊME Zod que les packs officiels
 * (`AppearancePackContractSchema`, `AvatarRingPackContractSchema` : hex,
 * chemins aux seules commandes SVG, plafonds de longueur et de densité).
 * Ce que le Zod ne dit pas, cette porte l'ajoute pour un tiers :
 *   - aucune couche animée (`lottie`) : elle désigne un fichier du magasin, et
 *     un tiers n'en téléverse aucun — l'accepter laisserait un tiers pointer un
 *     fichier arbitraire ;
 *   - le contrat qui sort est la copie RE-SÉRIALISÉE de ce que le schéma a lu
 *     (les clés inconnues sont tombées), jamais les octets reçus ;
 *   - un plafond d'octets sur le contrat entier.
 */
import { PACK_LIMITS, PACK_SLUG_PATTERN } from './content-pack.js';
import { STICKER_PACK_AUTHOR_MEESHY } from './sticker-pack.js';
import { AppearancePackContractSchema, APPEARANCE_CONTRACT_SCHEMA } from './appearance-design.js';
import { AvatarRingPackContractSchema } from './avatar-ring-design.js';

export const COMMUNITY_APPEARANCE_DOMAINS = ['wallpaper', 'avatar-ring', 'banner'] as const;
export type CommunityAppearanceDomain = (typeof COMMUNITY_APPEARANCE_DOMAINS)[number];

export const isCommunityAppearanceDomain = (value: unknown): value is CommunityAppearanceDomain =>
  typeof value === 'string' && (COMMUNITY_APPEARANCE_DOMAINS as readonly string[]).includes(value);

export const COMMUNITY_APPEARANCE_LIMITS = {
  /** Le contrat sérialisé : très au-dessus d'un pack officiel (≈ 30 Ko), très en dessous d'une charge abusive. */
  maxContractBytes: 262_144,
  maxPendingPerAuthor: PACK_LIMITS.maxPendingPerAuthor,
} as const;

export type CommunityAppearanceProblemCode =
  | 'not-an-object'
  | 'domain-mismatch'
  | 'slug'
  | 'name'
  | 'description'
  | 'author'
  | 'contract'
  | 'lottie-forbidden'
  | 'contract-too-large';

export type CommunityAppearanceProblem = { readonly path: string; readonly code: CommunityAppearanceProblemCode };

export type CommunityAppearanceManifest = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  /** Le contrat tel que relu par le schéma, sérialisé : les octets qui seront adressés et servis. */
  readonly contractJson: string;
  readonly itemKeys: readonly string[];
  readonly contractSchema: number;
};

export type CommunityAppearanceValidation =
  | { readonly manifest: CommunityAppearanceManifest }
  | { readonly problems: readonly CommunityAppearanceProblem[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number, allowEmpty: boolean): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > max || (!allowEmpty && trimmed.length === 0)) return null;
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f<>]/.test(trimmed) ? null : trimmed;
};

type Parsed = { readonly data: { readonly designs?: readonly { readonly key: string; readonly lottie?: unknown }[]; readonly rings?: readonly { readonly key: string; readonly lottie?: unknown }[] } };

const parseContract = (domain: CommunityAppearanceDomain, input: unknown): Parsed | null => {
  if (domain === 'avatar-ring') {
    const parsed = AvatarRingPackContractSchema.safeParse(input);
    return parsed.success ? { data: parsed.data } : null;
  }
  const parsed = AppearancePackContractSchema.safeParse(input);
  return parsed.success && parsed.data.domain === domain ? { data: parsed.data } : null;
};

export function validateCommunityAppearanceManifest(domain: CommunityAppearanceDomain, input: unknown): CommunityAppearanceValidation {
  if (!isRecord(input)) return { problems: [{ path: '', code: 'not-an-object' }] };
  const problems: CommunityAppearanceProblem[] = [];
  const slug = typeof input.slug === 'string' && input.slug.length <= PACK_LIMITS.maxSlugLength && PACK_SLUG_PATTERN.test(input.slug) ? input.slug : null;
  if (slug === null) problems.push({ path: 'slug', code: 'slug' });
  const name = text(input.name, PACK_LIMITS.maxNameLength, false);
  if (name === null) problems.push({ path: 'name', code: 'name' });
  const description = text(input.description ?? '', PACK_LIMITS.maxDescriptionLength, true);
  if (description === null) problems.push({ path: 'description', code: 'description' });
  const author = text(input.author, PACK_LIMITS.maxAuthorLength, false);
  if (author === null || author.toLowerCase() === STICKER_PACK_AUTHOR_MEESHY.toLowerCase()) problems.push({ path: 'author', code: 'author' });
  if (isRecord(input.contract) && input.contract.domain !== domain) problems.push({ path: 'contract.domain', code: 'domain-mismatch' });

  const parsed = problems.some((problem) => problem.code === 'domain-mismatch') ? null : parseContract(domain, input.contract);
  if (parsed === null) {
    if (!problems.some((problem) => problem.code === 'domain-mismatch')) problems.push({ path: 'contract', code: 'contract' });
    return { problems };
  }
  const items = parsed.data.designs ?? parsed.data.rings ?? [];
  if (items.some((item) => item.lottie !== undefined)) problems.push({ path: 'contract', code: 'lottie-forbidden' });
  const contractJson = JSON.stringify(parsed.data);
  if (new TextEncoder().encode(contractJson).length > COMMUNITY_APPEARANCE_LIMITS.maxContractBytes) problems.push({ path: 'contract', code: 'contract-too-large' });
  if (problems.length > 0 || slug === null || name === null || description === null || author === null) return { problems };
  return { manifest: { slug, name, description, author, contractJson, itemKeys: items.map((item) => item.key), contractSchema: APPEARANCE_CONTRACT_SCHEMA } };
}
