/**
 * LE CATALOGUE DE LA FICHE ET DU PLEIN ÉCRAN D'UNE DÉCORATION, FRANÇAIS (#16267)
 * — la SOURCE des clés : éléments, éditeur, état, poids, n / N, zoom,
 * « Équiper », autres propositions, bulles factices. Chargé avec la fiche ou
 * le plein écran (`i18n-pack-preview-catalog.ts`), jamais avec la boutique.
 */
const frPackPreview = {
  'packs.sheet.items': "Éléments du pack",
  'packs.sheet.publisher': "Éditeur : {author}",
  'packs.sheet.state.embedded': "Embarqué dans Meeshy",
  'packs.sheet.state.installed': "Installé",
  'packs.sheet.state.download': "À télécharger",
  'packs.sheet.size': "Poids : {size}",
  'packs.sheet.loading': "Chargement des éléments…",
  'packs.sheet.failed': "Les éléments de ce pack n’ont pas pu être chargés",
  'packs.preview.title': "Aperçu",
  'packs.preview.position': "{index} sur {count}",
  'packs.preview.previous': "Élément précédent",
  'packs.preview.next': "Élément suivant",
  'packs.preview.zoomIn': "Agrandir",
  'packs.preview.zoomOut': "Réduire",
  'packs.preview.close': "Retour à la boutique",
  'packs.preview.others': "Autres propositions",
  'packs.preview.equip': "Équiper",
  'packs.preview.equipped': "Équipé",
  'packs.preview.equipFailed': "L’élément n’a pas pu être équipé — réessayez",
  'packs.preview.animated': "Animé",
  'packs.preview.wallpaperHint': "Un fond se choisit dans chaque conversation, depuis « Fond et couleur ».",
  'packs.preview.bubble.in1': "Tu as vu ce nouveau fond ?",
  'packs.preview.bubble.out': "Oui, il rend vraiment bien !",
  'packs.preview.bubble.in2': "Je l’adopte 😍",
} as const;

export default frPackPreview;
