/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — tranche anglaise du
 * catalogue, RÉPANDUE par `catalog-en.ts`. Libellés repris d'iOS
 * (`CommunityDetailScreen.swift`, `community.detail.leave.*`).
 */
const enCommunityMembership = {
  'community.membership.join': 'Join',
  'community.membership.joining': 'Joining…',
  'community.membership.leave': 'Leave community',
  'community.membership.leaving': 'Leaving…',
  'community.membership.leave.confirm.title': 'Leave this community?',
  'community.membership.leave.confirm.body': 'You will no longer have access to this community’s conversations.',
  'community.membership.leave.confirm.action': 'Leave',
  'community.membership.cancel': 'Cancel',
  'community.membership.offline': 'You’re offline: reconnect to join or leave this community.',
  'community.membership.error.join': 'Couldn’t join this community. Try again.',
  'community.membership.error.refused': 'This community is private: you can only join by invitation.',
  'community.membership.error.leave': 'Couldn’t leave this community. Try again.',
} as const;

export default enCommunityMembership;
