import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const arWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'يُفتح Global للكتابة عند بلوغك 18 عامًا',
} satisfies WriteRestrictionCatalogSlice;

export default arWriteRestriction;
