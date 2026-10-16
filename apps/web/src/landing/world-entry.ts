/**
 * L'ENTRÉE INVITÉ DANS WORLD WIDE (#10002 → #10003 → #10100 → #10784).
 *
 * Depuis #10784 (directive porteur du 2026-10-16), la landing ne fait plus
 * entrer personne : ni formulaire, ni bouton « Entrer sans compte ». Elle porte
 * un QR code vers `https://meeshy.me/world` (`public/world-qr.svg`), et c'est
 * `/world` (`routes/world-entry.tsx`) qui demande le nom et la langue, puis
 * ouvre le fil en focus.
 */

/**
 * Le fil d'un invité qui revient sur la landing (« Revenir dans World Wide ») :
 * `/world`, où son fil se rouvre en focus depuis sa session (#10100) ; en
 * chaîne pour la même raison, confrontée à `href('world')` par son témoin.
 */
export const WORLD_GUEST_THREAD_TEMPLATE = '/world';

/**
 * LE JETON DE PASSAGE DE LA LANDING (#10094) — ce qui distinguait une entrée
 * TAPÉE sur meeshy.me d'une adresse forgée. La landing n'en pose plus depuis
 * #10784 ; la jonction le lit encore, pour les landings d'avant restées en cache
 * (rétrocompatibilité), et sans lui elle attend le geste — fail-closed.
 *
 * L'adresse d'entrée se fabrique de n'importe où : seule, elle ferait entrer un
 * visiteur, sous un nom choisi par un tiers, dans n'importe quelle conversation
 * à lien. Le script de la landing posait donc, juste avant de naviguer, un jeton
 * dans le `sessionStorage` de l'ONGLET (`{ link, name, language, at }`), qu'aucune
 * autre origine ne peut écrire ; la jonction le lit ET l'efface, et ne crée
 * l'invité sans geste que si le jeton concorde avec l'adresse et date de moins
 * de `WORLD_ENTRY_HANDOFF_TTL_MS`. Toute autre arrivée montre le formulaire,
 * pré-rempli, et attend le geste (`routes/chat-join-handoff.ts`, lu par
 * `/world` comme par la jonction).
 */
export const WORLD_ENTRY_HANDOFF_KEY = 'meeshy.world-entry';

export const WORLD_ENTRY_HANDOFF_TTL_MS = 15_000;
