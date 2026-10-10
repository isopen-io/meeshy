import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const itWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'Global si apre alla scrittura quando compirai 18 anni',
  'age.blocked.title': 'Meeshy è riservato a chi ha almeno 13 anni',
  'age.blocked.body': 'Questo account non può essere usato prima dei tuoi 13 anni.',
  'age.blocked.confirm': 'Ho capito',
} satisfies WriteRestrictionCatalogSlice;

export default itWriteRestriction;
