/**
 * **UNE CLÉ D'IDEMPOTENCE APPARTIENT À SON AUTEUR** (#19960).
 *
 * `clientMessageId` est tiré par le client dans SON espace d'ids optimistes
 * (`cid_<uuid v4>`, `packages/shared/utils/client-message-id.ts`). L'unicité
 * que la base garde est pourtant celle du COUPLE `(conversationId,
 * clientMessageId)` — un index partiel MongoDB posé par migration manuelle,
 * donc un espace de noms PARTAGÉ par tous les participants d'une conversation.
 *
 * Les deux ne coïncident pas, et le chemin socket avait déjà tranché dans
 * l'autre sens : `stripClientMessageId` (#16689) retire la clé de la charge
 * des PAIRS, « so a non-sender participant never learns the sender's
 * optimistic-id space ». La liste REST, elle, la servait à tout le monde — et
 * les trois relectures de dédoublonnage appariaient sur le seul COUPLE.
 *
 * Ce module porte la règle que ces relectures partagent : **un rejeu est un
 * rejeu de SON auteur.** Une ligne qui porte la clé sous un AUTRE expéditeur
 * n'est pas un doublon ; c'est une collision dans l'espace partagé, et la
 * servir DÉTRUIT le message de l'appelant en lui répondant « envoyé ».
 *
 * ## Ce que le trio garde, et ce qu'il ne garde pas
 *
 * | ce qui arrive | avant | avec le trio |
 * |---|---|---|
 * | même auteur, même clé (rejeu nominal) | sert la ligne | **inchangé** |
 * | AUTRE auteur, même clé | sert la ligne D'AUTRUI en `success: true` | refus `CLIENT_MESSAGE_ID_TAKEN` |
 * | clé libre | écrit | **inchangé** |
 *
 * Le refus n'est pas un choix de confort : l'index partiel INTERDIT la seconde
 * ligne. Le seul arbitrage ouvert est celui du message rendu à l'appelant, et
 * la honnêteté est strictement meilleure qu'un `500` muet (ce que la relecture
 * resserrée rendrait sans ce module) comme qu'un faux succès (ce qu'elle
 * rendait avant lui).
 *
 * ## Ce qui ne relève PAS de cette loi
 *
 * Les clés DÉRIVÉES côté serveur — `callSummaryClientMessageId(callId)`,
 * `call-summary:<id>` (`packages/shared/utils/call-summary.ts`) — vivent dans
 * un espace de noms DISJOINT, qu'aucune clé client ne peut atteindre : les
 * trois entrées qui acceptent un `clientMessageId` d'un appelant (REST
 * `messages-send.ts`, socket `socket-event-schemas.ts`, lien
 * `routes/links/types.ts`) le valident toutes contre
 * `CLIENT_MESSAGE_ID_REGEX`, que `call-summary:…` ne peut pas satisfaire. Leur
 * appariement sans expéditeur est donc JUSTE, et le resserrer serait faux —
 * un résumé d'appel n'a pas l'expéditeur qui le relit.
 */

/** Le code du refus servi quand la clé est tenue par un AUTRE expéditeur. */
export const CLIENT_MESSAGE_ID_TAKEN = 'CLIENT_MESSAGE_ID_TAKEN';

export const CLIENT_MESSAGE_ID_TAKEN_MESSAGE =
  "Cet identifiant d'envoi est déjà pris dans cette conversation par un autre expéditeur : renvoyer sous un nouveau clientMessageId.";

/**
 * Le `where` d'une relecture de dédoublonnage : le TRIO, jamais le couple.
 *
 * Les trois sites qui relisent une ligne sur la foi d'un `clientMessageId`
 * SOUMIS passent par ici — `MessagingService` (dédup précoce),
 * `MessageProcessor` (le `catch` P2002 du chemin concurrent) et
 * `writeLinkMessageIdempotently` (le transport des liens partagés, le seul
 * dont dispose un invité anonyme). Écrire le `where` à la main est exactement
 * ce qui a produit trois exemplaires du même oubli.
 */
