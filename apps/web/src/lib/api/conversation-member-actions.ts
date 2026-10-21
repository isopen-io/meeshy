import type { QueryClient } from '@tanstack/react-query';
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import { roleOfAction, type MemberAction } from '@/lib/view/conversation-management';

import { conversationMembersQueryKey, type ConversationMember, type ConversationMembersData } from './conversation-members';
import { conversationQueryKey, patchConversation, patchConversationDetail, type ConversationsDeps } from './conversations';
import type { PersonSummary } from './friend-requests';
import type { ApiResult, HttpRequest } from './http';
import { outcomeOf } from './outcome';
import type { Conversation } from './types';

/**
 * **GÉRER LES MEMBRES D'UN GROUPE DEPUIS LE WEB** (#10613) — le pendant des
 * gestes de `ConversationSettingsViewModel` (`updateRole`, `expelParticipant`,
 * `banParticipant`) et d'`AddParticipantSheet` sur iOS, par les routes
 * EXISTANTES de la passerelle :
 *
 * - rang : `PATCH /conversations/:id/participants/:key/role` `{ role }` — en
 *   minuscules, l'énumération que la route déclare ;
 * - expulser : `DELETE /conversations/:id/participants/:key` ;
 * - bannir : `PATCH /conversations/:id/participants/:key/ban` ;
 * - ajouter : `POST /conversations/:id/participants` `{ userIds }`, un verdict
 *   par personne (`results[].outcome`).
 *
 * OPTIMISTE, AVEC RETOUR ARRIÈRE : la liste des membres (et le nombre de
 * membres de la liste et du fil) change avant la réponse ; tout échec — refus
 * ou panne — rend l'instantané pris avant le geste. Un geste de gestion n'est
 * pas rejoué plus tard comme un drapeau de rangée : l'administrateur doit
 * savoir, maintenant, qu'il n'a pas eu lieu.
 */
export type MemberActionDeps = ConversationsDeps & { readonly queryClient: QueryClient };

export type MemberActionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'refused' | 'failed'; readonly error: string };

type Failure = Extract<MemberActionOutcome, { readonly ok: false }>;

type Snapshot = {
  readonly members: ConversationMembersData | undefined;
  readonly listCount: number | undefined;
  readonly detailCount: number | undefined;
};

/** Refus (4xx qu'un rejeu ne changerait pas) ou panne — `RETRYABLE_CLIENT_STATUSES` (`outcome.ts`) en est la frontière. */
export const managementFailureOf = (result: { readonly status: number; readonly error: string }): Failure => ({
  ok: false,
  reason: outcomeOf(result) === 'permanent' ? 'refused' : 'failed',
  error: result.error,
});

const countOf = (conversation: Conversation | undefined): number | undefined => conversation?.memberCount;

function takeSnapshot(queryClient: QueryClient, conversationId: string): Snapshot {
  let listCount: number | undefined;
  patchConversation(queryClient, conversationId, (c) => {
    listCount = countOf(c);
    return c;
  });
  return {
    members: queryClient.getQueryData<ConversationMembersData>(conversationMembersQueryKey(conversationId)),
    listCount,
    detailCount: countOf(queryClient.getQueryData<Conversation>(conversationQueryKey(conversationId))),
  };
}

function restore(queryClient: QueryClient, conversationId: string, snapshot: Snapshot): void {
  queryClient.setQueryData(conversationMembersQueryKey(conversationId), snapshot.members);
  if (snapshot.listCount !== undefined) {
    const count = snapshot.listCount;
    patchConversation(queryClient, conversationId, (c) => ({ ...c, memberCount: count }));
  }
  if (snapshot.detailCount !== undefined) {
    const count = snapshot.detailCount;
    patchConversationDetail(queryClient, conversationId, (c) => ({ ...c, memberCount: count }));
  }
}

function editMembers(
  queryClient: QueryClient,
  conversationId: string,
  edit: (members: readonly ConversationMember[], pageIndex: number, pageCount: number) => readonly ConversationMember[],
  delta: number,
): void {
  queryClient.setQueryData<ConversationMembersData>(conversationMembersQueryKey(conversationId), (data) =>
    data === undefined
      ? data
      : {
          ...data,
          pages: data.pages.map((page, index) => ({
            ...page,
            members: edit(page.members, index, data.pages.length),
            totalCount: index === 0 && page.totalCount !== null ? Math.max(0, page.totalCount + delta) : page.totalCount,
          })),
        },
  );
  if (delta === 0) return;
  const shift = (c: Conversation): Conversation => ({ ...c, memberCount: Math.max(0, (c.memberCount ?? 0) + delta) });
  patchConversation(queryClient, conversationId, shift);
  patchConversationDetail(queryClient, conversationId, shift);
}

