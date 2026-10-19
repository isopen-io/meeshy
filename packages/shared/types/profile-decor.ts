/**
 * `ProfileDecor` (#10632, § 5.5) — le contour d'avatar, la bannière de design
 * et le cadre de bannière ÉQUIPÉS sur le profil. Contrairement au fond de
 * conversation, ils sont VISIBLES des autres : un contour se voit, il a la même
 * couleur pour tous.
 *
 * Trois côtés (#10932) : `banner` est le FOND (il s'affiche sans photo),
 * `bannerFrame` le CADRE posé SUR la photo ou le fond, centre transparent.
 *
 * Stockage : `User.equippedAvatarRing` / `User.equippedBanner` /
 * `User.equippedBannerFrame`, au format `"<pack>/<item>"`. Lecture :
 * `ServedProfileDecor`, tolérante PAR CÔTÉ — un décor illisible n'empêche jamais
 * d'ouvrir un profil, et un ancien serveur (sans `bannerFrame`) se lit `null`.
 *
 * @see schema.prisma — `User.equippedBannerFrame`
 */
import * as z from 'zod/mini';
import { PACK_ORIGINS, PACK_SLUG_PATTERN, type PackDomain } from './content-pack.js';

export const PROFILE_DECOR_SIDES = ['avatarRing', 'banner', 'bannerFrame'] as const;
export type ProfileDecorSide = (typeof PROFILE_DECOR_SIDES)[number];

/** Le domaine de pack de chaque côté : on n'équipe un côté qu'avec un modèle de SON domaine. */
export const PROFILE_DECOR_SIDE_DOMAIN: Readonly<Record<ProfileDecorSide, PackDomain>> = {
  avatarRing: 'avatar-ring',
  banner: 'banner',
  bannerFrame: 'banner-frame',
};

export type ProfileDecorRef = { readonly pack: string; readonly item: string };

const slug = z.string().check(z.regex(PACK_SLUG_PATTERN), z.maxLength(24));

export const ProfileDecorRefSchema = z.object({ pack: slug, item: slug });

export const formatProfileDecorRef = (ref: ProfileDecorRef): string => `${ref.pack}/${ref.item}`;

export function parseProfileDecorRef(stored: unknown): ProfileDecorRef | null {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('/');
  if (parts.length !== 2) return null;
  const parsed = ProfileDecorRefSchema.safeParse({ pack: parts[0], item: parts[1] });
  return parsed.success ? parsed.data : null;
}

const ServedProfileDecorItemSchema = z.object({
  pack: slug,
  item: slug,
  origin: z.enum(PACK_ORIGINS),
  /** L'adresse `<sha16>.json` du contrat ; `null` pour un builtin embarqué dans les clients. */
  contract: z.nullable(z.string().check(z.regex(/^[0-9a-f]{16}\.json$/))),
});
export type ServedProfileDecorItem = z.infer<typeof ServedProfileDecorItemSchema>;

export type ServedProfileDecor = {
  readonly avatarRing: ServedProfileDecorItem | null;
  readonly banner: ServedProfileDecorItem | null;
  /** Absent = un décor composé avant le cadre de bannière (#10932) ; `parseServedProfileDecor` le rend toujours, `null` sans cadre. */
  readonly bannerFrame?: ServedProfileDecorItem | null;
};

export const EMPTY_PROFILE_DECOR: ServedProfileDecor = { avatarRing: null, banner: null, bannerFrame: null };

const itemOrNull = (input: unknown): ServedProfileDecorItem | null => {
  const parsed = ServedProfileDecorItemSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

/** Tolérant PAR CÔTÉ : un contour illisible n'emporte pas la bannière. */
export function parseServedProfileDecor(input: unknown): ServedProfileDecor {
  if (typeof input !== 'object' || input === null) return EMPTY_PROFILE_DECOR;
  const record = input as Readonly<Record<string, unknown>>;
  return { avatarRing: itemOrNull(record['avatarRing']), banner: itemOrNull(record['banner']), bannerFrame: itemOrNull(record['bannerFrame']) };
}

/**
 * Le décor que PORTE une personne dans un résumé (#10713, #10945) — auteur de
 * post, de commentaire, de message, participant, résultat de recherche,
 * contact : le contour seul, c'est lui que les avatars dessinent. La clé
 * `profileDecor` est ABSENTE sans contour (charge additive).
 */
export type PersonProfileDecor = { readonly avatarRing: ServedProfileDecorItem };

export function parsePersonProfileDecor(input: unknown): PersonProfileDecor | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const avatarRing = itemOrNull((input as Readonly<Record<string, unknown>>)['avatarRing']);
  return avatarRing === null ? undefined : { avatarRing };
}
