import { useQuery, useQueryClient } from '@tanstack/react-query';

import { conversationStore } from '@/lib/conversation-store';
import type { RowActionId } from '@/lib/view/row-actions';

import { ApiError, httpTransport } from './client';
import { apiConfig } from './config';
import { performRowAction } from './conversation-actions';
import { conversationQuery, conversationsQuery, type ConversationsDeps } from './conversations';
import type { Conversation } from './types';
import { messagesQuery } from './messages';
import { appQueryClient } from './query-client';

/**
 * L'ADAPTATEUR UNIQUE (#5650, F2/F3) — le SEUL endroit qui résout
 * `apiConfig.source` en dépendances de requête. `deps` est une constante de
 * MODULE : la source est figée à la CONSTRUCTION (`VITE_DATA_SOURCE`),
 * jamais relue à l'exécution — donc jamais recalculée à chaque rendu.
 */
const deps: ConversationsDeps = { source: apiConfig.source, transport: httpTransport };

export function useConversations() {
  return useQuery(conversationsQuery(deps));
}

/**
 * `useConversationsSnapshot` — LA LISTE POUR UN AUTRE ÉCRAN (#5650,
 * revue-correction) : la MÊME fabrique, le MÊME cache, la MÊME clé — mais
 * `enabled: false`, donc JAMAIS de requête. Un écran qui n'est pas la liste
 * (le fil et son compteur « non lus ailleurs ») en OBSERVE le contenu et se
 * re-rend quand il change, au lieu d'en prendre un instantané figé par
 * `queryClient.getQueryData()` au premier rendu — un instantané pris sur un
 * cache encore vide (lien direct vers `/c/:id`) ne se remplissait jamais, et
 * une conversation marquée lue ailleurs gardait son compte pour toujours.
 */
export function useConversationsSnapshot(): readonly Conversation[] | undefined {
  return useQuery({ ...conversationsQuery(deps), enabled: false }).data;
}

export function useConversation(id: string) {
  const queryClient = useQueryClient();
  return useQuery(conversationQuery(deps, id, { queryClient }));
}

export function useMessages(id: string) {
  return useQuery(messagesQuery(deps, id));
}

export type ThreadDataStatus = 'pending' | 'success' | 'refused' | 'error';

function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

/**
 * `useThreadData` — compose les DEUX requêtes du fil. `status: 'refused'`
 * (D-6) dès que L'UNE des deux porte un `ApiError` 403/404 — un id qui
 * n'existe pas OU dont le lecteur n'est pas membre rend le MÊME refus,
 * jamais le contenu d'une autre conversation (F8 : plus de repli sur
 * `CONVERSATIONS[0]`).
 */
export function useThreadData(id: string) {
  const conversation = useConversation(id);
  const messages = useMessages(id);

  const error = conversation.error ?? messages.error ?? null;
  const refused = isRefusal(conversation.error) || isRefusal(messages.error);
  const failed = conversation.isError || messages.isError;
  const ready = conversation.data !== undefined && messages.data !== undefined;

  const status: ThreadDataStatus = refused ? 'refused' : failed ? 'error' : ready ? 'success' : 'pending';

  return {
    conversation: conversation.data,
    messages: messages.data?.messages ?? [],
    hasOlder: messages.data?.hasOlder ?? false,
    status,
    error,
    refetch: (): void => {
      void conversation.refetch();
      void messages.refetch();
    },
    /**
     * `typing` — SOURCÉ, jamais deviné (écart de `targets/README.md`
     * descendu d'un cran) : en `fixtures`, le seul signal disponible ;
     * en `gateway`, `false` jusqu'au socket temps réel (#5494).
     */
    typing: apiConfig.source === 'fixtures',
  };
}

/**
 * `rowAction` — RÉFÉRENCE DE MODULE STABLE (jamais recréée), ce que
 * `LensRow` (`memo`) exige (`conversations.tsx:31-40`). Liée aux instances
 * PARTAGÉES du magasin optimiste et du client de requêtes.
 */
export function rowAction(conversationId: string, action: RowActionId): void {
  void performRowAction({
    conversationId,
    action,
    deps: { ...deps, store: conversationStore, queryClient: appQueryClient },
  });
}
