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
  'community.members.open': 'Miembros',
  'community.members.title': 'Miembros',
  'community.members.section.admin': 'Administradores',
  'community.members.section.moderator': 'Moderadores',
  'community.members.section.member': 'Miembros',
  'community.members.role.admin': 'Administrador',
  'community.members.role.moderator': 'Moderador',
  'community.members.role.member': 'Miembro',
  'community.members.make.admin': 'Nombrar administrador',
  'community.members.make.moderator': 'Nombrar moderador',
  'community.members.make.member': 'Volver a miembro',
  'community.members.remove': 'Quitar de la comunidad',
  'community.members.remove.confirm.title': '¿Quitar a {name}?',
  'community.members.remove.confirm.body': '{name} ya no tendrá acceso a las conversaciones de esta comunidad.',
  'community.members.remove.confirm.action': 'Quitar',
  'community.members.manage': 'Gestionar a {name}',
  'community.members.you': 'Tú',
  'community.members.empty': 'Aún no hay miembros.',
  'community.members.loading': 'Cargando miembros…',
  'community.members.error': 'No se pudieron cargar los miembros.',
  'community.members.retry': 'Reintentar',
  'community.members.refused': 'Solo un administrador puede gestionar a los miembros.',
} as const satisfies CommunityMembershipCatalog;

export default esCommunityMembership;
