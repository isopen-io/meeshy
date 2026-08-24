/**
 * Passage de « lu = fenêtre temporelle » à « lu = réellement affiché ».
 *
 * Historiquement, un message était réputé lu dès que le curseur `lastReadAt`
 * du participant le dépassait, ce qui marquait comme lus des messages jamais
 * affichés (ouvrir une conversation à 200 non-lus les marquait tous). Les deux
 * fonctions ci-dessous portent la correction, isolées ici parce qu'elles sont
 * pures et donc vérifiables sans base de données.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */

/**
 * Jusqu'où le curseur de lecture peut avancer sans franchir un message non lu.
 *
 * Renvoie le dernier identifiant du plus long préfixe **contigu** de messages
 * lus, ou `null` si le tout premier message ne l'est pas. S'arrêter au premier
 * trou est ce qui rend le compteur de non-lus honnête : un participant qui
 * saute au bas d'une conversation n'a pas lu ce qu'il a survolé, et le curseur
 * ne doit pas franchir cet intervalle.
 *
 * @param orderedMessageIds identifiants triés du plus ancien au plus récent
 * @param readIds identifiants porteurs d'un `readAt` figé
 */
export function computeContiguousReadPrefix(
  orderedMessageIds: readonly string[],
  readIds: ReadonlySet<string>
): string | null {
  let lastContiguous: string | null = null;

  for (const messageId of orderedMessageIds) {
    if (!readIds.has(messageId)) break;
    lastContiguous = messageId;
  }

  return lastContiguous;
}

export type ResolveReadAtInput = {
  /** `MessageStatusEntry.readAt`, figé une seule fois à la première lecture. */
  readonly frozenReadAt: Date | null;
  /** `ConversationReadCursor.lastReadAt` du participant. */
  readonly cursorLastReadAt: Date | null;
  readonly messageCreatedAt: Date;
  /**
   * Date d'entrée en vigueur du suivi exact, ou `null` tant qu'il n'est pas
   * armé. Sur ce dépôt, `push main` déclenche le déploiement : la bascule doit
   * donc être activée délibérément en production, jamais par le seul fait de
   * livrer le code. `null` conserve le comportement historique à l'identique.
   */
  readonly cutover: Date | null;
};

/**
 * Arbitre entre le gel per-message et le repli curseur hérité.
 *
 * Le gel fait toujours foi quand il existe. En son absence, le repli curseur
 * n'est consenti que pour les messages **antérieurs** à la date de bascule :
 * eux n'ont jamais eu l'occasion d'être gelés, et les priver du repli les
 * ferait tous basculer en « jamais vu ». Passé la bascule, l'absence de gel
 * signifie l'absence de lecture — c'est tout l'objet de la correction.
 */
export function resolveReadAt({
  frozenReadAt,
  cursorLastReadAt,
  messageCreatedAt,
  cutover,
}: ResolveReadAtInput): Date | null {
  if (frozenReadAt) return frozenReadAt;

  if (cutover && messageCreatedAt.getTime() >= cutover.getTime()) return null;

  if (!cursorLastReadAt) return null;

  return cursorLastReadAt.getTime() >= messageCreatedAt.getTime()
    ? cursorLastReadAt
    : null;
}

/**
 * Dénominateur « tout ou rien » d'un message : les participants actifs de la
 * conversation MOINS son expéditeur. Renvoyé au client par message pour que la
 * coche ✓✓ / « lu » ne s'allume qu'une fois TOUS les destinataires servis, sur
 * le compte du serveur plutôt que sur un `memberCount` local possiblement
 * périmé.
 *
 * Soustraire aveuglément 1 est faux : quand l'expéditeur a QUITTÉ la
 * conversation, il ne figure plus dans l'ensemble, et la soustraction retirerait
 * un destinataire bien réel — la coche « reçu/lu par tous » s'allumerait un
 * destinataire trop tôt. D'où le test d'appartenance.
 *
 * @param activeParticipantIds `Participant.id` des membres actifs, opt-out
 *   d'accusés de lecture DÉJÀ retirés (ils disparaissent du dénominateur comme
 *   du numérateur — cf. `MessageReadStatusService._loadReadReceiptOptOuts`)
 * @param senderParticipantId `Message.senderId` brut, c'est-à-dire un
 *   `Participant.id`
 */
export function computeRecipientCount(
  activeParticipantIds: ReadonlySet<string>,
  senderParticipantId: string
): number {
  return Math.max(
    0,
    activeParticipantIds.size - (activeParticipantIds.has(senderParticipantId) ? 1 : 0)
  );
}

export type ResolveReceivedAtInput = {
  /** `MessageStatusEntry.receivedAt`, figé write-once. */
  readonly frozenReceivedAt: Date | null;
  /** `MessageStatusEntry.deliveredAt`, figé write-once. */
  readonly frozenDeliveredAt: Date | null;
  /** `ConversationReadCursor.lastDeliveredAt`, déjà borné au message. */
  readonly cursorDeliveredAt: Date | null;
  /** La date de LECTURE déjà résolue pour ce même participant. */
  readonly readAt: Date | null;
};

/**
 * Date de réception d'un message par un participant — **« on ne lit pas ce
 * qu'on n'a pas reçu »**.
 *
 * Les deux dates étaient dérivées côte à côte, sur quatre sites, mais par des
 * chemins ASYMÉTRIQUES : `readAt` acceptait un repli sur le curseur
 * (`lastReadAt`), `receivedAt` n'acceptait le sien que si `lastDeliveredAt`
 * existait ET datait d'après le message. Un participant qui marque « lu » sans
 * avoir jamais émis d'accusé de livraison comptait donc comme lecteur sans
 * compter comme destinataire — et le panneau « Qui a vu » annonçait
 * `Distribué 0` en face de `Lu 2` sur le même message (capture user
 * 2026-08-24).
 *
 * Ce n'est pas un habillage : le compteur de distribution alimente
 * `DeliveryStatusResolver` (clients), qui exige `deliveredCount >=
 * recipientCount` pour lever la double coche. Un `deliveredCount` sous-évalué
 * retenait donc l'indicateur à UNE coche sur un message pourtant lu par tout
 * le monde.
 *
 * La lecture est la preuve la plus forte de la réception ; elle sert donc de
 * dernier repli. En son absence, rien n'est affirmé : `null`.
 */
export function resolveReceivedAt({
  frozenReceivedAt,
  frozenDeliveredAt,
  cursorDeliveredAt,
  readAt,
}: ResolveReceivedAtInput): Date | null {
  return frozenReceivedAt ?? frozenDeliveredAt ?? cursorDeliveredAt ?? readAt;
}
