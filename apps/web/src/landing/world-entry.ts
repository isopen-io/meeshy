/**
 * LE POINT D'ACCROCHE DE L'ENTRÉE INVITÉ (#10002 → #10003).
 *
 * La landing fait entrer un nom dans World Wide par CETTE adresse, où `{link}`
 * est la clé de jonction servie par `GET /world` (`shareLinkIdentifier`,
 * jamais écrite en dur) et `{name}` le nom saisi. Aujourd'hui elle ouvre la
 * jonction par lien déjà en place, en mode invité (`/chat/:link?mode=anonymous`,
 * `routes/chat-join.tsx`) ; le parcours nom → langue → fil de #10003 la
 * remplacera ici, et la landing suivra sans autre changement.
 *
 * Chaîne et non fonction : le script de la landing est inliné par son texte
 * (`landing-boot.ts`) et ne peut rien importer. Son témoin la confronte à
 * `href('chatJoin', …)`, pour qu'elle ne puisse pas viser une adresse que la
 * table des routes ne sert pas.
 */
export const WORLD_GUEST_ENTRY_TEMPLATE = '/chat/{link}?mode=anonymous&name={name}';
