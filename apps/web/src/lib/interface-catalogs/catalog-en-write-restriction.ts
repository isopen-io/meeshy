import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const enWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'Global opens for writing when you turn 18',
} satisfies WriteRestrictionCatalogSlice;

export default enWriteRestriction;
