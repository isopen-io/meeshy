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
  'community.members.open': 'Mitglieder',
  'community.members.title': 'Mitglieder',
  'community.members.section.admin': 'Admins',
  'community.members.section.moderator': 'Moderatoren',
  'community.members.section.member': 'Mitglieder',
  'community.members.role.admin': 'Admin',
  'community.members.role.moderator': 'Moderator',
  'community.members.role.member': 'Mitglied',
  'community.members.make.admin': 'Zum Admin machen',
  'community.members.make.moderator': 'Zum Moderator machen',
  'community.members.make.member': 'Zum Mitglied machen',
  'community.members.remove': 'Aus der Community entfernen',
  'community.members.remove.confirm.title': '{name} entfernen?',
  'community.members.remove.confirm.body': '{name} hat dann keinen Zugriff mehr auf die Unterhaltungen dieser Community.',
  'community.members.remove.confirm.action': 'Entfernen',
  'community.members.manage': '{name} verwalten',
  'community.members.you': 'Du',
  'community.members.empty': 'Noch keine Mitglieder.',
  'community.members.loading': 'Mitglieder werden geladen…',
  'community.members.error': 'Die Mitglieder konnten nicht geladen werden.',
  'community.members.retry': 'Erneut versuchen',
  'community.members.refused': 'Nur ein Admin kann Mitglieder verwalten.',
  'community.invite.open': 'Einladen',
  'community.invite.title': 'Mitglieder einladen',
  'community.invite.search': 'Personen suchen',
  'community.invite.friends': 'Freunde',
  'community.invite.others': 'Weitere Personen',
  'community.invite.member': 'Bereits Mitglied',
  'community.invite.searching': 'Suche…',
  'community.invite.empty': 'Niemand gefunden.',
  'community.invite.offline': 'Offline: Verbinde dich erneut, um einzuladen.',
  'community.invite.submit.none': 'Einladen',
  'community.invite.submit.one': '1 Person einladen',
  'community.invite.submit.other': '{count} Personen einladen',
  'community.invite.done.one': '1 Person ist der Community beigetreten.',
  'community.invite.done.other': '{count} Personen sind der Community beigetreten.',
  'community.invite.partial': 'Einige Personen konnten nicht hinzugefügt werden.',
  'community.invite.failed': 'Die Einladung ist fehlgeschlagen. Versuche es erneut.',
  'community.invite.refused': 'Du kannst in diese Community nicht mehr einladen.',
  'community.create.members.title': 'Mitglieder hinzufügen',
  'community.create.members.search': 'Nach Name oder Benutzername suchen…',
  'community.create.members.remove': '{name} entfernen',
} as const satisfies CommunityMembershipCatalog;

export default deCommunityMembership;
