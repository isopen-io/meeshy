/**
 * « IMAGER » UN MESSAGE OU UN COMMENTAIRE (#8693, ex « Exporter en image ») —
 * tranche du catalogue (motif `catalog-fr-gallery.ts`) : chaque langue RÉPAND
 * la sienne dans son catalogue. Seules les entrées visibles AVANT que l'atelier
 * ne soit chargé vivent ici : le menu du message, « Plus… », le commentaire.
 */
const frMessageCard = {
  'message.menu.export': 'Imager',
  'message.menu.exportQuick': 'Imager rapide',
  'message.menu.compose': 'Composer',
  'comments.action.image': 'Imager',
} as const;

export type MessageCardCatalogSlice = Readonly<Record<keyof typeof frMessageCard, string>>;

export default frMessageCard;
