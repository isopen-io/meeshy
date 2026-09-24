/**
 * LE CATALOGUE D'INTERFACE D'ADMINISTRATION FRANÇAIS (#6871, #6834) — la
 * SOURCE DES CLÉS `admin.*`, sorties de `catalog-fr.ts` parce qu'un lecteur
 * qui n'ouvre jamais `/adm` les payait quand même : 84 clés sur 629, 13 % du
 * poids que TOUT lecteur téléchargeait. Chargé SEULEMENT à l'entrée d'un
 * écran d'administration (`i18n-admin-catalog.ts`), jamais au démarrage.
 *
 * Les six autres langues portent exactement ces clés : `satisfies
 * AdminInterfaceCatalog` le vérifie à la compilation,
 * `i18n-admin-catalog.test.ts` le mesure à l'exécution — même discipline que
 * `catalog-fr.ts` pour le catalogue commun. `admin.title` seul reste dans ce
 * dernier : la rangée des Réglages et le menu flottant le lisent sans jamais
 * entrer dans l'administration.
 */
const fr = {
  'admin.role': 'Votre rôle : {role}',
  'admin.denied.title': 'Espace réservé',
  'admin.denied.message': 'Cet espace demande un droit d\'administration.',
  'admin.counters.title': 'En un coup d\'œil',
  'admin.counters.unavailable': 'Compteurs indisponibles pour le moment.',
  'admin.counters.users': 'Comptes',
  'admin.counters.activeUsers': 'Comptes actifs',
  'admin.counters.messages': 'Messages',
  'admin.counters.communities': 'Communautés',
  'admin.counters.reports': 'Signalements',
  'admin.counters.newUsers': 'Nouveaux (24 h)',
  'admin.sections.title': 'Sections',
  'admin.nav.dashboard': 'Tableau de bord',
  'admin.nav.users': 'Comptes',
  'admin.nav.moderation': 'Modération',
  'admin.nav.audit': 'Journaux d\'audit',
  'admin.nav.analytics': 'Statistiques',
  'admin.nav.trackingLinks': 'Liens de suivi',
  'admin.nav.ranking': 'Classement',
  'admin.nav.broadcasts': 'Diffusions',
  'admin.nav.settings': 'Réglages',
  'admin.nav.agent': 'Agent',
  'admin.nav.monitoring': 'Supervision',
  'admin.users.search': 'Rechercher un compte',
  'admin.users.count': '{count} compte(s)',
  'admin.users.empty': 'Aucun compte ne correspond.',
  'admin.users.unavailable': 'Liste indisponible pour le moment.',
  'admin.users.inactive': 'désactivé',
  'admin.users.previous': 'Précédents',
  'admin.users.next': 'Suivants',
  'admin.user.title': 'Membre',
  'admin.user.unavailable': 'Fiche indisponible pour le moment.',
  'admin.user.identity': 'Identité',
  'admin.user.account': 'Compte',
  'admin.user.created': 'Inscrit le',
  'admin.user.lastActive': 'Dernière activité',
  'admin.user.twoFactor': 'Second facteur',
  'admin.user.enabled': 'activé',
  'admin.user.deleted': 'supprimé',
  'admin.user.role': 'Rôle',
  'admin.edit.open': 'Modifier',
  'admin.edit.title': 'Modifier le membre',
  'admin.edit.displayName': 'Nom affiché',
  'admin.edit.email': 'E-mail',
  'admin.edit.bio': 'Bio',
  'admin.edit.active': 'Compte actif',
  'admin.edit.save': 'Enregistrer',
  'admin.edit.reason': 'Motif (facultatif)',
  'admin.edit.warnRole': 'Changer le rôle modifie ses droits.',
  'admin.edit.warnDeactivate': 'Désactiver ferme ses sessions ouvertes.',
  'admin.edit.confirm': 'Confirmer',
  'admin.edit.saved': 'Modifications enregistrées',
  'admin.edit.failed': 'Échec de l’enregistrement',
  'admin.password.title': 'Réinitialiser le mot de passe',
  'admin.password.warn': 'Cette action ferme toutes ses sessions ouvertes.',
  'admin.password.generated': 'Copiez-le maintenant : il ne sera plus affiché.',
  'admin.password.copy': 'Copier',
  'admin.password.copied': 'Copié',
  'admin.password.apply': 'Réinitialiser',
  'admin.password.done': 'Mot de passe réinitialisé',
  'admin.password.failed': 'Échec de la réinitialisation',
  'admin.ban.open': 'Bannir',
  'admin.ban.title': 'Bannir ce membre',
  'admin.ban.reason': 'Motif (obligatoire)',
  'admin.ban.permanent': 'Bannissement permanent',
  'admin.ban.until': 'Jusqu’au',
  'admin.ban.apply': 'Bannir',
  'admin.ban.lift': 'Lever',
  'admin.ban.active': 'en vigueur',
  'admin.ban.expired': 'expiré',
  'admin.ban.lifted': 'levé',
  'admin.ban.none': 'Aucun bannissement',
  'admin.ban.done': 'Bannissement enregistré',
  'admin.ban.failed': 'Échec du bannissement',
  'admin.media.title': 'Médias',
  'admin.media.empty': 'Aucun média',
  'admin.media.protected': 'protégé',
  'admin.media.fromPost': 'publication',
  'admin.media.fromMessage': 'message',
  'admin.conv.title': 'Conversations',
  'admin.conv.empty': 'Aucune conversation',
  'admin.conv.members': '{count} membres',
  'admin.nav.conversations': 'Conversations',
  'admin.convList.search': 'Rechercher une conversation',
  'admin.convList.count': '{count} conversation(s)',
  'admin.convList.empty': 'Aucune conversation ne correspond.',
  'admin.convList.unavailable': 'Liste indisponible pour le moment.',
  'admin.convList.members': '{count} membres',
  'admin.convList.sovereign': 'Réservé au rang d\'administration.',
  'admin.convDetail.title': "Lecture d'une conversation",
  'admin.convDetail.reasonLabel': 'Motif de la lecture',
  'admin.convDetail.reasonHint': 'Dix caractères minimum, consigné avec votre nom.',
  'admin.convDetail.read': 'Lire la conversation',
  'admin.convDetail.empty': 'Aucun message',
  'admin.convDetail.memberPrism': 'Lu dans le prisme du membre : {languages}',
  /* LE PILOTAGE DE L'AGENT (#6733). `admin.agent.effect` est la clé la plus
     importante du groupe : elle DIT ce que la relance fait vraiment — refaire
     l'analyse ET, par `strategist → generator → qualityGate`, publier un
     message dans la vraie conversation. Elle est rendue à côté du bouton, et
     les sept langues la portent (`admin-agent.test.tsx` vérifie que chacune
     nomme la publication, et qu'aucun libellé de bouton ne dit « analyse »).

     Les seconds segments sont COURTS (`effect`, `done`, `failed`, `down`) comme
     ceux de leurs voisins (`admin.ban.done`, `admin.password.failed`) : un nom
     de clé est payé SEPT fois dans le chunk des catalogues, et ce groupe a
     été ramené de 28 à 15 clés pour tenir sous `interface_catalogs_admin`
     (11 Ko). Ce qui manquait à l'appel a été EMPRUNTÉ plutôt que redit —
     `admin.counters.title`, `admin.counters.messages`,
     `admin.convList.unavailable`, `admin.user.enabled`,
     `admin.users.inactive`. */
  'admin.agent.title': 'Pilotage de l’agent',
  'admin.agent.denied': 'Ce pilotage demande un droit dédié.',
  'admin.agent.users': 'Membres pilotés',
  'admin.agent.tracked': 'Conversations suivies',
  'admin.agent.empty': 'Rien à afficher.',
  'admin.offline': 'Hors ligne.',
  'admin.agent.scan': 'Scan en cours : {node}',
  'admin.agent.relaunch': 'Relancer l’agent',
  'admin.agent.effect': 'Refait l’analyse et peut publier un message.',
  'admin.agent.done': 'Relance demandée',
  'admin.agent.failed': 'Refusé',
  'admin.agent.stop': 'Arrêter le scan',
  'admin.agent.halted': 'Scan arrêté',
  'admin.agent.down': 'Service agent injoignable.',
  'admin.agent.logs': 'Journal des scans',
} as const;

export default fr;
