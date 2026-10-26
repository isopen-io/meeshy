import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import type { Conversation, Message } from '@/lib/api/types';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { endToEndRegimeOf, sealForgedPlaintext, type EndToEndRegimeView } from './end-to-end-sealed';

/**
 * **LE RÉGIME VU DU FIL OUVERT** (#12992) — ce que la passerelle sert, ce que le
 * registre du compte a retenu (mode et ère) et ce que le fil montre. Réactif au
 * registre : une conversation apprise e2ee pendant que le fil est ouvert scelle
 * aussitôt les clairs forgés.
 */
export function useEndToEndRegime(params: {
  readonly conversationId: string;
  readonly conversation: Pick<Conversation, 'encryptionMode' | 'encryptionEnabledAt'> | undefined;
  readonly trail: readonly Message[];
}): EndToEndRegimeView {
  const { conversationId, conversation, trail } = params;
  const learned = useStore(endToEndRegimeLedger, (state) => state.sealed[conversationId] === true);
  const learnedSince = useStore(endToEndRegimeLedger, (state) => state.since[conversationId]);
  const servedMode = conversation?.encryptionMode;
  const servedSince = conversation?.encryptionEnabledAt;
  return useMemo(
    () =>
      endToEndRegimeOf(
        { conversationId, servedMode, servedSince, trail },
        { sealed: learned ? { [conversationId]: true } : {}, since: learnedSince === undefined ? {} : { [conversationId]: learnedSince } },
      ),
    [conversationId, servedMode, servedSince, trail, learned, learnedSince],
  );
}

/**
 * **LE FIL MONTRÉ, CLAIRS FORGÉS SCELLÉS** (#12992) — la même donnée que
 * `useThreadData`, dont `messages` passe par la loi unique
 * `sealForgedPlaintext` : la bulle, la rangée focale, le lecteur d'écran, le
 * menu d'appui long, la citation et le transfert lisent tous le message scellé.
 */
export function useSealedThread<T extends { readonly conversationId: string; readonly conversation: Conversation | undefined; readonly messages: readonly Message[] }>(data: T): T {
  const { sealed, since } = useEndToEndRegime({ conversationId: data.conversationId, conversation: data.conversation, trail: data.messages });
  const messages = useMemo(() => sealForgedPlaintext(data.messages, { sealed, since }), [data.messages, sealed, since]);
  return messages === data.messages ? data : { ...data, messages };
}
