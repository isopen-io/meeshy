import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import type { Conversation, Message } from '@/lib/api/types';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { endToEndRegimeOf, sealForgedPlaintext, type EndToEndRegimeView } from './end-to-end-sealed';

/**
 * **LE RÉGIME VU DU FIL OUVERT** (#12992) — ce que la passerelle sert, ce que le
 * registre du compte a retenu (mode, ère, retenue de #13099, clairs connus
 * d'avant l'apprentissage) et ce que le fil montre, selon la forme de la
 * conversation. Réactif au registre : une conversation apprise e2ee pendant que
 * le fil est ouvert scelle aussitôt les clairs forgés.
 */
export function useEndToEndRegime(params: {
  readonly conversationId: string;
  readonly conversation: Pick<Conversation, 'type' | 'encryptionMode' | 'encryptionEnabledAt'> | undefined;
  readonly trail: readonly Message[];
}): EndToEndRegimeView {
  const { conversationId, conversation, trail } = params;
  const learned = useStore(endToEndRegimeLedger, (state) => state.sealed[conversationId] === true);
  const held = useStore(endToEndRegimeLedger, (state) => state.held[conversationId] === true);
  const learnedSince = useStore(endToEndRegimeLedger, (state) => state.since[conversationId]);
  const clearKnown = useStore(endToEndRegimeLedger, (state) => state.clearKnown[conversationId]);
  const servedMode = conversation?.encryptionMode;
  const servedSince = conversation?.encryptionEnabledAt;
  const isDirect = conversation?.type === 'direct';
  return useMemo(
    () =>
      endToEndRegimeOf(
        { conversationId, servedMode, servedSince, trail, isDirect },
        {
          sealed: learned ? { [conversationId]: true } : {},
          held: held ? { [conversationId]: true } : {},
          since: learnedSince === undefined ? {} : { [conversationId]: learnedSince },
          clearKnown: clearKnown === undefined ? {} : { [conversationId]: clearKnown },
        },
      ),
    [conversationId, servedMode, servedSince, trail, isDirect, learned, held, learnedSince, clearKnown],
  );
}

/**
 * **LE FIL MONTRÉ, CLAIRS FORGÉS SCELLÉS** (#12992) — la même donnée que
 * `useThreadData`, dont `messages` passe par la loi unique
 * `sealForgedPlaintext` : la bulle, la rangée focale, le lecteur d'écran, le
 * menu d'appui long, la citation et le transfert lisent tous le message scellé.
 */
export function useSealedThread<T extends { readonly conversationId: string; readonly conversation: Conversation | undefined; readonly messages: readonly Message[] }>(data: T): T {
  const regime = useEndToEndRegime({ conversationId: data.conversationId, conversation: data.conversation, trail: data.messages });
  const messages = useMemo(() => sealForgedPlaintext(data.messages, regime), [data.messages, regime]);
  return messages === data.messages ? data : { ...data, messages };
}
