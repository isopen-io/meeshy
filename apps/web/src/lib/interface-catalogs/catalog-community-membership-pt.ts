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
  'community.members.open': 'Membros',
  'community.members.title': 'Membros',
  'community.members.section.admin': 'Administradores',
  'community.members.section.moderator': 'Moderadores',
  'community.members.section.member': 'Membros',
  'community.members.role.admin': 'Administrador',
  'community.members.role.moderator': 'Moderador',
  'community.members.role.member': 'Membro',
  'community.members.make.admin': 'Tornar administrador',
  'community.members.make.moderator': 'Tornar moderador',
  'community.members.make.member': 'Voltar a membro',
  'community.members.remove': 'Remover da comunidade',
  'community.members.remove.confirm.title': 'Remover {name}?',
  'community.members.remove.confirm.body': '{name} não terá mais acesso às conversas desta comunidade.',
  'community.members.remove.confirm.action': 'Remover',
  'community.members.manage': 'Gerenciar {name}',
  'community.members.you': 'Você',
  'community.members.empty': 'Ainda não há membros.',
  'community.members.loading': 'Carregando membros…',
  'community.members.error': 'Não foi possível carregar os membros.',
  'community.members.retry': 'Tentar novamente',
  'community.members.refused': 'Só um administrador pode gerenciar os membros.',
} as const satisfies CommunityMembershipCatalog;

export default ptCommunityMembership;
