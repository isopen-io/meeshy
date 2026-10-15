/**
 * `ProfileDecor` (#10632, § 5.5) — le contour d'avatar et la bannière de
 * design ÉQUIPÉS sur le profil. Contrairement au fond de conversation, ils
 * sont VISIBLES des autres : un contour se voit, il a la même couleur pour tous.
 *
 * Stockage : `User.equippedAvatarRing` / `User.equippedBanner`, au format
 * `"<pack>/<item>"`. Lecture : `ServedProfileDecor`, tolérante côté clients —
 * un décor illisible n'empêche jamais d'ouvrir un profil.
 */
import * as z from 'zod/mini';
import { PACK_ORIGINS, PACK_SLUG_PATTERN } from './content-pack.js';

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
};

export const EMPTY_PROFILE_DECOR: ServedProfileDecor = { avatarRing: null, banner: null };

const itemOrNull = (input: unknown): ServedProfileDecorItem | null => {
  const parsed = ServedProfileDecorItemSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};

/** Tolérant PAR CÔTÉ : un contour illisible n'emporte pas la bannière. */
export function parseServedProfileDecor(input: unknown): ServedProfileDecor {
  if (typeof input !== 'object' || input === null) return EMPTY_PROFILE_DECOR;
  const record = input as Readonly<Record<string, unknown>>;
  return { avatarRing: itemOrNull(record['avatarRing']), banner: itemOrNull(record['banner']) };
}
