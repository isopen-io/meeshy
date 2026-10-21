import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';
import { useColorScheme } from '@/lib/use-color-scheme';

/** La liste (`['conversations']`) ou la fiche (`['conversations', id]`) — jamais une page de messages (`['conversations', id, 'messages']`). */
const carriesPreferences = (key: readonly unknown[]): boolean => key[0] === CONVERSATIONS_QUERY_KEY[0] && key.length <= 2;

/**
 * LES PRÉFÉRENCES DU LECTEUR SUR UNE CONVERSATION, LUES DU CACHE (#10664) — pour
 * un écran qui ne porte pas l'objet conversation (les favoris) mais veut
 * l'accent PERSONNEL. Aucun appel réseau : la liste, sinon la fiche du fil.
 * L'identité de la fonction change quand le cache des conversations bouge ou que
 * le schéma bascule, pour que les lignes déjà peintes se recalculent.
 */
export function useConversationPreferences(): (conversationId: string) => unknown {
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState(0);
  const scheme = useColorScheme();
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success' && carriesPreferences(event.query.queryKey)) setRevision((value) => value + 1);
      }),
    [queryClient],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` et `scheme` ne sont lus que pour changer l'identité
  return useCallback(
    (conversationId: string): unknown =>
      (findCachedConversation(queryClient, conversationId) ?? queryClient.getQueryData<Conversation>(conversationQueryKey(conversationId)))?.userPreferences,
    [queryClient, revision, scheme],
  );
}
