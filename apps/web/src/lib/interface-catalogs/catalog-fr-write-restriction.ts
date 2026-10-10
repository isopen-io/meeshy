/**
 * LA RESTRICTION D'ÉCRITURE SERVIE (#9928) — tranche du catalogue, extraite
 * pour tenir le budget de taille : le bandeau qui remplace le composeur de
 * Meeshy Global pour un compte de 13 à 17 ans, et la cause d'un envoi refusé
 * (`GLOBAL_ADULTS_ONLY`) ; et l'écran d'un compte de moins de 13 ans
 * (`AGE_BELOW_MINIMUM`), à l'accueil comme à la connexion. Chaque langue la
 * RÉPAND dans son catalogue.
 */
const frWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'Global s’ouvre à l’écriture à tes 18 ans',
  'age.blocked.title': 'Meeshy est réservé aux 13 ans et plus',
  'age.blocked.body': 'Ce compte ne peut pas être utilisé avant tes 13 ans.',
  'age.blocked.confirm': 'Compris',
} as const;

export type WriteRestrictionCatalogSlice = Readonly<Record<keyof typeof frWriteRestriction, string>>;

export default frWriteRestriction;
