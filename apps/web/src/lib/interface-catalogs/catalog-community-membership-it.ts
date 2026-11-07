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
  'community.members.open': 'Membri',
  'community.members.title': 'Membri',
  'community.members.section.admin': 'Amministratori',
  'community.members.section.moderator': 'Moderatori',
  'community.members.section.member': 'Membri',
  'community.members.role.admin': 'Amministratore',
  'community.members.role.moderator': 'Moderatore',
  'community.members.role.member': 'Membro',
  'community.members.make.admin': 'Nomina amministratore',
  'community.members.make.moderator': 'Nomina moderatore',
  'community.members.make.member': 'Riporta a membro',
  'community.members.remove': 'Rimuovi dalla community',
  'community.members.remove.confirm.title': 'Rimuovere {name}?',
  'community.members.remove.confirm.body': '{name} non avrà più accesso alle conversazioni di questa community.',
  'community.members.remove.confirm.action': 'Rimuovi',
  'community.members.manage': 'Gestisci {name}',
  'community.members.you': 'Tu',
  'community.members.empty': 'Ancora nessun membro.',
  'community.members.loading': 'Caricamento dei membri…',
  'community.members.error': 'Impossibile caricare i membri.',
  'community.members.retry': 'Riprova',
  'community.members.refused': 'Solo un amministratore può gestire i membri.',
} as const satisfies CommunityMembershipCatalog;

export default itCommunityMembership;
