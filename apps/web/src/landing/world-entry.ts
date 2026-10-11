/**
 * LE POINT D'ACCROCHE DE L'ENTRÉE INVITÉ (#10002 → #10003).
 *
 * La landing fait entrer un nom dans World Wide par CETTE adresse, où `{name}`
 * est le nom saisi : le parcours `/world` (`routes/world-entry.tsx`) s'ouvre
 * sur la langue principale, puis mène au fil. La clé de jonction n'y voyage
 * pas : l'écran la relit lui-même sur `GET /world`, jamais écrite en dur. La
 * landing ne suit l'adresse qu'une fois l'entrée servie ouverte (`{link}`,
 * conservé par `landing-boot.ts`, n'y est plus substitué).
 *
 * Chaîne et non fonction : le script de la landing est inliné par son texte
 * (`landing-boot.ts`) et ne peut rien importer. Son témoin la confronte à
 * `href('world', …)`, pour qu'elle ne puisse pas viser une adresse que la
 * table des routes ne sert pas.
 */
export const WORLD_GUEST_ENTRY_TEMPLATE = '/world?name={name}';
