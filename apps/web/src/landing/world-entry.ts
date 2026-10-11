/**
 * LE POINT D'ACCROCHE DE L'ENTRÉE INVITÉ (#10002 → #10003 → #10100).
 *
 * La landing fait entrer un nom dans World Wide par CETTE adresse, où `{name}`
 * est le nom saisi et `{language}` la langue choisie (D-186). L'invité RESTE
 * sur `/world` (#10100, décision porteur du 2026-10-11) : l'écran y lit la clé
 * de jonction servie par `GET /world`, crée l'invité sans autre geste si le
 * jeton de passage concorde, puis ouvre le fil EN PLACE, en focus
 * (`routes/world-entry.tsx`) — plus de détour par la jonction `/chat/…`, qui
 * reste servie pour les liens de partage et les pages de la landing en cache.
 *
 * Chaîne et non fonction : le script de la landing est inliné par son texte
 * (`landing-boot.ts`) et ne peut rien importer. Son témoin la confronte à
 * `href('world', …)`, pour qu'elle ne puisse pas viser une adresse que la
 * table des routes ne sert pas. Le script y remplace encore `{link}` : sans
 * effet ici, la clé voyage dans le jeton de passage.
 */
export const WORLD_GUEST_ENTRY_TEMPLATE = '/world?name={name}&language={language}';

/**
 * Le fil d'un invité qui revient sur la landing (« Revenir dans World Wide ») :
 * `/world`, où son fil se rouvre en focus depuis sa session (#10100) ; en
 * chaîne pour la même raison, confrontée à `href('world')` par son témoin.
 */
export const WORLD_GUEST_THREAD_TEMPLATE = '/world';

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
 * pré-rempli, et attend le geste (`routes/chat-join-handoff.ts`, lu par
 * `/world` comme par la jonction).
 */
export const WORLD_ENTRY_HANDOFF_KEY = 'meeshy.world-entry';

export const WORLD_ENTRY_HANDOFF_TTL_MS = 15_000;
