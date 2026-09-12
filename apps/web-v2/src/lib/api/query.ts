import { useQuery, useQueryClient } from '@tanstack/react-query';

import { conversationStore } from '@/lib/conversation-store';
import { performSend, retrySend, type Draft } from '@/lib/send/perform-send';
import { outboxStore } from '@/lib/send/outbox-store';
import type { RowActionId } from '@/lib/view/row-actions';

import { ApiError, httpTransport } from './client';
import { apiConfig } from './config';
import { performRowAction } from './conversation-actions';
import { conversationQuery, conversationsQuery, type ConversationsDeps } from './conversations';
import type { Conversation, Participant } from './types';
import { messagesQuery } from './messages';
import { appQueryClient } from './query-client';
import { performReaction, type PerformReactionResult } from './reactions';
import { storyTrayQueryOptions } from './stories';

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

/**
 * **LE RAIL DE STORIES** (#6080) — même adaptateur, même `deps`, donc la même
 * règle de source : fixtures ou passerelle, résolu à la CONSTRUCTION.
 *
 * `staleTime` de 60 s : une story vit vingt-quatre heures et le plateau n'a
 * aucune raison d'être refetché à chaque retour sur la liste. Au-delà, c'est
 * le socket qui doit prévenir — issue compagnon, comme pour les messages.
 */
export function useStoryTray() {
  return useQuery({ ...storyTrayQueryOptions(deps), staleTime: 60_000 });
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
 *
 * `conversationId` (revue-correction #5793, défaut MAJEUR 3) — LE paramètre
 * de route n'est qu'un moyen de CHARGER (`GET /conversations/:id`, qui
 * accepte « ID or identifier », `core-detail.ts:250`) : la passerelle
 * NORMALISE tout identifiant lisible en ObjectId AVANT de diffuser quoi que
 * ce soit (`normalizeConversationId`, `MeeshySocketIOManager.ts:2879`), donc
 * `message:new`/`conversation:updated`/`message:translation` portent
 * TOUJOURS l'ObjectId — jamais l'identifiant de la route. Clé le fil sur le
 * paramètre de route AVANT que `conversation.data` n'arrive (rien à perdre,
 * la passerelle résout aussi les deux formes pour `GET …/messages`), puis
 * BASCULE sur `conversation.data.id` dès qu'il est connu : un lien direct
 * `/c/<identifiant>` recevait alors ses temps réel sur une clé de cache que
 * PERSONNE ne lisait, le fil ouvert restant muet et la Lentille ne se
 * réordonnant jamais. Un lien déjà canonique (le cas nominal, navigation
 * depuis la Lentille) ne change pas de clé : `conversation.data.id === id`,
 * aucune requête de plus.
 */
export function useThreadData(id: string) {
  const conversation = useConversation(id);
  const conversationId = conversation.data?.id ?? id;
  const messages = useMessages(conversationId);

  const error = conversation.error ?? messages.error ?? null;
  const refused = isRefusal(conversation.error) || isRefusal(messages.error);
  const failed = conversation.isError || messages.isError;
  const ready = conversation.data !== undefined && messages.data !== undefined;

  const status: ThreadDataStatus = refused ? 'refused' : failed ? 'error' : ready ? 'success' : 'pending';

  return {
    conversationId,
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
     * `typing` A DISPARU D'ICI (#5793) — c'était un BOOLÉEN DE SOURCE
     * (`apiConfig.source === 'fixtures'`), jamais une donnée : il valait
     * `true` en fixtures quel que soit ce qui se passait, `false` en
     * gateway quoi qu'il arrive. La frappe RÉELLE vit désormais dans
     * `typing-store.ts`, alimenté par `api/socket.ts` (`typing:start`/
     * `typing:stop`) et lu par `useTypists()` (`api/use-typists.ts`) —
     * `routes/thread.tsx` la consomme directement, ce hook n'a plus à la
     * transporter.
     */
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

/**
 * `sendAction`/`retrySendAction` (#5813, étape 6) — RÉFÉRENCES DE MODULE
 * STABLES, motif `rowAction` ci-dessus : liées aux instances PARTAGÉES
 * (`appQueryClient`, `outboxStore`) et à `deps` (la SEULE résolution de
 * `apiConfig.source`, `:20`). `online` est REÇU — ce module n'appelle pas
 * `useOnline()` (un hook), c'est `use-send.ts` qui le fournit.
 */
export function sendAction(params: {
  readonly conversationId: string;
  readonly draft: Draft;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly online: boolean;
}): Promise<void> {
  const { conversationId, draft, viewerId, sender, online } = params;
  return performSend({
    conversationId,
    draft,
    viewerId,
    ...(sender === undefined ? {} : { sender }),
    deps: { ...deps, queryClient: appQueryClient, outbox: outboxStore, online },
  });
}

export function retrySendAction(params: {
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly online: boolean;
}): Promise<void> {
  const { conversationId, clientMessageId, online } = params;
  return retrySend({
    conversationId,
    clientMessageId,
    deps: { ...deps, queryClient: appQueryClient, outbox: outboxStore, online },
  });
}

/**
 * `reactAction` (#5814) — RÉFÉRENCE DE MODULE STABLE, motif `rowAction` :
 * liée à l'instance PARTAGÉE `appQueryClient`. Le SITE UNIQUE que le menu du
 * message (`message-menu.tsx`) et son hôte (`routes/thread.tsx`) appellent —
 * jamais une seconde écriture du plan optimiste.
 */
export function reactAction(conversationId: string, messageId: string, emoji: string): Promise<PerformReactionResult> {
  return performReaction({ conversationId, messageId, emoji, deps: { ...deps, queryClient: appQueryClient } });
}
