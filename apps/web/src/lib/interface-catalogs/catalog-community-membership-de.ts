import type { CommunityMembershipCatalog } from '../i18n-community-membership-catalog';

/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — tranche allemande du
 * catalogue, chargée avec le détail
 * d'une communauté (`i18n-community-membership-catalog.ts`). Libellés repris d'iOS
 * (`CommunityDetailScreen.swift`, `community.detail.leave.*`).
 */
const deCommunityMembership = {
  'community.membership.join': 'Beitreten',
  'community.membership.leave': 'Community verlassen',
  'community.membership.leave.confirm.title': 'Community verlassen?',
  'community.membership.leave.confirm.body': 'Du hast dann keinen Zugriff mehr auf die Unterhaltungen dieser Community.',
  'community.membership.leave.confirm.action': 'Verlassen',
  'community.membership.offline': 'Offline.',
  'community.membership.error': 'Fehlgeschlagen. Versuche es erneut.',
  'community.membership.error.refused': 'Diese Community ist privat: Beitritt nur auf Einladung.',
} as const satisfies CommunityMembershipCatalog;

export default deCommunityMembership;
