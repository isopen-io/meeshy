import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const itWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'Global si apre alla scrittura quando compirai 18 anni',
} satisfies WriteRestrictionCatalogSlice;

export default itWriteRestriction;
