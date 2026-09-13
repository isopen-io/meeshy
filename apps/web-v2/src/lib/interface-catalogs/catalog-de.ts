import type { InterfaceCatalog } from '@/lib/i18n-catalog';

const de = {
  'announce.messageSent': 'Nachricht gesendet',
  'announce.messageCopied': 'Nachricht kopiert',
  'announce.messagesCopied': 'Nachrichten kopiert',
  'announce.messageProtected': 'Geschützte Nachricht',
  'announce.selectionCap': 'Maximal {count} Nachrichten',
  'announce.nothingToCopy': 'Nichts zu kopieren',

  'message.author.self': 'Du',
  'message.excerpt.protected': 'geschützter Inhalt',
  'a11y.message.menu.subject': 'Aktionen für die Nachricht von {author}: {excerpt}',

  'typing.named': '{name} schreibt',
  'typing.double': '{first} und {second} schreiben',
  'typing.several': 'Mehrere Personen schreiben',

  'root.menu.feed': 'Feed',
  'root.menu.links': 'Meine Links',
  'root.menu.notifications': 'Mitteilungen',
  'root.menu.calls': 'Anrufe',
  'root.menu.discover': 'Entdecken',
  'root.menu.communities': 'Communitys',
  'root.menu.settings': 'Einstellungen',
  'root.menu.profile': 'Profil',
  'a11y.floating.menu': 'Menü',
  'a11y.floating.menu.ladder': 'Meeshy-Navigation',

  'pending.back': 'Zurück zu den Unterhaltungen',
  'pending.comingSoon': 'Dieser Bildschirm kommt bald.',
  'pending.feed.promise': 'Die Beiträge der Menschen, denen du folgst.',
  'pending.links.promise': 'Die in deinen Unterhaltungen geteilten Links werden hier gesammelt.',
  'pending.notifications.promise': 'Was auf dich wartet — Erwähnungen, Antworten, Einladungen — liest du hier.',
  'pending.calls.promise': 'Dein Anrufverlauf und die Möglichkeit, jemanden anzurufen.',
  'pending.discover.promise': 'Menschen zum Kennenlernen, ausgewählt nach euren Gemeinsamkeiten.',
  'pending.communities.promise': 'Die Communitys, zu denen du gehörst, und die, die zu dir passen.',
  'pending.settings.promise': 'Deine Sprachen, deine Privatsphäre, deine Mitteilungen.',
  'pending.profile.promise': 'Deine Meeshy-Identität — Name, Foto, Sprachen und was andere davon sehen.',
} satisfies InterfaceCatalog;

export default de;
