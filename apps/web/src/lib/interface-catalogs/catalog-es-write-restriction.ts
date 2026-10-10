import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const esWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'Global se abre a la escritura cuando cumplas 18 años',
} satisfies WriteRestrictionCatalogSlice;

export default esWriteRestriction;
