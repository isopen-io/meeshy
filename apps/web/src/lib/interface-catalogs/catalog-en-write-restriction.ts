import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const enWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'Global opens for writing when you turn 18',
  'age.blocked.title': 'Meeshy is for people aged 13 and over',
  'age.blocked.body': 'This account can’t be used until you turn 13.',
  'age.blocked.confirm': 'Got it',
} satisfies WriteRestrictionCatalogSlice;

export default enWriteRestriction;
