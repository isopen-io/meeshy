/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — tranche française du
 * catalogue, chargée avec le détail
 * d'une communauté (`i18n-community-membership-catalog.ts`). Libellés repris d'iOS
 * (`CommunityDetailScreen.swift`, `community.detail.leave.*`).
 */
const frCommunityMembership = {
  'community.membership.join': 'Rejoindre',
  'community.membership.leave': 'Quitter la communauté',
  'community.membership.leave.confirm.title': 'Quitter la communauté ?',
  'community.membership.leave.confirm.body': 'Vous ne pourrez plus accéder aux conversations de cette communauté.',
  'community.membership.leave.confirm.action': 'Quitter',
  'community.membership.offline': 'Hors ligne.',
  'community.membership.error': 'Échec. Réessayez.',
  'community.membership.error.refused': 'Cette communauté est privée : on n’y entre que sur invitation.',
} as const;

export default frCommunityMembership;
