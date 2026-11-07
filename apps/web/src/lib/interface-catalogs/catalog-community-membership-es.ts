import type { CommunityMembershipCatalog } from '../i18n-community-membership-catalog';

/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — tranche espagnole du
 * catalogue, chargée avec le détail
 * d'une communauté (`i18n-community-membership-catalog.ts`). Libellés repris d'iOS
 * (`CommunityDetailScreen.swift`, `community.detail.leave.*`).
 */
const esCommunityMembership = {
  'community.membership.join': 'Unirse',
  'community.membership.leave': 'Salir de la comunidad',
  'community.membership.leave.confirm.title': '¿Salir de la comunidad?',
  'community.membership.leave.confirm.body': 'Ya no podrás acceder a las conversaciones de esta comunidad.',
  'community.membership.leave.confirm.action': 'Salir',
  'community.membership.offline': 'Sin conexión.',
  'community.membership.error': 'Error. Inténtalo de nuevo.',
  'community.membership.error.refused': 'Esta comunidad es privada: solo se entra por invitación.',
} as const satisfies CommunityMembershipCatalog;

export default esCommunityMembership;
