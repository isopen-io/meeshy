/**
 * L'IDENTITÉ D'UNE PERSONNE ET D'UNE CONVERSATION — tranche du catalogue `catalog-de.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. Les libellés des liens d'avatar (#7241) et le menu d'appui long
 * d'un avatar (#7828), miroir `avatar.menu.*` d'iOS
 * (`MeeshyAvatar.swift:331-354`), et la feuille de détails d'une
 * conversation (#7829, miroir `ConversationInfoSheet.swift`), et la pile des
 * participants les plus actifs de l'en-tête (#7830).
 */
const deIdentity = {
  'a11y.avatar.profile': 'Profil von {name} ansehen',
  'a11y.avatar.story': 'Story von {name} ansehen',
  'avatar.menu.label': 'Aktionen für {name}',
  'avatar.menu.view_profile': 'Profil ansehen',
  'avatar.menu.view_story': 'Story ansehen',
  'avatar.menu.conversation_details': 'Details der Unterhaltung',
  'conversation.details.title': 'Details der Unterhaltung',
  'conversation.details.open': 'Details von {name} ansehen',
  'conversation.details.type.direct': 'Privater Chat',
  'conversation.details.type.group': 'Gruppe',
  'conversation.details.type.public': 'Öffentliche Unterhaltung',
  'conversation.details.type.global': 'Globale Unterhaltung',
  'conversation.details.type.broadcast': 'Übertragung',
  'conversation.details.members.one': '{count} Mitglied',
  'conversation.details.members.other': '{count} Mitglieder',
  'conversation.details.members.section': 'Mitglieder',
  'conversation.details.members.loading': 'Mitglieder werden geladen',
  'conversation.details.members.error': 'Die Mitglieder konnten nicht geladen werden.',
  'conversation.details.members.retry': 'Erneut versuchen',
  'conversation.details.members.empty': 'Keine Mitglieder anzuzeigen.',
  'conversation.details.members.more': 'Weitere Mitglieder anzeigen',
  'conversation.details.members.you': 'Du',
  'conversation.details.role.creator': 'Ersteller',
  'conversation.details.role.admin': 'Administrator',
  'conversation.details.role.moderator': 'Moderator',
  'conversation.details.share': 'Link teilen',
  'conversation.details.share.busy': 'Link wird erstellt…',
  'conversation.details.share.copied': 'Link kopiert – jetzt nur noch einfügen.',
  'conversation.details.share.failed': 'Der Link konnte nicht erstellt werden – versuche es gleich noch einmal.',
  'conversation.details.share.unavailable': 'Teilen ist hier nicht möglich – kopiere den Link: {url}',
  'thread.header.active_members': 'Aktivste Mitglieder',
};

export default deIdentity;
