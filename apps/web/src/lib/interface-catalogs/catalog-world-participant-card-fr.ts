/**
 * LA FICHE D'UN PARTICIPANT DE WORLD WIDE, FRANÇAIS (#10102) — la SOURCE des
 * clés `worldCard.*` (`components/world-participant-card-sheet.tsx`). Les six
 * autres langues portent exactement ces clés (`satisfies
 * WorldParticipantCardCatalog`, `i18n-world-participant-card-catalog.test.ts`).
 * Hors du catalogue d'interface, arrivé à son plafond : chargé pour l'équipe
 * seulement, quand le fil de World Wide lui ouvre les fiches.
 */
const fr = {
  'worldCard.title': 'Fiche du participant',
  'worldCard.open': 'Voir la fiche de {name}',
  'worldCard.purpose': 'Fiche de modération — chaque ouverture est consignée au journal d’audit.',
  'worldCard.kind.anonymous': 'Anonyme',
  'worldCard.kind.account': 'Compte Meeshy',
  'worldCard.kind.bot': 'Agent',
  'worldCard.section.world': 'Dans World Wide',
  'worldCard.section.languages': 'Langues',
  'worldCard.section.origin': 'Pays et poste',
  'worldCard.section.account': 'Compte',
  'worldCard.row.conversationRole': 'Rôle',
  'worldCard.row.status': 'Statut',
  'worldCard.row.joinedAt': 'Arrivée',
  'worldCard.row.link': 'Lien d’entrée',
  'worldCard.row.language.conversation': 'Langue de la conversation',
  'worldCard.row.language.system': 'Langue principale',
  'worldCard.row.language.regional': 'Langue secondaire',
  'worldCard.row.language.customDestination': 'Langue de destination',
  'worldCard.row.language.deviceLocale': 'Langue de l’appareil',
  'worldCard.row.language.account': 'Langues du compte',
  'worldCard.row.country': 'Pays',
  'worldCard.row.client': 'Poste',
  'worldCard.row.browser': 'Navigateur',
  'worldCard.row.system': 'Système',
  'worldCard.row.device': 'Appareil',
  'worldCard.row.app': 'Application',
  'worldCard.row.accountRole': 'Rôle du compte',
  'worldCard.role.creator': 'Créateur',
  'worldCard.role.admin': 'Administrateur',
  'worldCard.role.moderator': 'Modérateur',
  'worldCard.role.member': 'Membre',
  'worldCard.accountRole.BIGBOSS': 'Super-administrateur',
  'worldCard.accountRole.ADMIN': 'Administrateur',
  'worldCard.accountRole.MODERATOR': 'Modérateur',
  'worldCard.accountRole.AUDIT': 'Auditeur',
  'worldCard.accountRole.ANALYST': 'Analyste',
  'worldCard.accountRole.USER': 'Utilisateur',
  'worldCard.accountRole.AGENT': 'Agent',
  'worldCard.status.active': 'Présent',
  'worldCard.status.left': 'A quitté',
  'worldCard.status.banned': 'Banni',
  'worldCard.device.mobile': 'Mobile',
  'worldCard.device.tablet': 'Tablette',
  'worldCard.device.desktop': 'Ordinateur',
  'worldCard.notRecorded': 'Non relevé',
  'worldCard.withheld': 'Retenu',
  'worldCard.withheld.note': 'Ce compte n’est pas sous votre rang : son rôle, ses langues de compte, son poste et son pays de session sont retenus.',
  'worldCard.noLink': 'Ajouté sans lien',
  'worldCard.loading': 'Lecture de la fiche…',
  'worldCard.error': 'La fiche n’a pas pu être lue.',
  'worldCard.notFound': 'Cette personne n’est plus dans World Wide.',
  'worldCard.retry': 'Réessayer',
} as const;

export default fr;
