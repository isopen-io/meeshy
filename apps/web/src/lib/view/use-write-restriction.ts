import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { appQueryClient } from '@/lib/api/query-client';
import type { Conversation } from '@/lib/api/types';
import { entriesOf, outboxStore } from '@/lib/send/outbox-store';
import {
  GLOBAL_ADULTS_ONLY,
  dropGlobalRefusals,
  writeRestrictionOf,
  writeRestrictionStore,
  type WriteRestriction,
} from '@/lib/write-restriction';

/**
 * **LA RESTRICTION D'ÉCRITURE DU FIL OUVERT** (#9928) — ce que la passerelle
 * sert, ou ce qu'un refus vient d'apprendre. Un envoi refusé
 * `GLOBAL_ADULTS_ONLY` (cache périmé : l'âge a été déclaré ailleurs) ferme le
 * fil pour la session, retire la bulle optimiste et relit la liste, où Global
 * passe aux archives. La cause est déjà dite par l'annonce d'échec de
 * `useSend` (`failure-reason.ts`) : aucune seconde annonce ici.
 */
export function useWriteRestriction(params: {
  readonly conversationId: string;
  readonly conversation: Conversation | undefined;
}): WriteRestriction | null {
  const { conversationId, conversation } = params;
  const learned = useStore(writeRestrictionStore, (state) => state.learned);
  const refused = useStore(
    outboxStore,
    (state) => entriesOf(state, conversationId).filter((entry) => entry.lastError?.code === GLOBAL_ADULTS_ONLY).length,
  );

  useEffect(() => {
    if (refused === 0) return;
    writeRestrictionStore.getState().learn(conversationId);
    dropGlobalRefusals(outboxStore, conversationId);
    void appQueryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  }, [refused, conversationId]);

  return writeRestrictionOf(conversation, learned);
}
