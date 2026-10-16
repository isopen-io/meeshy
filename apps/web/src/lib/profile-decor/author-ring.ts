import { createContext, useContext, useMemo } from 'react';

import type { AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { hereKeyOf } from '@/lib/view/use-conversation-viewing';

import { recordOf, servedRingOf } from './served-ring';
import { useDecorDesigns } from './use-decor-designs';

export { servedRingOf };

/**
 * **LE CONTOUR D'UN AUTEUR, HORS PROFIL** (#10713) — la passerelle sert le
 * décor équipé (`profileDecor`, la MÊME forme que sur `/me` et le profil public)
 * avec le participant, en charge ADDITIVE : un participant qui n'en porte pas
 * (ancienne passerelle, anonyme, contour illisible) n'a simplement pas de
 * contour. Les dessins se résolvent comme sur le profil (`useDecorDesigns` :
 * builtin au premier rendu, contrat officiel à son arrivée, jamais d'erreur).
 */

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

/**
 * Le contour d'un auteur du fil : celui des participants de la conversation
 * d'abord (le plus frais), sinon celui servi AVEC son message
 * (`sender.profileDecor`, liste et `message:new`) — un auteur hors des
 * participants chargés (au plus 100 dans la fiche) garde ainsi le sien.
 */
export function useAuthorRing(authorId: string | undefined, sender?: unknown): AvatarRingDesign | null {
  const rings = useContext(AuthorRingsContext);
  const carried = useMemo(() => servedRingOf(sender), [sender]);
  return useRingDesign((authorId === undefined ? undefined : rings.get(authorId)) ?? carried);
}
