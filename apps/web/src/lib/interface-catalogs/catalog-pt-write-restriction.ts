import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const ptWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'O Global abre-se à escrita quando fizeres 18 anos',
  'age.blocked.title': 'O Meeshy é para maiores de 13 anos',
  'age.blocked.body': 'Esta conta não pode ser usada antes dos teus 13 anos.',
  'age.blocked.confirm': 'Percebi',
} satisfies WriteRestrictionCatalogSlice;

export default ptWriteRestriction;
