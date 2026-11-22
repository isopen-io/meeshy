import type { QueryClient } from '@tanstack/react-query';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { writeLive } from './live-cache-journal';

/**
 * UNE CONVERSATION FERMÉE OU RENDUE OBSOLÈTE QUITTE L'ÉCRAN (#14645) —
 * `conversation:closed` (`DELETE /conversations/:id`) et
 * `conversation:obsoleted` (`DELETE /conversations/:id/obsolete`, #14643, émis
 * juste après le premier). Les deux retirent la ligne de la liste, le détail
 * et les messages en cache (`conversationQueryKey` en préfixe), et le fil
 * ouvert se referme sur la liste : il n'a plus rien à montrer.
 *
 * FAIL-CLOSED sur la forme : une charge sans `conversationId` lisible ne
 * retire rien.
 */
export function conversationGoneOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const id = (payload as Readonly<Record<string, unknown>>).conversationId;
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * `conversation:deleted` / `conversation:restored` (#18914, WEB-07) — la
 * suppression ou la restauration « pour moi », diffusées vers la salle
 * personnelle : la conversation NOMMÉE, si la charge nomme le LECTEUR.
 * FAIL-CLOSED : un autre compte, ou une charge sans compte, ne touche rien.
 */
export function viewerConversationOf(payload: unknown, viewerId: string): string | null {
  const conversationId = conversationGoneOf(payload);
  if (conversationId === null || viewerId === '') return null;
  return (payload as Readonly<Record<string, unknown>>).userId === viewerId ? conversationId : null;
}

/**
 * LOI UNIQUE « cette conversation quitte la LISTE » (#18914, #20302) — la
 * moitié de `applyConversationGone` qui ne touche QUE la ligne.
 *
 * Une relecture de la liste partie avant l'évènement ne doit pas rendre la
 * ligne : le retrait passe donc par le journal des écritures vives, jamais par
 * un `setQueryData` nu. Et il est IDEMPOTENT — c'est ce sur quoi la passerelle
 * compte pour ne pas gater ses éventails de départ (`participant-ban-core.ts`,
 * `leave.ts`) : rejouer le retrait d'une ligne déjà partie ne change rien.
 *
 * Elle est séparée d'`applyConversationGone` parce que la fin d'APPARTENANCE
 * (#11415) retire la ligne SANS purger le détail : le fil ouvert y reste
 * ouvert et dégrade son menu, il ne se referme pas sous le lecteur. Les deux
 * appelants ne partagent donc que ce retrait-ci, et le partager à la main les
 * aurait fait diverger au premier correctif de journal.
 */
export function removeConversationRow(queryClient: QueryClient, conversationId: string): void {
  writeLive<ConversationsInfiniteData>(queryClient, CONVERSATIONS_QUERY_KEY, (data) => {
    if (data === undefined || !Array.isArray(data.pages)) return data;
    if (!data.pages.some((page) => page.conversations.some((c) => c.id === conversationId))) return data;
    return { ...data, pages: data.pages.map((page) => ({ ...page, conversations: page.conversations.filter((c) => c.id !== conversationId) })) };
  });
}

/** La ligne part ET le détail est purgé : la conversation n'a plus rien à montrer (#14645, #18914). */
export function applyConversationGone(queryClient: QueryClient, conversationId: string): void {
  removeConversationRow(queryClient, conversationId);
  queryClient.removeQueries({ queryKey: conversationQueryKey(conversationId) });
}

export type ThreadExit = {
  readonly pathname: string;
  readonly threadPath: (conversationId: string) => string;
  readonly listPath: string;
  readonly go: (path: string) => void;
};

export function leaveThreadOfGoneConversation(conversationId: string, exit: ThreadExit): void {
  if (exit.pathname === exit.threadPath(conversationId)) exit.go(exit.listPath);
}
