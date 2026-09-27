import type { QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { consumeAfterRead, createAfterReadQueue, removeAfterReadLocally, type AfterReadQueue } from '@/lib/api/after-read';
import type { Message } from '@/lib/api/types';

import { afterReadSeenUpTo } from './after-read';

/**
 * UNE FILE PAR LECTEUR — la clé porte l'identité, comme le brouillon
 * (`draft-store.ts`) : un second compte sur le même navigateur ne rejoue
 * jamais les consommations du premier.
 */
const queues = new Map<string, AfterReadQueue>();

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function afterReadQueueFor(viewerId: string): AfterReadQueue {
  const held = queues.get(viewerId);
  if (held !== undefined) return held;
  const queue = createAfterReadQueue({
    storage: browserStorage(),
    key: `meeshy.afterRead.${viewerId}`,
    send: async (conversationId, messageIds) => {
      if (__FIXTURES__ && apiDeps.source === 'fixtures') return { ok: true, status: 200 };
      return consumeAfterRead(apiDeps.transport, { conversationId, messageIds });
    },
  });
  queues.set(viewerId, queue);
  return queue;
}

/**
 * LA FLAMME-ŒIL SE CONSOMME EN QUITTANT (#8304) — « faire disparaître un
 * message après avoir été vu et quitté la conversation » (directive porteur
 * 2026-09-27).
 *
 * VU : la frontière que la détection de lecture existante avance
 * (`useReadTracking` → `noteSeenUpTo`) — rien d'autre ne compte comme vu.
 * QUITTÉ : le démontage du fil, le changement de conversation, l'onglet
 * masqué ou fermé (`visibilitychange` caché, `pagehide`). À ce moment, et
 * seulement pour ce qui a été vu : retrait local immédiat, puis consommation
 * mise en FILE (`after-read.ts`) — elle part tout de suite si le réseau le
 * permet, sinon au retour du réseau ou à la prochaine ouverture d'un fil.
 *
 * Tant que la file retient un message, le fil le cache : sans cela, un
 * rechargement hors ligne le ferait revenir alors que le lecteur l'a vu.
 *
 * L'expéditeur n'est jamais concerné (`afterReadSeenUpTo` écarte ses
 * messages) : chez lui, rien ne part avant l'expiration serveur
 * (`message:expired`, déjà géré).
 */
export function useAfterReadConsumption(params: {
  readonly conversationId: string | undefined;
  /** Le fil CONFIRMÉ (`threadData.messages`). */
  readonly messages: readonly Message[];
  readonly viewerId: string | undefined;
  readonly queryClient: QueryClient;
  /** Injectable pour les témoins ; la file du lecteur par défaut. */
  readonly queue?: AfterReadQueue;
}): { readonly noteSeenUpTo: (boundaryId: string) => void } {
  const { conversationId, messages, viewerId, queryClient } = params;
  const queue = params.queue ?? (viewerId === undefined || viewerId === '' ? undefined : afterReadQueueFor(viewerId));

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const seenRef = useRef(new Set<string>());
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;

  const noteSeenUpTo = useCallback(
    (boundaryId: string) => {
      if (viewerId === undefined || viewerId === '') return;
      for (const id of afterReadSeenUpTo({ messages: messagesRef.current, boundaryId, viewerId })) seenRef.current.add(id);
    },
    [viewerId],
  );

  /* DES REFS, PAS DES DÉPENDANCES : `leave` doit rester STABLE, sans quoi le
     nettoyage de l'effet de sortie courrait à chaque changement d'identité
     d'une dépendance — et consommerait un message que le lecteur est encore
     en train de regarder. */
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const leave = useCallback((leftConversationId: string | undefined) => {
    const ids = [...seenRef.current];
    seenRef.current = new Set();
    const held = queueRef.current;
    if (leftConversationId === undefined || ids.length === 0 || held === undefined) return;
    removeAfterReadLocally(queryClientRef.current, { conversationId: leftConversationId, messageIds: ids });
    held.enqueue(leftConversationId, ids);
    void held.flush();
  }, []);

  useEffect(() => () => leave(conversationId), [conversationId, leave]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') leave(conversationRef.current);
    };
    const onPageHide = () => leave(conversationRef.current);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [leave]);

  useEffect(() => {
    if (queue === undefined) return undefined;
    void queue.flush();
    const onOnline = () => void queue.flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [queue]);

  useEffect(() => {
    if (conversationId === undefined || queue === undefined) return;
    const pending = queue.pendingFor(conversationId);
    if (pending.size === 0) return;
    const held = messages.filter((m) => pending.has(m.id)).map((m) => m.id);
    if (held.length > 0) removeAfterReadLocally(queryClient, { conversationId, messageIds: held });
  }, [conversationId, messages, queue, queryClient]);

  return { noteSeenUpTo };
}
