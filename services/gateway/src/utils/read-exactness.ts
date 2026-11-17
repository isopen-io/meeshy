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
 * Jusqu'où un curseur peut avancer sans franchir un message qui n'a pas la
 * propriété qu'il affirme.
 *
 * Renvoie le dernier identifiant du plus long préfixe **contigu** des messages
 * PROUVÉS, ou `null` si le tout premier ne l'est pas. S'arrêter au premier trou
 * est ce qui rend le curseur honnête : il est un INDEX RAPIDE sur un préfixe,
 * donc il ne doit affirmer que ce qu'il a vérifié.
 *
 * **Les DEUX curseurs l'emploient, et pour la même raison** — le nom ne dit
 * donc plus « read » (#18731) :
 *
 * | curseur | ce qui PROUVE | ce qu'un saut déclarerait à tort |
 * |---|---|---|
 * | `lastReadAt` | `MessageStatusEntry.readAt` figé | lu ce qu'on a survolé (ouvrir à 200 non-lus) |
 * | `lastDeliveredAt` | `MessageStatusEntry.deliveredAt` figé | remis ce que le plafond de la file a évincé |
 *
 * La seconde ligne est celle de #18731 : la file évince au plafond de 500 des
 * messages que le drain ne voit JAMAIS, donc le trou qu'ils laissent est
 * ANTÉRIEUR au dernier message livré — et aucune BORNE, si juste soit-elle, ne
 * peut l'exclure. Seule la contiguïté le peut.
 *
 * @param orderedMessageIds identifiants triés du plus ancien au plus récent
 * @param provenIds identifiants porteurs de la date figée que le curseur suit
 */
export function computeContiguousPrefix(
  orderedMessageIds: readonly string[],
  provenIds: ReadonlySet<string>
): string | null {
  let lastContiguous: string | null = null;

  for (const messageId of orderedMessageIds) {
    if (!provenIds.has(messageId)) break;
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

/**
 * Marque du SEUL producteur légitime d'un repli de livraison.
 *
 * `resolveCursorDeliveredAt` est la seule fonction qui la pose, et
 * `ResolveReceivedAtInput.cursorDeliveredAt` est la seule à l'exiger : passer
 * `cursor.lastDeliveredAt` brut ne compile pas. C'est un cliquet de TYPE, pas
 * un style — la dérivation vivait recopiée sur quatre sites, et le cinquième
 * aurait été écrit sans elle (#18701).
 */
declare const CURSOR_DELIVERED_BRAND: unique symbol;

/** Un repli de livraison DÉJÀ borné au message ET à la bascule. */
export type CursorDeliveredAt =
  | (Date & { readonly [CURSOR_DELIVERED_BRAND]: 'resolveCursorDeliveredAt' })
  | null;

export type ResolveCursorDeliveredAtInput = {
  /** `ConversationReadCursor.lastDeliveredAt`, BRUT — une horloge murale. */
  readonly cursorLastDeliveredAt: Date | null;
  readonly messageCreatedAt: Date;
  /** La MÊME bascule que `resolveReadAt` — cf. `getExactReadTrackingCutover`. */
  readonly cutover: Date | null;
};

/**
 * Repli curseur de la LIVRAISON — la moitié que `resolveReadAt` avait et que
 * la livraison n'avait pas.
 *
 * `ConversationReadCursor.lastDeliveredAt` est posé à `now` par
 * `_advanceCursor` : c'est l'heure à laquelle un accusé a été TRAITÉ, jamais la
 * position du dernier message réellement livré. Le comparer à
 * `message.createdAt` confronte une horloge MURALE à une POSITION, et répond
 * « remis » pour tout message antérieur au traitement — y compris celui que le
 * drain vient de REFUSER d'émettre (#18614) et celui que le plafond de 500 de
 * `RedisDeliveryQueue` a évincé sans que rien ne le signale. L'auteur voyait
 * ✓✓ sur un message que personne n'a reçu.
 *
 * La discipline est celle de `resolveReadAt`, et pour la même raison : passé la
 * bascule, **l'absence de gel VEUT DIRE l'absence de livraison** — les deux
 * sites qui avancent ce curseur figent dans le même mouvement
 * (`markMessagesAsReceived`, et la cascade « lu ⇒ remis » de
 * `markMessagesAsRead` — nommée `markConversationAsRead` par ce commentaire
 * jusqu'à #19261, un nom qu'aucune méthode du dépôt n'a jamais porté), si bien
 * qu'un message livré après la bascule porte
 * toujours son entrée. Avant la bascule, le repli reste consenti : ces
 * messages-là n'ont jamais eu l'occasion d'être gelés, et les en priver les
 * ferait tous basculer en « jamais remis ».
 *
 * `cutover: null` — variable d'environnement absente — conserve le comportement
 * historique à l'identique, borne au message comprise : la bascule s'arme
 * délibérément, jamais par le seul fait de livrer ce code.
 */
export function resolveCursorDeliveredAt({
  cursorLastDeliveredAt,
  messageCreatedAt,
  cutover,
}: ResolveCursorDeliveredAtInput): CursorDeliveredAt {
  if (cutover && messageCreatedAt.getTime() >= cutover.getTime()) return null;

  if (!cursorLastDeliveredAt) return null;

  return cursorLastDeliveredAt.getTime() >= messageCreatedAt.getTime()
    ? (cursorLastDeliveredAt as NonNullable<CursorDeliveredAt>)
    : null;
}

export type ResolveReceivedAtInput = {
  /** `MessageStatusEntry.receivedAt`, figé write-once. */
  readonly frozenReceivedAt: Date | null;
  /** `MessageStatusEntry.deliveredAt`, figé write-once. */
  readonly frozenDeliveredAt: Date | null;
  /**
   * Le repli curseur, déjà borné au message ET à la bascule. Le type l'exige :
   * seul `resolveCursorDeliveredAt` peut le produire.
   */
  readonly cursorDeliveredAt: CursorDeliveredAt;
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
 * dernier repli — et elle survit à la bascule, `resolveReadAt` ne rendant plus
 * alors qu'une date FIGÉE. En son absence, rien n'est affirmé : `null`.
 *
 * Le repli curseur, lui, est borné par `resolveCursorDeliveredAt` (#18701) : il
 * ne peut plus entrer ici sans l'être, son type en est la preuve.
 */
export function resolveReceivedAt({
  frozenReceivedAt,
  frozenDeliveredAt,
  cursorDeliveredAt,
  readAt,
}: ResolveReceivedAtInput): Date | null {
  return frozenReceivedAt ?? frozenDeliveredAt ?? cursorDeliveredAt ?? readAt;
}
