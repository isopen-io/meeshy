/**
 * LA FENÊTRE DE MESSAGES SE REVALIDE SANS SES ACCUSÉS (#19049) — revalider un
 * fil actif coûte un 304 quand seuls les accusés de lecture ont bougé.
 *
 * L'ETag de `GET /conversations/:id/messages` est le SHA-256 du corps : tout
 * accusé de lecture dans la fenêtre le change. Dans un groupe actif, chaque
 * revalidation (au moins toutes les deux minutes, plus les reconnexions)
 * renvoyait donc la fenêtre ENTIÈRE, traductions comprises, au lieu d'un 304 —
 * alors que ces compteurs voyagent déjà par la socket (`read-status:updated`,
 * son `summary` par message).
 *
 * Un client qui ANNONCE la capacité `live-receipts` (`X-Meeshy-Capabilities`)
 * déclare tenir ces champs à jour par la socket. Pour lui seul, la passerelle
 * valide la fenêtre SANS les champs de `LIVE_RECEIPT_FIELDS` : un ETag FAIBLE
 * (`W/"…"`), qu'un changement de contenu change et qu'un accusé seul ne change
 * pas. Le corps d'un 200 porte toujours les compteurs à jour ; un 304 ne dit
 * rien d'eux — le client garde les siens.
 *
 * Sans la capacité, rien ne change : l'ETag FORT d'avant, sur le corps entier.
 * Un ancien client garde donc un ETag valide, et un client dont le cache HTTP
 * resservirait le corps d'un 200 sur un 304 (`URLCache`, le cache du
 * navigateur) ne doit PAS l'annoncer : il y reprendrait des compteurs périmés.
 *
 * Un client qui a pu MANQUER des événements (reconnexion, retour de veille)
 * relit la fenêtre une fois sans la capacité, ou sans `If-None-Match` : un 304
 * sous la capacité ne répare pas un accusé perdu.
 *
 * Constantes seules, sans zod : importables par `@meeshy/shared/types/live-receipts`.
 */

/** Le jeton que le client pose dans `X-Meeshy-Capabilities`. */
export const LIVE_RECEIPTS_CAPABILITY = 'live-receipts' as const;

/**
 * Les champs d'accusé AGRÉGÉS de chaque message de la fenêtre — ce que le
 * validateur sous la capacité ignore. Tous dérivent du même état d'accusés
 * (`MessageReadStatusService.getConversationReadStatuses`), et la socket en
 * tient la plus grande part : `read-status:updated` porte `deliveredCount`,
 * `readCount`, `totalMembers` (le `recipientCount` servi) et `readByAllAt`.
 * Deux restent ceux du dernier 200 tant que les revalidations rendent 304 :
 * `deliveredToAllAt` (l'instant où `deliveredCount` atteint le total), absent
 * de `ReadStatusSummary`, et `recipientCount`, qui change à l'arrivée ou au
 * départ d'un membre sans qu'aucun `read-status:updated` ne parte — affichage
 * seulement (décision #19049, `services/gateway/decisions/`).
 *
 * @see messageSchema (`api-schemas/message.ts`) — ces champs y sont déclarés.
 */
export const LIVE_RECEIPT_FIELDS = ['deliveredCount', 'readCount', 'recipientCount', 'deliveredToAllAt', 'readByAllAt'] as const;

export type LiveReceiptField = (typeof LIVE_RECEIPT_FIELDS)[number];
