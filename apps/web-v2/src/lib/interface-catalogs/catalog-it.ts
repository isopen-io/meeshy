import type { InterfaceCatalog } from '@/lib/i18n-catalog';

const it = {
  'announce.messageSent': 'Messaggio inviato',
  'announce.messageCopied': 'Messaggio copiato',
  'announce.messagesCopied': 'Messaggi copiati',
  'announce.messageProtected': 'Messaggio protetto',
  'announce.selectionCap': 'Massimo {count} messaggi',
  'announce.nothingToCopy': 'Niente da copiare',

  'message.author.self': 'Tu',
  'message.excerpt.protected': 'contenuto protetto',
  'a11y.message.menu.subject': 'Azioni del messaggio di {author}: {excerpt}',

  'typing.named': '{name} sta scrivendo',
  'typing.double': '{first} e {second} stanno scrivendo',
  'typing.several': 'Più persone stanno scrivendo',

  'root.menu.feed': 'Feed',
  'root.menu.links': 'I miei link',
  'root.menu.notifications': 'Notifiche',
  'root.menu.calls': 'Chiamate',
  'root.menu.discover': 'Scopri',
  'root.menu.communities': 'Community',
  'root.menu.settings': 'Impostazioni',
  'root.menu.profile': 'Profilo',
  'a11y.floating.menu': 'Menu',
  'a11y.floating.menu.ladder': 'Navigazione Meeshy',

  'pending.back': 'Torna alle conversazioni',
  'pending.comingSoon': 'Questa schermata arriverà presto.',
  'pending.feed.promise': 'I post delle persone che segui.',
  'pending.links.promise': 'I link condivisi nelle tue conversazioni si raccoglieranno qui.',
  'pending.notifications.promise': 'Ciò che ti aspetta — menzioni, risposte, inviti — si leggerà qui.',
  'pending.calls.promise': 'La cronologia delle tue chiamate, e il modo per farne una.',
  'pending.discover.promise': 'Persone da conoscere, scelte in base a ciò che avete in comune.',
  'pending.communities.promise': 'Le community di cui fai parte, e quelle che ti somigliano.',
  'pending.settings.promise': 'Le tue lingue, la tua privacy, le tue notifiche.',
  'pending.profile.promise': 'La tua identità Meeshy — nome, foto, lingue e ciò che gli altri ne vedono.',
} satisfies InterfaceCatalog;

export default it;
