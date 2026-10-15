import { createContext, useContext, useMemo } from 'react';

import type { AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import { parseServedProfileDecor, type ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { hereKeyOf } from '@/lib/view/use-conversation-viewing';

import { useDecorDesigns } from './use-decor-designs';

/**
 * **LE CONTOUR D'UN AUTEUR, HORS PROFIL** (#10713) — la passerelle sert le
 * décor équipé (`profileDecor`, la MÊME forme que sur `/me` et le profil public)
 * avec le participant, en charge ADDITIVE : un participant qui n'en porte pas
 * (ancienne passerelle, anonyme, contour illisible) n'a simplement pas de
 * contour. Les dessins se résolvent comme sur le profil (`useDecorDesigns` :
 * builtin au premier rendu, contrat officiel à son arrivée, jamais d'erreur).
 */

const recordOf = (value: unknown): Readonly<Record<string, unknown>> | null => (typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null);

/** Le contour équipé que porte une personne (un participant, son `user`, ou un auteur) ; `null` si aucun n'est lisible. */
export function servedRingOf(person: unknown): ServedProfileDecorItem | null {
  const record = recordOf(person);
  if (record === null) return null;
  const own = parseServedProfileDecor(record['profileDecor']).avatarRing;
  return own ?? parseServedProfileDecor(recordOf(record['user'])?.['profileDecor']).avatarRing;
}

/** Les contours des participants d'une conversation, sous la clé que l'avatar d'auteur reçoit (`hereKeyOf`). */
export function ringsByAuthor(participants: readonly unknown[] | undefined): ReadonlyMap<string, ServedProfileDecorItem> {
  const rings = new Map<string, ServedProfileDecorItem>();
  for (const participant of participants ?? []) {
    const ring = servedRingOf(participant);
    const key = hereKeyOf(recordOf(participant));
    if (ring !== null && key !== undefined) rings.set(key, ring);
  }
  return rings;
}

const NO_RINGS: ReadonlyMap<string, ServedProfileDecorItem> = new Map();

/** Posé par l'écran de fil, lu par chaque avatar d'auteur. Hors d'un fil : aucun contour. */
export const AuthorRingsContext = createContext<ReadonlyMap<string, ServedProfileDecorItem>>(NO_RINGS);

/** Le dessin du contour servi, à poser sur `Avatar.ring` ; `null` sans contour. */
export function useRingDesign(item: ServedProfileDecorItem | null): AvatarRingDesign | null {
  const decor = useMemo(() => (item === null ? undefined : { avatarRing: item, banner: null }), [item]);
  return useDecorDesigns(decor).ring;
}

export function useAuthorRing(authorId: string | undefined): AvatarRingDesign | null {
  const rings = useContext(AuthorRingsContext);
  return useRingDesign(authorId === undefined ? null : (rings.get(authorId) ?? null));
}
