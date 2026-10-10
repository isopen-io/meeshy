import { useMemo } from 'react';

import { participantAvatarOf } from '@/lib/view/conversation';

type AvatarBearers = Parameters<typeof participantAvatarOf>[0];

type Participant = NonNullable<AvatarBearers> & { readonly id: string; readonly userId?: string | undefined };

export type TypistAvatarOf = (userId: string) => string | undefined;

/** La table `compte → photo` des participants, la photo étant celle de la LOI PARTAGÉE (`participantAvatarOf` : rang local puis rang compte, chaînes blanches normalisées). */
export const typistAvatarLookup = (participants: readonly Participant[] | undefined): TypistAvatarOf => {
  const parParticipant = new Map((participants ?? []).map((p) => [p.userId ?? p.id, participantAvatarOf(p)] as const));
  return (userId) => parParticipant.get(userId) ?? undefined;
};

/**
 * **LA PHOTO D'UN FRAPPEUR** (#6985) — résolue depuis les participants que
 * l'hôte du fil a DÉJÀ en cache, et remise à la cellule de frappe. Le fil
 * `typing:start` ne porte pas d'avatar, et l'y ajouter dupliquerait
 * l'information à chaque frappe de chaque personne.
 *
 * Mémoïsé sur les participants : la cellule n'est pas `memo`-isée, donc
 * l'identité ne change rien à son rendu — mais la CARTE, elle, se
 * reconstruirait à chaque frappe reçue si on ne la retenait pas.
 */
export function useTypistAvatar(participants: readonly Participant[] | undefined): TypistAvatarOf {
  return useMemo(() => typistAvatarLookup(participants), [participants]);
}
