/**
 * LA CITATION D'UN AUDIO (#8320) — tranche du catalogue, extraite pour tenir
 * le budget de taille (motif `catalog-fr-contact-card.ts`) : chaque langue
 * RÉPAND la sienne dans son catalogue. Les deux actions de la citation — la
 * lecture sur place et le saut au message d'origine — sont annoncées
 * distinctement par le lecteur d'écran.
 */
const frQuote = {
  'quote.audio.listen': 'Écouter le message cité',
  'quote.audio.pause': 'Mettre en pause le message cité',
  'quote.jumpTo': 'Aller au message de {name}',
} as const;

export type QuoteCatalogSlice = Readonly<Record<keyof typeof frQuote, string>>;

export default frQuote;
