import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const esWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'Global se abre a la escritura cuando cumplas 18 años',
  'age.blocked.title': 'Meeshy es para mayores de 13 años',
  'age.blocked.body': 'Esta cuenta no se puede usar antes de tus 13 años.',
  'age.blocked.confirm': 'Entendido',
} satisfies WriteRestrictionCatalogSlice;

export default esWriteRestriction;
