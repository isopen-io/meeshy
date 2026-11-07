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
} as const satisfies CommunityMembershipCatalog;

export default enCommunityMembership;
