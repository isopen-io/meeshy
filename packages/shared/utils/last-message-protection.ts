/**
 * **CE QU'UN APERÇU DE LISTE A LE DROIT DE DIRE** — la loi, écrite une fois.
 *
 * Miroir EXACT de `LastMessageSummaryKind.lastMessageSummaryKind(now:)`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`),
 * dont les doc-comments portent la règle en toutes lettres : un message
 * FLOUTÉ ou à VUE UNIQUE, et un éphémère PÉRIMÉ, « le contenu ne doit pas être
 * exposé » ; un éphémère encore valide reste lisible.
 *
 * ---
 *
 * **Pourquoi cette loi descend côté SERVEUR** (audit de cohérence iOS ↔
 * passerelle, 2026-09-11).
 *
 * La chaîne était rompue en deux endroits à la fois, et les deux ruptures se
 * cachaient l'une l'autre :
 *
 * 1. `messageMinimalSchema` (`api-schemas/message.ts`) — le schéma de réponse
 *    du `lastMessage` de la liste — ne déclarait NI `isViewOnce`, NI
 *    `isBlurred`, NI `expiresAt`, NI `effectFlags`. Le `select` Prisma les
 *    charge pourtant (`core-selects.ts`), le mapper les répand (`...msgRest`),
 *    et iOS les décode (`APIConversationLastMessage`). Mais `fast-json-stringify`
 *    RETIRE en silence toute propriété non déclarée : les quatre drapeaux
 *    n'arrivaient jamais par REST.
 * 2. Le serveur servait `content` SANS CONDITION. La protection reposait donc
 *    entièrement sur un client qui lit des drapeaux… qu'on venait de lui
 *    retirer.
 *
 * Conséquence mesurable : **au démarrage à froid, la liste affichait le TEXTE
 * EN CLAIR du dernier message d'une conversation à vue unique, flouté ou
 * périmé** — jusqu'à ce qu'une mise à jour temps réel arrive, le socket
 * transportant les mêmes drapeaux en clés plates, lui.
 *
 * Les deux moitiés sont corrigées : les drapeaux sont déclarés, ET le texte ne
 * part plus. C'est la doctrine du dépôt appliquée à la lettre (CLAUDE.md
 * § Prisme, cycle 125) — « une protection de CONTENU se mesure sur tout ce que
 * la charge TRANSPORTE », et une garde annoncée par un champ qu'aucun client ne
 * reçoit ne garde rien. **Le client peut se tromper ; la charge, non.**
 */

/** Ce que le lecteur a le droit de voir — miroir de `LastMessageSummaryKind`. */
export type LastMessagePreviewProtection =
  /** Contenu affichable normalement. */
  | 'standard'
  /** Flouté — le contenu ne doit pas être exposé. */
  | 'hidden'
  /** Vue unique — le contenu ne doit pas être exposé. */
  | 'view-once'
  /** Éphémère dont la date d'expiration est dépassée. */
  | 'expired'
  /** Éphémère encore lisible (expiration future). */
  | 'ephemeral-active';

export type ProtectableLastMessage = {
  readonly isBlurred?: boolean | null;
  readonly isViewOnce?: boolean | null;
  readonly expiresAt?: Date | string | null;
};

/**
 * **L'ORDRE DES TESTS EST LA RÈGLE, pas un détail d'écriture** — il est repris
 * tel quel de Swift : la PÉREMPTION se juge en premier, avant le flou et avant
 * la vue unique. Un message à la fois flouté et périmé est `expired`, jamais
 * `hidden` : les deux cachent le contenu, mais ils ne disent pas la même chose
 * à l'utilisateur, et c'est la version iOS qui fait foi sur le mot employé.
 */
export function lastMessagePreviewProtection(
  message: ProtectableLastMessage | null | undefined,
  now: Date = new Date(),
): LastMessagePreviewProtection {
  if (!message) return 'standard';

  const expiresAt = message.expiresAt == null ? null : new Date(message.expiresAt);
  const expiration = expiresAt !== null && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;

  if (expiration !== null && expiration.getTime() <= now.getTime()) return 'expired';
  if (message.isBlurred === true) return 'hidden';
  if (message.isViewOnce === true) return 'view-once';
  if (expiration !== null) return 'ephemeral-active';
  return 'standard';
}

/**
 * **Le texte a-t-il le droit de voyager ?**
 *
 * `ephemeral-active` dit OUI — c'est le seul état protégé qui reste lisible, et
 * c'est voulu : un éphémère non encore expiré SE LIT, c'est tout son propos.
 *
 * Ce prédicat gouverne le CONTENU et lui seul. Ce qui QUALIFIE l'aperçu — les
 * drapeaux eux-mêmes, l'horodatage, le type — continue de voyager : sans eux le
 * client ne saurait pas quel placeholder peindre, et il rendrait une ligne vide
 * là où l'utilisateur doit lire « 👁️ Message à vue unique ».
 */
export function lastMessageTextMayTravel(
  message: ProtectableLastMessage | null | undefined,
  now: Date = new Date(),
): boolean {
  const protection = lastMessagePreviewProtection(message, now);
  return protection === 'standard' || protection === 'ephemeral-active';
}
