import type { CommunityMembershipCatalog } from '../i18n-community-membership-catalog';

/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — tranche anglaise du
 * catalogue, chargée avec le détail
 * d'une communauté (`i18n-community-membership-catalog.ts`). Libellés repris d'iOS
 * (`CommunityDetailScreen.swift`, `community.detail.leave.*`).
 */
const enCommunityMembership = {
  'community.membership.join': 'Join',
  'community.membership.leave': 'Leave community',
  'community.membership.leave.confirm.title': 'Leave this community?',
  'community.membership.leave.confirm.body': 'You will no longer have access to this community’s conversations.',
  'community.membership.leave.confirm.action': 'Leave',
  'community.membership.offline': 'Offline.',
  'community.membership.error': 'Failed. Try again.',
  'community.membership.error.refused': 'This community is private: you can only join by invitation.',
  'community.settings.open': "Settings",
  'community.members.open': 'Members',
  'community.members.title': 'Members',
  'community.members.section.admin': 'Admins',
  'community.members.section.moderator': 'Moderators',
  'community.members.section.member': 'Members',
  'community.members.role.admin': 'Admin',
  'community.members.role.moderator': 'Moderator',
  'community.members.role.member': 'Member',
  'community.members.make.admin': 'Make admin',
  'community.members.make.moderator': 'Make moderator',
  'community.members.make.member': 'Make member',
  'community.members.remove': 'Remove from community',
  'community.members.remove.confirm.title': 'Remove {name}?',
  'community.members.remove.confirm.body': '{name} will no longer have access to this community’s conversations.',
  'community.members.remove.confirm.action': 'Remove',
  'community.members.manage': 'Manage {name}',
  'community.members.you': 'You',
  'community.members.empty': 'No members yet.',
  'community.members.loading': 'Loading members…',
  'community.members.error': 'Members could not be loaded.',
  'community.members.retry': 'Try again',
  'community.members.refused': 'Only an admin can manage members.',
  'community.invite.open': 'Invite',
  'community.invite.title': 'Invite members',
  'community.invite.search': 'Search people',
  'community.invite.friends': 'Friends',
  'community.invite.others': 'Other people',
  'community.invite.member': 'Already a member',
  'community.invite.searching': 'Searching…',
  'community.invite.empty': 'No one found.',
  'community.invite.offline': 'Offline: reconnect to invite.',
  'community.invite.submit.none': 'Invite',
  'community.invite.submit.one': 'Invite 1 person',
  'community.invite.submit.other': 'Invite {count} people',
  'community.invite.done.one': '1 person joined the community.',
  'community.invite.done.other': '{count} people joined the community.',
  'community.invite.partial': 'Some people could not be added.',
  'community.invite.failed': 'The invitation failed. Try again.',
  'community.invite.refused': 'You can no longer invite to this community.',
  'community.create.members.title': 'Add members',
  'community.create.members.search': 'Search by name or username…',
  'community.create.members.remove': 'Remove {name}',
} as const satisfies CommunityMembershipCatalog;

export default enCommunityMembership;
