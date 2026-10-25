import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const deWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'In Global kannst du ab 18 Jahren schreiben',
  'composer.writeRestriction.endToEnd': 'Ende-zu-Ende-verschlüsselte Unterhaltung: Schreibe in der Meeshy-App',
  'age.blocked.title': 'Meeshy ist ab 13 Jahren',
  'age.blocked.body': 'Dieses Konto kann erst ab 13 Jahren genutzt werden.',
  'age.blocked.confirm': 'Verstanden',
} satisfies WriteRestrictionCatalogSlice;

export default deWriteRestriction;
