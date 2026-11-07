import type { CommunityMembershipCatalog } from '../i18n-community-membership-catalog';

/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — tranche italienne du
 * catalogue, chargée avec le détail
 * d'une communauté (`i18n-community-membership-catalog.ts`). Libellés repris d'iOS
 * (`CommunityDetailScreen.swift`, `community.detail.leave.*`).
 */
const itCommunityMembership = {
  'community.membership.join': 'Unisciti',
  'community.membership.leave': 'Lascia la community',
  'community.membership.leave.confirm.title': 'Lasciare la community?',
  'community.membership.leave.confirm.body': 'Non potrai più accedere alle conversazioni di questa community.',
  'community.membership.leave.confirm.action': 'Lascia',
  'community.membership.offline': 'Offline.',
  'community.membership.error': 'Non riuscito. Riprova.',
  'community.membership.error.refused': 'Questa community è privata: si entra solo su invito.',
} as const satisfies CommunityMembershipCatalog;

export default itCommunityMembership;
