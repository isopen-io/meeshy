/**
 * LE CATALOGUE D'INTERFACE FRANÇAIS (#6206) — la SOURCE DES CLÉS. Les six
 * autres langues portent exactement celles-ci : `satisfies InterfaceCatalog`
 * le vérifie à la compilation, `i18n-catalog.test.ts` le mesure à l'exécution.
 *
 * Les noms reprennent ceux d'iOS (`apps/ios/Meeshy/Localizable.xcstrings`)
 * partout où iOS en a un — `root.menu.*`, `a11y.floating.menu`, `typing.*` ;
 * les autres sont propres au web et le disent par leur préfixe (`pending.*`).
 * Un paramètre s'écrit `{nom}` et se place là où la LANGUE le veut, jamais là
 * où un site d'appel le concatène.
 */
const fr = {
  'announce.messageSent': 'Message envoyé',
  'announce.messageCopied': 'Message copié',
  'announce.messagesCopied': 'Messages copiés',
  'announce.messageProtected': 'Message protégé',
  'announce.selectionCap': 'Maximum {count} messages',
  'announce.nothingToCopy': 'Rien à copier',

  'message.author.self': 'Vous',
  'message.excerpt.protected': 'contenu protégé',
  'a11y.message.menu.subject': 'Actions du message de {author} : {excerpt}',

  'typing.named': '{name} écrit',
  'typing.double': '{first} et {second} écrivent',
  'typing.several': 'Plusieurs personnes écrivent',

  'root.menu.feed': 'Flux',
  'root.menu.links': 'Mes liens',
  'root.menu.notifications': 'Notifications',
  'root.menu.calls': 'Appels',
  'root.menu.discover': 'Découvrir',
  'root.menu.communities': 'Communautés',
  'root.menu.settings': 'Réglages',
  'root.menu.profile': 'Profil',
  'a11y.floating.menu': 'Menu',
  'a11y.floating.menu.ladder': 'Navigation Meeshy',
  'a11y.floating.menu.unread.one': 'Menu, {count} notification non lue',
  'a11y.floating.menu.unread.other': 'Menu, {count} notifications non lues',

  'notifications.category.all': 'Toutes',
  'notifications.category.unread': 'Non lues',
  'notifications.category.messages': 'Messages',
  'notifications.category.reactions': 'Réactions',
  'notifications.category.mentions': 'Mentions',
  'notifications.category.social': 'Social',
  'notifications.category.contacts': 'Contacts',
  'notifications.category.groups': 'Groupes',
  'notifications.category.calls': 'Appels',
  'notifications.category.translations': 'Traductions',
  'notifications.category.system': 'Système',
  'notifications.categories': 'Catégories de notifications',
  'notifications.markAllRead': 'Tout lire',
  'notifications.unreadCount.one': '{count} non lue',
  'notifications.unreadCount.other': '{count} non lues',
  'notifications.unread': 'Non lue',
  'notifications.empty.all': 'Aucune notification',
  'notifications.empty.unread': 'Aucune notification non lue',
  'notifications.empty.category': 'Aucune notification dans « {category} »',
  'notifications.empty.subtitle': 'Vos notifications apparaîtront ici',
  'notifications.loading': 'Chargement des notifications',
  'notifications.error.title': 'Impossible de charger les notifications',
  'notifications.error.body': 'Réessayez dans un instant.',
  'notifications.offline.title': 'Hors ligne',
  'notifications.offline.body': 'Vos notifications s’afficheront à la reconnexion.',
  'notifications.retry': 'Réessayer',
  'notifications.allLoaded': 'Toutes les notifications sont chargées',
  'notifications.actions': 'Actions de la notification',
  'notifications.action.markRead': 'Marquer comme lue',
  'notifications.action.delete': 'Supprimer',
  'notifications.failure': 'L’action n’a pas abouti. Réessayez.',

  'pending.back': 'Revenir aux conversations',
  'pending.comingSoon': 'Cet écran arrive bientôt.',
  'pending.feed.promise': 'Les publications de celles et ceux que vous suivez.',
  'pending.links.promise': 'Les liens partagés dans vos conversations se rassembleront ici.',
  'pending.notifications.promise': 'Ce qui vous attend — mentions, réponses, invitations — se lira ici.',
  'pending.calls.promise': 'Le journal de vos appels, et de quoi en passer un.',
  'pending.discover.promise': 'Des personnes à rencontrer, choisies par ce que vous avez en commun.',
  'pending.communities.promise': 'Les communautés dont vous faites partie, et celles qui vous ressemblent.',
  'pending.settings.promise': 'Vos langues, votre confidentialité, vos notifications.',
  'pending.profile.promise': 'Votre identité Meeshy — nom, photo, langues, et ce que les autres en voient.',
} as const;

export default fr;
