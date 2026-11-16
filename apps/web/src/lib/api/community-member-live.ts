import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { communityQueryKey, type CommunityPage, type CommunitySummary, type CommunityViewerRole } from './communities';
import { communityMembersQueryKey } from './community-members';

/**
 * **L'EFFECTIF D'UNE COMMUNAUTÉ SUIT SES GESTES** (#18766) —
 * `community:member-joined`, `community:member-left`,
 * `community:member-role-updated`, posés par la passerelle sur la room
 * personnelle de chaque membre actif, du créateur et de la personne concernée.
 *
 * Appliqué au cache, jamais traduit en relance de ce que la charge dit déjà :
 * `memberCount` se recopie sur le détail et chaque liste ; un événement qui
 * concerne le LECTEUR change son rôle (le menu de gestion suit). La liste des
 * membres ouverte se RELIT : la charge ne nomme la personne que par son
 * identifiant, et la relecture repasse par les gardes de la passerelle
 * (présence, blocage). Le lecteur sorti de la communauté relit aussi le
 * détail et les listes : une communauté privée cesse de lui être servie.
 */

export type CommunityMemberEventName =
  | typeof SERVER_EVENTS.COMMUNITY_MEMBER_JOINED
  | typeof SERVER_EVENTS.COMMUNITY_MEMBER_LEFT
  | typeof SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED;

export const COMMUNITY_MEMBER_EVENTS: readonly CommunityMemberEventName[] = [
  SERVER_EVENTS.COMMUNITY_MEMBER_JOINED,
  SERVER_EVENTS.COMMUNITY_MEMBER_LEFT,
  SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED,
];

type MemberChange = {
  readonly communityId: string;
  readonly userId: string;
  readonly memberCount: number;
  /** Le rôle que la personne TIENT après le geste ; `null` quand elle est sortie. */
  readonly role: CommunityViewerRole | null;
};

const ROLES: readonly CommunityViewerRole[] = ['admin', 'moderator', 'member'];

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null;

const roleOf = (value: unknown): CommunityViewerRole | undefined => ROLES.find((role) => role === value);

function decodeChange(event: CommunityMemberEventName, payload: unknown): MemberChange | null {
  const record = asRecord(payload);
  if (record === null) return null;
  const { communityId, userId, memberCount } = record;
  if (typeof communityId !== 'string' || communityId === '' || typeof userId !== 'string' || userId === '') return null;
  if (typeof memberCount !== 'number' || !Number.isFinite(memberCount) || memberCount < 0) return null;
  const base = { communityId, userId, memberCount: Math.floor(memberCount) };
  if (event === SERVER_EVENTS.COMMUNITY_MEMBER_LEFT) return { ...base, role: null };
  const role = roleOf(record['role']);
  return role === undefined ? null : { ...base, role };
}

const patchOf = (change: MemberChange, viewerId: string): Partial<CommunitySummary> =>
  change.userId === viewerId ? { memberCount: change.memberCount, viewerRole: change.role } : { memberCount: change.memberCount };

const isCommunityList = (data: unknown): data is InfiniteData<CommunityPage, number> => {
  const record = asRecord(data);
  return record !== null && Array.isArray(record['pages']);
};

const LIST_KEY = ['communities', 'list'] as const;

export function applyCommunityMemberEvent(
  queryClient: QueryClient,
  event: CommunityMemberEventName,
  payload: unknown,
  viewerId: string,
): void {
  const change = decodeChange(event, payload);
  if (change === null) return;
  const patch = patchOf(change, viewerId);

  const detail = queryClient.getQueryData<CommunitySummary>(communityQueryKey(change.communityId));
  if (detail !== undefined) queryClient.setQueryData<CommunitySummary>(communityQueryKey(change.communityId), { ...detail, ...patch });

  queryClient.getQueriesData<InfiniteData<CommunityPage, number>>({ queryKey: LIST_KEY }).forEach(([queryKey, list]) => {
    if (!isCommunityList(list) || !list.pages.some((page) => page.communities.some((c) => c.id === change.communityId))) return;
    const pages = list.pages.map((page) => ({
      ...page,
      communities: page.communities.map((c) => (c.id === change.communityId ? { ...c, ...patch } : c)),
    }));
    queryClient.setQueryData<InfiniteData<CommunityPage, number>>(queryKey, { ...list, pages });
  });

  void queryClient.invalidateQueries({ queryKey: communityMembersQueryKey(change.communityId) });
  if (change.userId === viewerId && change.role === null) {
    void queryClient.invalidateQueries({ queryKey: communityQueryKey(change.communityId) });
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
  }
}
