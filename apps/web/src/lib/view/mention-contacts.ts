import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { flattenFriendRequests, friendRequestsQueryOptions } from '@/lib/api/friend-requests';
import type { MentionCandidate } from '@/lib/api/mention-suggestions';
import { appQueryClient } from '@/lib/api/query-client';

import { contactMentionCandidates } from './mention-query';

/**
 * LES CONTACTS D'UNE MENTION, CACHE D'ABORD (#7846).
 *
 * Aucun cache neuf : les contacts SONT le panier `accepted` des demandes
 * d'amitié (`friend-requests.ts`), déjà persisté par `query-client.ts` et
 * restauré avant le premier rendu, déjà lu par « Nouvelle conversation » et
 * « Découvrir », déjà invalidé par le temps réel sur les quatre événements
 * d'amitié. Sa projection (`decodePerson`) ne porte que ce que la rangée
 * affiche — identifiant, pseudo, nom, avatar —, jamais la présence.
 *
 * L'observateur ne s'ALLUME qu'à la frappe de `@` (`active`) :
 * - cache FRAIS (moins de `FRIENDS_STALE_TIME`) ⇒ la liste le sert, aucune
 *   requête ne part ;
 * - cache PÉRIMÉ ⇒ il est servi tel quel ET se réchauffe en arrière-plan ;
 * - cache VIDE ⇒ il se charge, et la liste s'y remplit à l'arrivée.
 *
 * Éteint, il lit encore le cache (rien ne part) : un `@` retapé n'attend
 * jamais la réponse qu'un `@` précédent a déjà obtenue.
 */
export function useMentionContacts(input: { readonly active: boolean; readonly selfId: string | null }): readonly MentionCandidate[] {
  const { active, selfId } = input;
  const accepted = useInfiniteQuery(
    { ...friendRequestsQueryOptions(apiDeps, 'accepted'), enabled: active && selfId !== null, notifyOnChangeProps: ['data'] },
    appQueryClient,
  );
  return useMemo(() => contactMentionCandidates(flattenFriendRequests(accepted.data), selfId), [accepted.data, selfId]);
}
