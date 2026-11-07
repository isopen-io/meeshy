import type { ApiResult } from './http';
import type { CommunityMember, CommunityMemberPage, CommunityMemberRole } from './community-members';
import { COMMUNITY_MEMBERS_PAGE_SIZE } from './community-members';
import { fixtureCommunity } from './fixtures-communities';
import { VIEWER_ID } from './fixtures-base';

/**
 * **LES MEMBRES DES COMMUNAUTÉS DE RECETTE** (#6375) — servis par le même
 * chemin que la passerelle (`community-members.ts`, garde `__FIXTURES__`),
 * élagués de tout build `gateway`.
 *
 * « Équipe déploiement » est celle que le lecteur a CRÉÉE : il y est
 * administrateur, et c'est elle qui fait voir au gate navigateur le menu d'une
 * ligne (changer le rôle, retirer). Les refus sont ceux de la passerelle :
 * 403 sur le créateur, 404 sur une ligne absente. Aucune présence n'est servie
 * hors amitié : seule Amina, amie du lecteur dans le jeu de fixtures, est dite
 * en ligne.
 */

const person = (id: string, userId: string, name: string, username: string, role: CommunityMemberRole, online = false): CommunityMember => ({
  id,
  userId,
  role,
  name,
  username,
  avatar: null,
  online,
});

const INITIAL: Readonly<Record<string, readonly CommunityMember[]>> = {
  'm-deploiement': [
    person('cm-1', VIEWER_ID, 'Vous', 'vous', 'admin'),
    person('cm-2', 'u-amina', 'Amina Diallo', 'amina', 'admin', true),
    person('cm-3', 'u-kwame', 'Kwame Mensah', 'kwame', 'moderator'),
    person('cm-4', 'u-ines', 'Inès Ferreira', 'ines', 'member'),
    person('cm-5', 'u-yuki', 'Yuki Tanaka', 'yuki', 'member'),
  ],
  'm-polyglottes': [
    person('cp-1', 'u-amina', 'Amina Diallo', 'amina', 'admin', true),
    person('cp-2', VIEWER_ID, 'Vous', 'vous', 'member'),
    person('cp-3', 'u-kwame', 'Kwame Mensah', 'kwame', 'member'),
  ],
};

const state: { members: Readonly<Record<string, readonly CommunityMember[]>> } = { members: INITIAL };

const resolved = (communityId: string) => fixtureCommunity(communityId);

export function fixtureCommunityMembers(communityId: string, offset: number): ApiResult<CommunityMemberPage> {
  const community = resolved(communityId);
  if (community === null) return { ok: false, status: 404, error: 'Community not found' };
  const all = state.members[community.id] ?? [];
  const page = all.slice(offset, offset + COMMUNITY_MEMBERS_PAGE_SIZE);
  const next = offset + page.length;
  return { ok: true, data: { members: page, nextOffset: next < all.length ? next : null } };
}

const write = (communityId: string, members: readonly CommunityMember[]) => {
  state.members = { ...state.members, [communityId]: members };
};

export function fixtureChangeMemberRole(communityId: string, rowId: string, role: CommunityMemberRole): ApiResult<null> {
  const community = resolved(communityId);
  if (community === null) return { ok: false, status: 404, error: 'Community not found' };
  if (community.viewerRole !== 'admin') return { ok: false, status: 403, error: 'Only community admins can update member roles' };
  const members = state.members[community.id] ?? [];
  const target = members.find((member) => member.id === rowId);
  if (target === undefined) return { ok: false, status: 404, error: 'Member not found in this community' };
  if (target.userId === community.createdBy) return { ok: false, status: 403, error: 'The community creator keeps their role', code: 'COMMUNITY_CREATOR_PROTECTED' };
  write(community.id, members.map((member) => (member.id === rowId ? { ...member, role } : member)));
  return { ok: true, data: null };
}

export function fixtureRemoveMember(communityId: string, userId: string): ApiResult<null> {
  const community = resolved(communityId);
  if (community === null) return { ok: false, status: 404, error: 'Community not found' };
  if (community.viewerRole !== 'admin') return { ok: false, status: 403, error: 'Only community admins can remove members' };
  if (userId === community.createdBy) return { ok: false, status: 403, error: 'The community creator cannot be removed', code: 'COMMUNITY_CREATOR_PROTECTED' };
  const members = state.members[community.id] ?? [];
  if (!members.some((member) => member.userId === userId)) return { ok: false, status: 404, error: 'Member not found in this community' };
  write(community.id, members.filter((member) => member.userId !== userId));
  return { ok: true, data: null };
}

const INVITABLE: Readonly<Record<string, { readonly name: string; readonly username: string }>> = {
  'u-bruno': { name: 'Bruno Laurent', username: 'bruno.laurent' },
  'u-amina': { name: 'Amina Diallo', username: 'amina' },
  'u-kwame': { name: 'Kwame Mensah', username: 'kwame' },
  'u-ines': { name: 'Inès Ferreira', username: 'ines' },
  'u-yuki': { name: 'Yuki Tanaka', username: 'yuki' },
};

/** `POST …/invite` de la recette (#6376) : mêmes refus que la passerelle — non-membre, simple membre d'une privée, inconnu, déjà membre. */
export function fixtureInviteMember(communityId: string, userId: string): ApiResult<CommunityMember> {
  const community = resolved(communityId);
  if (community === null) return { ok: false, status: 404, error: 'Community not found' };
  const role = community.viewerRole;
  if (role === null || role === undefined) return { ok: false, status: 403, error: 'You must be a member to invite others' };
  if (community.isPrivate && role === 'member') return { ok: false, status: 403, error: 'Only admins and moderators can invite to private communities' };
  const invitee = INVITABLE[userId];
  if (invitee === undefined) return { ok: false, status: 404, error: 'User to invite not found' };
  const members = state.members[community.id] ?? [];
  if (members.some((member) => member.userId === userId)) return { ok: false, status: 409, error: 'User is already a member of this community' };
  const added = person(`ci-${userId}`, userId, invitee.name, invitee.username, 'member');
  write(community.id, [...members, added]);
  return { ok: true, data: added };
}