function requestOf(conversationId: string, action: MemberAction): HttpRequest {
  const role = roleOfAction(action.kind);
  if (role !== null) {
    return { method: 'PATCH', path: conversationsEndpoints.byIdParticipantsByUserIdRole(conversationId, action.targetKey), body: { role } };
  }
  if (action.kind === 'ban') {
    return { method: 'PATCH', path: conversationsEndpoints.byIdParticipantsByUserIdBan(conversationId, action.targetKey), body: {} };
  }
  return { method: 'DELETE', path: conversationsEndpoints.byIdParticipantsByParticipantKey(conversationId, action.targetKey) };
}

type Settled = { readonly ok: true; readonly data: unknown } | Failure;

async function settle(deps: MemberActionDeps, conversationId: string, snapshot: Snapshot, request: HttpRequest): Promise<Settled> {
  if (deps.source !== 'gateway') return { ok: true, data: undefined };
  let result: ApiResult<unknown>;
  try {
    result = await deps.transport.request<unknown>(request);
  } catch (error) {
    restore(deps.queryClient, conversationId, snapshot);
    return { ok: false, reason: 'failed', error: error instanceof Error ? error.message : 'network' };
  }
  if (!result.ok) {
    restore(deps.queryClient, conversationId, snapshot);
    return managementFailureOf(result);
  }
  return { ok: true, data: result.data };
}

export async function performMemberAction(params: {
  readonly deps: MemberActionDeps;
  readonly conversationId: string;
  readonly member: ConversationMember;
  readonly action: MemberAction;
}): Promise<MemberActionOutcome> {
  const { deps, conversationId, member, action } = params;
  const snapshot = takeSnapshot(deps.queryClient, conversationId);
  const role = roleOfAction(action.kind);
  if (role === null) {
    editMembers(deps.queryClient, conversationId, (members) => members.filter((m) => m.id !== member.id), -1);
  } else {
    editMembers(deps.queryClient, conversationId, (members) => members.map((m) => (m.id === member.id ? { ...m, role } : m)), 0);
  }
  const settled = await settle(deps, conversationId, snapshot, requestOf(conversationId, action));
  return settled.ok ? { ok: true } : settled;
}

const ADMITTED: ReadonlySet<string> = new Set(['new', 'rejoin', 'already-member']);

function verdictsOf(data: unknown, asked: readonly string[]): { readonly added: readonly string[]; readonly refused: readonly string[] } {
  const results = typeof data === 'object' && data !== null ? (data as { readonly results?: unknown }).results : undefined;
  if (!Array.isArray(results)) return { added: asked, refused: [] };
  const outcomeById = new Map<string, string>();
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { userId, outcome } = entry as { readonly userId?: unknown; readonly outcome?: unknown };
    if (typeof userId === 'string' && typeof outcome === 'string') outcomeById.set(userId, outcome);
  }
  return {
    added: asked.filter((id) => ADMITTED.has(outcomeById.get(id) ?? 'new')),
    refused: asked.filter((id) => !ADMITTED.has(outcomeById.get(id) ?? 'new')),
  };
}

const provisionalMember = (person: PersonSummary): ConversationMember => ({
  id: `pending-${person.id}`,
  userId: person.id,
  username: person.username,
  displayName: person.displayName ?? person.username,
  avatar: person.avatar ?? undefined,
  role: 'member',
});

export type AddMembersOutcome =
  | { readonly ok: true; readonly added: readonly string[]; readonly refused: readonly string[] }
  | { readonly ok: false; readonly reason: 'refused' | 'failed'; readonly error: string };

export async function addConversationMembers(params: {
  readonly deps: MemberActionDeps;
  readonly conversationId: string;
  readonly people: readonly PersonSummary[];
}): Promise<AddMembersOutcome> {
  const { deps, conversationId, people } = params;
  const asked = people.map((person) => person.id);
  const snapshot = takeSnapshot(deps.queryClient, conversationId);
  editMembers(
    deps.queryClient,
    conversationId,
    (members, index, count) => (index === count - 1 ? [...members, ...people.map(provisionalMember)] : members),
    people.length,
  );
  const settled = await settle(deps, conversationId, snapshot, {
    method: 'POST',
    path: conversationsEndpoints.byIdParticipants(conversationId),
    body: { userIds: asked },
  });
  if (!settled.ok) return settled;
  const verdicts = verdictsOf(settled.data, asked);
  if (verdicts.refused.length > 0) {
    const refused = new Set(verdicts.refused);
    editMembers(deps.queryClient, conversationId, (members) => members.filter((m) => m.userId === null || !refused.has(m.userId) || !m.id.startsWith('pending-')), -refused.size);
  }
  if (deps.source === 'gateway') void deps.queryClient.invalidateQueries({ queryKey: conversationMembersQueryKey(conversationId) });
  return { ok: true, ...verdicts };
}
