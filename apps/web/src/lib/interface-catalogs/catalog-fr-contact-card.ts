/**
 * LA CARTE DE VISITE PARTAGÉE (#8101) — tranche du catalogue, extraite pour
 * tenir le budget de taille (motif `catalog-fr-mentions.ts`) : chaque langue
 * RÉPAND la sienne dans son catalogue.
 */
const frContactCard = {
  'contactCard.a11y.card': 'Carte de visite : {name}',
  'contactCard.open': 'Voir tous les détails de {name}',
  'contactCard.loading': 'Lecture de la carte de visite…',
  'contactCard.unreadable': 'Carte de visite illisible',
  'contactCard.failed': 'La carte de visite n’a pas pu être lue',
  'contactCard.retry': 'Réessayer',
  'contactCard.download': 'Télécharger la carte',
  'contactCard.onMeeshy': 'Sur Meeshy',
  'contactCard.connect': 'Se connecter',
  'contactCard.write': 'Écrire',
  'contactCard.state.self': 'C’est vous',
  'contactCard.state.requestSent': 'Demande envoyée',
  'contactCard.state.requestReceived': 'Vous a envoyé une demande',
  'contactCard.sheet.title': 'Carte de visite',
  'contactCard.close': 'Fermer',
  'contactCard.copy': 'Copier : {field}',
  'contactCard.copied': 'Copié dans le presse-papiers',
  'contactCard.copyFailed': 'Copie impossible',
  'contactCard.copyHint': 'Appui long ou clic droit sur un champ pour le copier',
  'contactCard.avatar': 'Photo de {name}',
  'contactCard.banner': 'Bannière de {name}',
  'contactCard.field.phone': 'Téléphone',
  'contactCard.field.email': 'E-mail',
  'contactCard.field.url': 'Site web',
  'contactCard.field.address': 'Adresse',
  'contactCard.field.birthday': 'Anniversaire',
  'contactCard.field.note': 'Note',
  'contactCard.field.organization': 'Organisation',
  'contactCard.field.title': 'Fonction',
  'contactCard.label.mobile': 'mobile',
  'contactCard.label.home': 'domicile',
  'contactCard.label.work': 'travail',
  'contactCard.label.main': 'principal',
  'contactCard.label.iphone': 'iPhone',
  'contactCard.label.fax': 'fax',
  'contactCard.label.pager': 'bipeur',
  'contactCard.label.other': 'autre',
} as const;

export type ContactCardCatalogSlice = Readonly<Record<keyof typeof frContactCard, string>>;

export default frContactCard;
