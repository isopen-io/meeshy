import type { CommunityMembershipCatalog } from '../i18n-community-membership-catalog';

/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — tranche portugaise du
 * catalogue, chargée avec le détail
 * d'une communauté (`i18n-community-membership-catalog.ts`). Libellés repris d'iOS
 * (`CommunityDetailScreen.swift`, `community.detail.leave.*`).
 */
const ptCommunityMembership = {
  'community.membership.join': 'Participar',
  'community.membership.leave': 'Sair da comunidade',
  'community.membership.leave.confirm.title': 'Sair da comunidade?',
  'community.membership.leave.confirm.body': 'Você não poderá mais acessar as conversas desta comunidade.',
  'community.membership.leave.confirm.action': 'Sair',
  'community.membership.offline': 'Offline.',
  'community.membership.error': 'Falhou. Tente novamente.',
  'community.membership.error.refused': 'Esta comunidade é privada: só se entra por convite.',
} as const satisfies CommunityMembershipCatalog;

export default ptCommunityMembership;
