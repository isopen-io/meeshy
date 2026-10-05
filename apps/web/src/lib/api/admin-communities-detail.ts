import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { CommunityMembersState } from '@/lib/admin/community-list';

import { asCount, asRecord, asText, type AdminDeps } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import { decodeAdminPersonRef, type AdminPersonRef } from './admin-posts';
import type { ApiResult } from './http';

/**
 * **LA FICHE D'UNE COMMUNAUTÉ** (#8876) — `GET admin.communitiesByCommunityId`,
 * ses membres (`admin.communitiesByCommunityIdMembers`, pagination À CÔTÉ de
 * `data`) et le geste `PATCH` (désactiver / réactiver, rendre privée / publique,
 * motif de 10 caractères au moins — consigné dans le journal).
 *
 * Gardées par `canManageGroups`. Un membre n'est servi que par son identité
 * publique (nom, pseudo, photo) : ni présence, ni coordonnées, ni rôle global —
 * et ce décodeur n'en garde rien de plus. Les conversations de la communauté
 * gardent leur titre, leur type, leur état et leur taille — jamais leur
 * identifiant d'entrée, qui est un secret de jonction.
 *
 * Clés sous `['admin', 'community', …]` : une seule invalidation relit la
 * fiche, la liste et les membres.
 */
export type AdminCommunityConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly type: string | null;
  readonly isActive: boolean;
  readonly lastMessageAt: string | null;
  readonly memberCount: number;
};

export type AdminCommunityStaff = { readonly user: AdminPersonRef; readonly role: string; readonly joinedAt: string | null };

export type AdminCommunityFiche = {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly description: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly isPrivate: boolean;
  readonly isActive: boolean;
  readonly deletedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly creator: AdminPersonRef | null;
  readonly activeMemberCount: number;
  readonly leftMemberCount: number;
  readonly conversationCount: number;
  readonly postCount: number;
  readonly conversations: readonly AdminCommunityConversation[];
  readonly staff: readonly AdminCommunityStaff[];
};

export type AdminCommunityMember = {
  /** L'identifiant de l'APPARTENANCE (la clé de la rangée), pas celui du membre. */
  readonly id: string;
  readonly role: string;
  readonly joinedAt: string | null;
  readonly isActive: boolean;
  readonly leftAt: string | null;
  readonly user: AdminPersonRef;
};

const textOrNull = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

const present = <T>(entries: readonly (T | null)[]): readonly T[] => entries.filter((entry): entry is T => entry !== null);

const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

function decodeConversation(raw: unknown): AdminCommunityConversation | null {
  const conversation = asRecord(raw);
  if (conversation === null || typeof conversation.id !== 'string' || conversation.id === '') return null;
  return {
    id: conversation.id,
    title: textOrNull(conversation.title),
    type: textOrNull(conversation.type),
    isActive: conversation.isActive !== false,
    lastMessageAt: textOrNull(conversation.lastMessageAt),
    memberCount: asCount(conversation.memberCount),
  };
}

function decodeStaff(raw: unknown): AdminCommunityStaff | null {
  const entry = asRecord(raw);
  const user = decodeAdminPersonRef(entry?.user);
  return entry === null || user === null ? null : { user, role: asText(entry.role), joinedAt: textOrNull(entry.joinedAt) };
}

export function decodeAdminCommunityFiche(raw: unknown): AdminCommunityFiche | null {
  const community = asRecord(raw);
  if (community === null || typeof community.id !== 'string' || community.id === '') return null;
  return {
    id: community.id,
    identifier: asText(community.identifier),
    name: asText(community.name),
    description: textOrNull(community.description),
    avatar: textOrNull(community.avatar),
    banner: textOrNull(community.banner),
    isPrivate: community.isPrivate !== false,
    isActive: community.isActive !== false,
    deletedAt: textOrNull(community.deletedAt),
    createdAt: textOrNull(community.createdAt),
    updatedAt: textOrNull(community.updatedAt),
    creator: decodeAdminPersonRef(community.creator),
    activeMemberCount: asCount(community.activeMemberCount),
    leftMemberCount: asCount(community.leftMemberCount),
    conversationCount: asCount(community.conversationCount),
    postCount: asCount(community.postCount),
    conversations: present(listOf(community.conversations).map(decodeConversation)),
    staff: present(listOf(community.staff).map(decodeStaff)),
  };
}

export function decodeAdminCommunityMember(raw: unknown): AdminCommunityMember | null {
  const member = asRecord(raw);
  const user = decodeAdminPersonRef(member?.user);
  if (member === null || typeof member.id !== 'string' || member.id === '' || user === null) return null;
  return {
    id: member.id,
    role: asText(member.role),
    joinedAt: textOrNull(member.joinedAt),
    isActive: member.isActive !== false,
    leftAt: textOrNull(member.leftAt),
    user,
  };
}

export const adminCommunityQueryKey = (communityId: string) => ['admin', 'community', 'fiche', communityId] as const;

export const adminCommunityMembersQueryKey = (communityId: string, address: string) =>
  ['admin', 'community', 'members', communityId, address] as const;

export async function loadAdminCommunity(
  params: AdminDeps & { readonly communityId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminCommunityFiche | null>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.communitiesByCommunityId(params.communityId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminCommunityFiche(result.data) };
}

function membersQuery(state: CommunityMembersState): string {
  return new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
    ...(state.q === '' ? {} : { search: state.q }),
    ...state.filters,
  }).toString();
}

export async function loadAdminCommunityMembers(
  params: AdminDeps & { readonly communityId: string; readonly state: CommunityMembersState; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminCommunityMember>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.communitiesByCommunityIdMembers(params.communityId)}?${membersQuery(params.state)}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminCommunityMember, { kind: 'top' });
}

/** Ce que le geste change : l'un, l'autre, ou les deux — jamais rien (la passerelle le refuse). */
export type AdminCommunityChange = { readonly isActive?: boolean; readonly isPrivate?: boolean };

/**
 * Le résultat d'un `PATCH` : la fiche à jour, ENVELOPPÉE. Une réponse réussie mais
 * illisible donnerait `null` — et `useAdminAction` rend `null` pour un ÉCHEC : sans
 * l'enveloppe, un geste accepté par la passerelle se lirait comme refusé.
 */
export type AdminCommunityUpdate = { readonly fiche: AdminCommunityFiche | null };

/**
 * **CHANGER L'ÉTAT D'UNE COMMUNAUTÉ** — `PATCH admin.communitiesByCommunityId`.
 * Le corps ne porte que ce qui change et le motif (`reason`, ≥ 10 caractères,
 * consigné dans le journal d'audit). La réponse est la fiche à jour.
 */
export async function updateAdminCommunity(
  params: AdminDeps & { readonly communityId: string; readonly change: AdminCommunityChange; readonly reason: string },
): Promise<ApiResult<AdminCommunityUpdate>> {
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: adminEndpoints.communitiesByCommunityId(params.communityId),
    body: {
      ...(params.change.isActive === undefined ? {} : { isActive: params.change.isActive }),
      ...(params.change.isPrivate === undefined ? {} : { isPrivate: params.change.isPrivate }),
      reason: params.reason,
    },
  });
  if (!result.ok) return result;
  return { ok: true, data: { fiche: decodeAdminCommunityFiche(result.data) } };
}
