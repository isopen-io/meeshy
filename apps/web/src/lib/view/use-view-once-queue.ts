import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { patchThreadMessages } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';
import { consumeViewOnce } from '@/lib/api/view-once';
import { createViewOnceQueue, sealPendingViewOnce, type ViewOnceQueue } from '@/lib/api/view-once-queue';

/**
 * UNE FILE PAR LECTEUR — la clé porte l'identité : un second compte sur le
 * même navigateur ne rejoue jamais les consommations du premier.
 */
const queues = new Map<string, ViewOnceQueue>();

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function viewOnceQueueFor(viewerId: string): ViewOnceQueue {
  const held = queues.get(viewerId);
  if (held !== undefined) return held;
  const queue = createViewOnceQueue({
    storage: browserStorage(),
    key: `meeshy.viewOnceConsume.${viewerId}`,
    send: async (entry) => {
      if (__FIXTURES__ && apiDeps.source === 'fixtures') return { ok: true, status: 200 };
      return consumeViewOnce(apiDeps.transport, entry);
    },
  });
  queues.set(viewerId, queue);
  return queue;
}

/**
 * LA VUE UNIQUE FERMÉE HORS LIGNE (#8015) — le fil vide la file à l'ouverture
 * et à chaque retour du réseau, et tant qu'elle retient une consommation, la
 * rangée que la passerelle sert encore ouvrable reste « déjà ouverte »
 * (rechargement compris). Rend la file à passer à `consumeViewOnceOptimistic`.
 */
export function useViewOnceQueue(params: {
  readonly conversationId: string;
  /** Le fil CONFIRMÉ (`threadData.messages`). */
  readonly messages: readonly Message[];
  readonly viewerId: string | undefined;
  readonly queryClient: QueryClient;
  /** Injectable pour les témoins ; la file du lecteur par défaut. */
  readonly queue?: ViewOnceQueue;
}): ViewOnceQueue | undefined {
  const { conversationId, messages, viewerId, queryClient } = params;
  const queue = params.queue ?? (viewerId === undefined || viewerId === '' ? undefined : viewOnceQueueFor(viewerId));

  useEffect(() => {
    if (queue === undefined) return undefined;
    void queue.flush();
    const onOnline = () => void queue.flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [queue]);

  useEffect(() => {
    if (queue === undefined) return;
    const pending = queue.pendingFor(conversationId);
    if (pending.size === 0 || sealPendingViewOnce(messages, pending) === messages) return;
    patchThreadMessages(queryClient, conversationId, (rows) => sealPendingViewOnce(rows, pending));
  }, [conversationId, messages, queue, queryClient]);

  return queue;
}
