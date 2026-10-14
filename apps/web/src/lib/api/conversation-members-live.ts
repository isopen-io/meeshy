import type { QueryClient } from '@tanstack/react-query';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import { conversationMembersQueryKey, type ConversationMember, type ConversationMembersData } from './conversation-members';
import { patchConversation, patchConversationDetail } from './conversations';

/**
 * **LA FEUILLE OUVERTE SUIT LES MEMBRES EN DIRECT** (#10613) — les événements
 * que la passerelle émet déjà à chaque geste de gestion, appliqués à la liste
 * des membres de LA conversation ouverte, tant que sa feuille est montée
 * (`watchLiveSocket`) :
 *
 * - `participant:role-updated` — le rang servi remplace l'ancien ; quand c'est
 *   le LECTEUR qui change de rang, la conversation (liste et fil) le reçoit
 *   aussi : les gestes que la feuille offre suivent son nouveau rang ;
 * - `conversation:participant-left` et `conversation:participant-banned` — la
 *   rangée part, le compte baisse ;
 * - `conversation:participant-joined` — la charge ne porte pas la rangée
 *   entière : la liste servie est relue.
 *
 * Gardes de FORME champ par champ : une charge illisible n'est pas appliquée.
 */
type Payload = Readonly<Record<string, unknown>>;

const payloadOf = (value: unknown, conversationId: string): Payload | null => {
  if (typeof value !== 'object' || value === null) return null;
  const payload = value as Payload;
  return payload.conversationId === conversationId ? payload : null;
};

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const designates = (member: ConversationMember, ids: { readonly participantId: string | null; readonly userId: string | null }): boolean =>
  (ids.participantId !== null && member.id === ids.participantId) || (ids.userId !== null && member.userId === ids.userId);

function editMembers(queryClient: QueryClient, conversationId: string, edit: (members: readonly ConversationMember[]) => readonly ConversationMember[]): void {
  queryClient.setQueryData<ConversationMembersData>(conversationMembersQueryKey(conversationId), (data) => {
    if (data === undefined) return data;
    const before = data.pages.reduce((sum, page) => sum + page.members.length, 0);
    const pages = data.pages.map((page) => ({ ...page, members: edit(page.members) }));
    const removed = before - pages.reduce((sum, page) => sum + page.members.length, 0);
    return {
      ...data,
      pages: pages.map((page, index) =>
        index === 0 && page.totalCount !== null && removed > 0 ? { ...page, totalCount: Math.max(0, page.totalCount - removed) } : page,
      ),
    };
  });
}

export function bindConversationMembersLive(params: {
  readonly socket: SocketClient;
  readonly queryClient: QueryClient;
  readonly conversationId: string;
  readonly viewerId: string;
}): () => void {
  const { socket, queryClient, conversationId, viewerId } = params;

  const onRoleUpdated = (value: unknown): void => {
    const payload = payloadOf(value, conversationId);
    const role = textOf(payload?.newRole);
    if (payload === null || role === null) return;
    const participant = payload.participant;
    const participantId = typeof participant === 'object' && participant !== null ? textOf((participant as Payload).id) : null;
    const ids = { participantId, userId: textOf(payload.userId) };
    const next = role.toLowerCase();
    editMembers(queryClient, conversationId, (members) => members.map((member) => (designates(member, ids) ? { ...member, role: next } : member)));
    if (ids.userId === null || ids.userId !== viewerId) return;
    patchConversation(queryClient, conversationId, (c) => ({ ...c, currentUserRole: next }));
    patchConversationDetail(queryClient, conversationId, (c) => ({ ...c, currentUserRole: next }));
  };

  const onDeparture = (value: unknown): void => {
    const payload = payloadOf(value, conversationId);
    if (payload === null) return;
    const ids = { participantId: textOf(payload.participantId), userId: textOf(payload.userId) };
    if (ids.participantId === null && ids.userId === null) return;
    editMembers(queryClient, conversationId, (members) => members.filter((member) => !designates(member, ids)));
  };

  const onJoined = (value: unknown): void => {
    if (payloadOf(value, conversationId) === null) return;
    void queryClient.invalidateQueries({ queryKey: conversationMembersQueryKey(conversationId) });
  };

  const bindings: ReadonlyArray<readonly [string, (value: unknown) => void]> = [
    [SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, onRoleUpdated],
    [SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, onDeparture],
    [SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, onDeparture],
    [SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, onJoined],
  ];
  for (const [event, handler] of bindings) socket.on<unknown>(event, handler);
  return () => {
    for (const [event, handler] of bindings) socket.off<unknown>(event, handler);
  };
}
