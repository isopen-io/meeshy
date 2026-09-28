/**
 * L'EXPORT D'UN MESSAGE EN IMAGE — tranche du catalogue (motif
 * `catalog-fr-gallery.ts`) : chaque langue RÉPAND la sienne dans son catalogue.
 */
const frMessageCard = {
  'message.menu.export': 'Exporter en image',
  'export.card.title': 'Exporter en image',
  'export.card.footer': 'Exporté par {name}',
  'export.card.styles': 'Style',
  'export.card.style.aurore': 'Aurore',
  'export.card.style.editorial': 'Éditorial',
  'export.card.style.manuscrit': 'Manuscrit',
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
