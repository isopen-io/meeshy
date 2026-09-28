/**
 * L'EXPORT D'UN MESSAGE EN IMAGE — tranche du catalogue (motif
 * `catalog-fr-gallery.ts`) : chaque langue RÉPAND la sienne dans son catalogue.
 */
const frMessageCard = {
  'message.menu.export': 'Exporter en image',
  'export.card.title': 'Exporter en image',
  'export.card.popular': 'Populaires',
  'export.card.random': 'Au hasard',
  'export.card.palette': 'Couleurs',
  'export.card.typeface': 'Typographie',
  'export.card.link': 'Liaison',
  'export.card.typeface.rond': 'Ronde',
  'export.card.typeface.didone': 'Didone',
  'export.card.typeface.plume': 'Plume',
  'export.card.typeface.affiche': 'Affiche',
  'export.card.typeface.futur': 'Futuriste',
  'export.card.typeface.machine': 'Machine à écrire',
  'export.card.typeface.marqueur': 'Marqueur',
  'export.card.typeface.systeme': 'Système',
  'export.card.link.orbite': 'Orbite',
  'export.card.link.filet': 'Filet',
  'export.card.link.guillemets': 'Guillemets',
  'export.card.link.fleche': 'Flèche',
  'export.card.link.bulles': 'Bulles',
  'export.card.link.fil': 'Fil',
  'export.card.link.silence': 'Silence',
  'export.card.option.anonymizeQuoted': 'Anonymiser le message cité',
  'export.card.option.anonymizeReply': 'Anonymiser la réponse',
  'export.card.anonymous': 'Anonyme',
  'export.card.preview': 'Aperçu de l’image',
  'export.card.rendering': 'Préparation de l’image…',
  'export.card.save': 'Enregistrer l’image',
  'export.card.truncated': 'Message long : la fin est coupée sur l’image.',
  'export.announce.gallery': 'Image enregistrée dans la galerie',
  'export.announce.shared': 'Image prête',
  'export.announce.cancelled': 'Export annulé',
  'export.announce.expired': 'Touchez de nouveau pour enregistrer',
  'export.announce.failed': 'Impossible de créer l’image',
  'export.announce.unavailable': 'Cet appareil ne sait pas enregistrer l’image',
  'message.menu.exportQuick': 'Export rapide',
  'export.card.options': 'Afficher',
  'export.card.option.title': 'Titre de la conversation',
  'export.card.option.authors': 'Noms des auteurs',
  'export.card.option.date': 'Date',
  'export.card.default.save': 'Utiliser comme format par défaut',
  'export.card.default.current': 'Format par défaut',
  'export.announce.defaultSaved': 'Format par défaut enregistré',
} as const;

export type MessageCardCatalogSlice = Readonly<Record<keyof typeof frMessageCard, string>>;

export default frMessageCard;
