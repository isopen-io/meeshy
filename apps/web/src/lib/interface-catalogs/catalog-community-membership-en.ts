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
} as const satisfies CommunityMembershipCatalog;

export default enCommunityMembership;
