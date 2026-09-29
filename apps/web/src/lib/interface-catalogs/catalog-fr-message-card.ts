/**
 * L'EXPORT D'UN MESSAGE EN IMAGE — tranche du catalogue (motif
 * `catalog-fr-gallery.ts`) : chaque langue RÉPAND la sienne dans son catalogue.
 */
const frMessageCard = {
  'message.menu.export': 'Exporter en image',
  'message.menu.exportQuick': 'Export rapide',
} as const;

export type MessageCardCatalogSlice = Readonly<Record<keyof typeof frMessageCard, string>>;

export default frMessageCard;
