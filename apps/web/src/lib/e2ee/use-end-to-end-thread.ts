import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { sessionStore } from '@/lib/api/session';
import type { Conversation, Message } from '@/lib/api/types';

import { directPeerOf } from './direct-peer';

const isEndToEndMessage = (message: Message): boolean =>
  message.isEncrypted === true && (message.encryptionMode === 'e2ee' || message.encryptionMetadata?.protocol === 'libsignal-v1');

/**
 * **LE FIL CHIFFRÉ OUVERT SUR CE NAVIGATEUR** (#14592) — à l'ouverture d'un
 * tête-à-tête vu chiffré de bout en bout, la pile libsignal se charge (une fois
 * par session), rattrape les enveloppes en attente, écoute les suivantes, et
 * rend lisibles les messages déjà ouverts ici. Rien ne se charge ailleurs.
 */
export function useEndToEndThread(params: {
  readonly sealed: boolean;
  readonly conversation: Pick<Conversation, 'type' | 'participants'> | undefined;
  readonly messages: readonly Message[];
}): void {
  const viewerId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : ''));
  const direct = directPeerOf(params.conversation, viewerId) !== null;
  const ids = useMemo(() => params.messages.filter(isEndToEndMessage).map((message) => message.id).join(','), [params.messages]);
  useEffect(() => {
    if (!params.sealed || !direct || viewerId === '') return;
    void import('./runtime')
      .then(({ hydrateOpened }) => hydrateOpened(viewerId, ids === '' ? [] : ids.split(',')))
      .catch(() => undefined);
  }, [params.sealed, direct, viewerId, ids]);
}
