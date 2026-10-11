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

/**
 * LE JETON DE PASSAGE DE LA LANDING (#10094) — ce qui distingue une entrée
 * TAPÉE sur meeshy.me d'une adresse forgée.
 *
 * L'adresse d'entrée se fabrique de n'importe où : seule, elle ferait entrer un
 * visiteur, sous un nom choisi par un tiers, dans n'importe quelle conversation
 * à lien. Le script de la landing pose donc, juste avant de naviguer, un jeton
 * dans le `sessionStorage` de l'ONGLET (`{ link, name, language, at }`), qu'aucune
 * autre origine ne peut écrire ; la jonction le lit ET l'efface, et ne crée
 * l'invité sans geste que si le jeton concorde avec l'adresse et date de moins
 * de `WORLD_ENTRY_HANDOFF_TTL_MS`. Toute autre arrivée montre le formulaire,
 * pré-rempli, et attend le geste (`routes/chat-join-handoff.ts`).
 */
export const WORLD_ENTRY_HANDOFF_KEY = 'meeshy.world-entry';

export const WORLD_ENTRY_HANDOFF_TTL_MS = 15_000;
