import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { appQueryClient } from '@/lib/api/query-client';
import type { Conversation, Message } from '@/lib/api/types';
import { endToEndRegimeLedger, endToEndSealed, isEndToEndMode } from '@/lib/end-to-end-regime-ledger';
import { threadShowsEndToEnd } from '@/lib/end-to-end-thread-signal';
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
 *
 * #12949 — le fil chargé (`messages`) et le mode servi disent aussi si la
 * conversation est chiffrée de bout en bout : ce qui est VU est retenu par le
 * registre du compte, que l'envoi unique lit, et ne se perd plus quand le
 * serveur la sert ensuite sans mode.
 */
export function useWriteRestriction(params: {
  readonly conversationId: string;
  readonly conversation: Conversation | undefined;
  readonly messages?: readonly Message[] | undefined;
}): WriteRestriction | null {
  const { conversationId, conversation, messages } = params;
  const learned = useStore(writeRestrictionStore, (state) => state.learned);
  const sealedIds = useStore(endToEndRegimeLedger, (state) => state.sealed);
  const threadShows = useMemo(() => threadShowsEndToEnd(messages ?? []), [messages]);
  const seenEndToEnd = isEndToEndMode(conversation?.encryptionMode) || threadShows;

  useEffect(() => {
    if (seenEndToEnd) endToEndRegimeLedger.getState().learnEndToEnd(conversationId);
  }, [seenEndToEnd, conversationId]);

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

  const sealed = seenEndToEnd || endToEndSealed({ sealed: sealedIds }, { conversationId });
  return writeRestrictionOf(conversation, learned, sealed);
}
