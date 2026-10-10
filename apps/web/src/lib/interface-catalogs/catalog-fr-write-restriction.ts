/**
 * LA RESTRICTION D'ÉCRITURE SERVIE (#9928) — tranche du catalogue, extraite
 * pour tenir le budget de taille : le bandeau qui remplace le composeur de
 * Meeshy Global pour un compte de 13 à 17 ans, et la cause d'un envoi refusé
 * (`GLOBAL_ADULTS_ONLY`). Chaque langue la RÉPAND dans son catalogue.
 */
const frWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'Global s’ouvre à l’écriture à tes 18 ans',
} as const;

export type WriteRestrictionCatalogSlice = Readonly<Record<keyof typeof frWriteRestriction, string>>;

export default frWriteRestriction;