export function ownReplayWhere(params: {
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly senderId: string;
}): { conversationId: string; clientMessageId: string; senderId: string } {
  return {
    conversationId: params.conversationId,
    clientMessageId: params.clientMessageId,
    senderId: params.senderId,
  };
}

/**
 * L'erreur d'un envoi dont la clé est tenue par un autre expéditeur.
 *
 * Elle porte le `code` que les clients lisent (`ApiServiceError`), jamais un
 * `500` : la cause est connue, nommable, et la conduite à tenir est
 * différente d'un réessai — renvoyer sous la MÊME clé échouerait toujours.
 */
export class ClientMessageIdTakenError extends Error {
  readonly code = CLIENT_MESSAGE_ID_TAKEN;
  readonly statusCode = 409;

  constructor(readonly conversationId: string, readonly clientMessageId: string) {
    super(CLIENT_MESSAGE_ID_TAKEN_MESSAGE);
    this.name = 'ClientMessageIdTakenError';
  }
}

export function isClientMessageIdTakenError(error: unknown): error is ClientMessageIdTakenError {
  return error instanceof ClientMessageIdTakenError;
}

/**
 * **CE QUE CE LECTEUR REÇOIT DE LA CLÉ** — la sienne, ou `null`.
 *
 * Le chemin socket l'avait déjà tranché (`stripClientMessageId`, #16689) ;
 * les DEUX surfaces qui servent une ligne de message au repos — la liste REST
 * (`messages-list-query.ts`) et le delta de synchronisation
 * (`routes/sync/messages.ts`) — la servaient à tout participant. La raison
 * écrite à côté des deux (« réconcilier une bulle optimiste au chargement à
 * froid ») est juste, et ne vaut que pour SES PROPRES bulles.
 *
 * La comparaison porte sur le `Participant.id` BRUT, la seule identité que les
 * deux côtés portent dans toutes les populations : un invité de lien partagé
 * n'a pas de `User.id` (cf. `services/gateway/CLAUDE.md`, § Authentication).
 *
 * **Ferme par défaut** : un lecteur non résolu (`undefined`) ne reçoit rien.
 * Une porte de confidentialité échoue en montrant moins, jamais plus.
 */
export function servedClientMessageId(params: {
  readonly clientMessageId: string | null | undefined;
  readonly senderParticipantId: string | null | undefined;
  readonly readerParticipantId: string | null | undefined;
}): string | null {
  const { clientMessageId, senderParticipantId, readerParticipantId } = params;
  if (typeof clientMessageId !== 'string' || clientMessageId === '') return null;
  if (typeof readerParticipantId !== 'string' || readerParticipantId === '') return null;
  return senderParticipantId === readerParticipantId ? clientMessageId : null;
}

/**
 * **LA SEULE QUESTION QUI S'APPARIE SANS AUTEUR** — « quelqu'un d'autre
 * tient-il cette clé ? » — et elle vit ICI, dans la loi, pour qu'aucun site
 * n'ait à réécrire un `where` sans `senderId`.
 *
 * Elle ne s'appelle que sur le chemin d'ÉCHEC, après qu'une violation
 * d'unicité a eu lieu ET que la relecture par le TRIO n'a rien rendu : le
 * chemin nominal ne paie donc aucune lecture de plus. Elle sépare deux causes
 * que l'index partiel confond, et qui n'ont pas la même réponse :
 *
 * - **un AUTRE expéditeur tient la clé** — nommable, et définitif tant que la
 *   clé ne change pas : l'appelant doit en tirer une neuve, jamais rejouer ;
 * - **une course irréconciliable** — la ligne a disparu entre le `create` et
 *   la relecture : l'erreur d'origine remonte, inchangée.
 */
export async function clientMessageIdHeldByAnother(params: {
  readonly prisma: { message: { findFirst(args: unknown): Promise<{ id: string } | null> } };
  readonly conversationId: string;
  readonly clientMessageId: string;
}): Promise<boolean> {
  const held = await params.prisma.message.findFirst({
    where: { conversationId: params.conversationId, clientMessageId: params.clientMessageId },
    select: { id: true },
  });
  return held !== null;
}
