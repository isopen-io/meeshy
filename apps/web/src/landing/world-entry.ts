/**
 * LE POINT D'ACCROCHE DE L'ENTRÉE INVITÉ (#10002 → #10003).
 *
 * La landing fait entrer un nom dans World Wide par CETTE adresse, où `{link}`
 * est la clé de jonction servie par `GET /world` (`shareLinkIdentifier`,
 * jamais écrite en dur), `{name}` le nom saisi et `{language}` la langue
 * choisie à l'étape suivante (D-186). La jonction par lien
 * (`/chat/:link?mode=anonymous`, `routes/chat-join.tsx`) y lit une ENTRÉE
 * (`guestEntryOf`) et crée l'invité sans autre geste, puis ouvre le fil.
 *
 * Chaîne et non fonction : le script de la landing est inliné par son texte
 * (`landing-boot.ts`) et ne peut rien importer. Son témoin la confronte à
 * `href('chatJoin', …)`, pour qu'elle ne puisse pas viser une adresse que la
 * table des routes ne sert pas.
 */
export const WORLD_GUEST_ENTRY_TEMPLATE = '/chat/{link}?mode=anonymous&name={name}&language={language}';

/**
 * Le fil d'un invité qui revient sur la landing (« Revenir dans World Wide ») :
 * `href('thread')`, en chaîne pour la même raison, confrontée à elle par son témoin.
 */
export const WORLD_GUEST_THREAD_TEMPLATE = '/c/{conversation}';
