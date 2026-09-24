/**
 * La loi du PREMIER MESSAGE NON LU — UNE fonction, ni dans un client ni dans
 * le gateway (issue #7215, dépend de G1 #7198). C'est elle qui décide où un
 * fil s'ouvre (D-L2 : sur le séparateur dès qu'il existe des non-lus, quel
 * que soit leur nombre) et ce que dit le séparateur (D-L3 : « N messages non
 * lus », en couleur primaire).
 *
 * Miroir Swift : `FirstUnreadBoundary.resolve(...)`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/FirstUnreadBoundary.swift`),
 * mêmes cas rejoués en Swift Testing.
 *
 * Entrée : la fenêtre de messages CHARGÉE (pas nécessairement toute
 * l'historique) et la frontière de lecture du lecteur, exactement la forme
 * servie par `GET /conversations` et `GET /conversations/:id`
 * (`ReadCursorBoundary`, `services/gateway/src/routes/conversations/
 * read-cursor-projection.ts:16-20`) : `lastReadMessageId` / `lastReadAt` /
 * `lastReadMessageCreatedAt`, chacun `undefined` ou `null` quand le curseur
 * (ou le champ) n'existe pas — jamais fabriqué (REV-4).
 *
 * `viewerId` et `senderId` se comparent dans l'espace des **User.id**, celui
 * que les clients reçoivent : en base `Message.senderId` est un
 * `Participant.id` (`schema.prisma`, relation `MessageSender`), mais la liste
 * le REMAPPE avant de servir
 * (`services/gateway/src/routes/conversations/messages-list-query.ts:618-621`),
 * et c'est cet espace qu'emploie déjà `isMineOf()`
 * (`apps/web/src/lib/view/message.ts:34`). Un appelant qui tiendrait des
 * LIGNES Prisma doit donc passer le `Participant.id` du lecteur, pas son
 * `User.id`.
 *
 * Règles :
 * 1. **Jamais un message du LECTEUR** — un message que le lecteur a
 *    lui-même envoyé n'est jamais « non lu » pour lui : ni élu
 *    `firstUnreadId`, ni compté dans `unreadCount`. Il ne bloque pas non
 *    plus le message d'autrui suivant.
 * 2. **Jamais avant (ni AU) la frontière** — la frontière chronologique
 *    descend les MÊMES trois rangs que le compte autoritatif du serveur
 *    (`MessageReadStatusService.getUnreadCount`,
 *    `services/gateway/src/services/MessageReadStatusService.ts:259-260`) :
 *    `lastReadMessageCreatedAt` (le `createdAt` du message lu, la clé
 *    chronologique — voir son doc-comment dans
 *    `packages/shared/types/conversation.ts:608` pour la raison exacte de
 *    préférer CE champ à `lastReadAt`, qui n'est que l'horloge de l'ACTION
 *    de lecture, pas la position dans le flux), puis `lastReadAt`, puis
 *    **`joinedAt`** — la date d'entrée du lecteur dans la conversation.
 *    Ce troisième rang n'est pas décoratif : la liste de messages ne
 *    plancher PAS à `joinedAt` (`messages-list.ts:335-347` ne borne que sur
 *    un lien de partage sans historique), donc un membre qui rejoint un
 *    groupe ancien charge TOUT son historique. Sans ce rang, le séparateur
 *    s'ouvrirait sur le premier message de 2019 en annonçant « 4 812
 *    messages non lus » pendant que le badge du serveur en dit 2. Aucun des
 *    trois ⇒ rien n'a jamais été lu ET l'entrée est inconnue ⇒ tout message
 *    d'autrui est candidat. Qui ALIMENTE ce rang : `currentUserJoinedAt`,
 *    servi par `GET /conversations`
 *    (`services/gateway/src/routes/conversations/core-list.ts:892`) et déjà
 *    décodé côté iOS (`MeeshyConversation.currentUserJoinedAt`). `GET
 *    /conversations/:id` ne le sert PAS — un appelant qui n'ouvre QUE le
 *    détail passe `undefined` et retombe sur le comportement d'avant ce
 *    rang. `lastReadMessageId` est en plus exclu
 *    explicitement du calcul (défense contre un décalage d'horloge entre le
 *    curseur et la fenêtre chargée) : le message AU curseur n'est jamais
 *    lui-même « non lu ».
 * 3. **`null` si tout est lu** — jamais un objet avec `unreadCount: 0` : un
 *    seul test suffit à l'appelant (`if (boundary) { … }`).
 *
 * Deux bornes ASSUMÉES, dites ici pour qu'aucun appelant ne les découvre en
 * production :
 * - `unreadCount` compte la FENÊTRE REÇUE, pas la conversation entière. Le
 *   compte autoritatif reste celui du serveur (`ConversationReadCursor.
 *   unreadCount`, servi par la liste et le détail) ; une surface qui affiche
 *   un nombre à côté du badge sert celui du serveur et ne fabrique pas le
 *   sien à partir d'une page.
 * - un message SUPPRIMÉ n'est pas filtré ici parce qu'il n'arrive jamais :
 *   la liste pose `deletedAt: null` (`messages-list.ts:337`). Un tombstone
 *   marqué EN MÉMOIRE après un `message:deleted` reste à la charge de
 *   l'appelant, qui est seul à savoir ce qu'il garde dans son tableau.
 *
 * `unreadCountHint` (#7351, V3, web-v2 seulement pour l'instant — dette
 * consignée pour I1, le mirror Swift ne le porte pas encore) — LE REPLI
 * SERVEUR quand AUCUN des trois rangs n'existe (`boundaryTime === null`) :
 * un lecteur qui ouvre `GET /conversations/:id` en tout premier (deep link,
 * notification) sur une conversation JAMAIS ouverte n'a ni cursor ni
 * `joinedAt` (servi par la LISTE seule) — les trois rangs sont absents alors
 * que le serveur SAIT, par `unreadCount`, que des messages sont non lus.
 * Sans ce repli, l'absence locale de rang ferait passer un fil réellement
 * non lu pour lu, l'inverse de D-L2 (2026-09-21). Deux règles, dans cet
 * ordre, et SEULEMENT quand aucun rang chronologique n'existe
 * (`boundaryTime === null`) :
 * 1. `unreadCountHint === 0` ⇒ `null` — aucun candidat inventé.
 * 2. `unreadCountHint` positif ⇒ élire les DERNIERS `unreadCountHint`
 *    candidats (jamais les premiers — ce serait rejouer le « 4 812 non-lus »
 *    que l'absence de repli laissait faire côté appelant). Une fenêtre plus
 *    courte que le hint rend tous les candidats chargés non lus, cohérent
 *    avec la borne déjà documentée : `unreadCount` compte la fenêtre reçue.
 * Ignoré dès qu'un rang chronologique existe, y compris À ZÉRO : les rangs
 * 1-3 restent seuls maîtres du calcul, comme dans le miroir Swift. Un compte
 * relu d'un cache de détail est figé à l'instant de sa dernière écriture —
 * un message arrivé ensuite par le socket ne l'incrémente pas, alors que le
 * curseur, lui, le laisse passer : c'est le curseur qui dit la vérité.
 *
 * La fonction trie une COPIE de `messages` (immutabilité, et les deux points
 * d'entrée possibles — page REST, page rejouée depuis un socket — ne
 * garantissent pas le même ordre). À `createdAt` ÉGAL, l'`id` départage :
 * sans cette seconde clé, `Array.prototype.sort` (stable) et
 * `Swift.sorted(by:)` (NON stable) éliraient deux messages différents pour
 * la même entrée — deux miroirs qui divergent sur un cas nominal (deux
 * messages gravés dans la même milliseconde).
 */

export type FirstUnreadCandidateMessage = {
  readonly id: string;
  readonly senderId: string;
  readonly createdAt: Date;
};

export type FirstUnreadBoundaryParams = {
  readonly messages: readonly FirstUnreadCandidateMessage[];
  readonly lastReadMessageId?: string | null;
  readonly lastReadAt?: Date | null;
  readonly lastReadMessageCreatedAt?: Date | null;
  /** Entrée du lecteur dans la conversation — 3e et dernier rang de la frontière. */
  readonly joinedAt?: Date | null;
  readonly viewerId: string;
  /** Le compte AUTORITATIF du serveur (`Conversation.unreadCount`) — voir le
   * doc-comment de tête, § `unreadCountHint`. */
  readonly unreadCountHint?: number;
};

export type FirstUnreadBoundaryResult = {
  readonly firstUnreadId: string;
  readonly unreadCount: number;
};

function byCreatedAtThenId(
  a: FirstUnreadCandidateMessage,
  b: FirstUnreadCandidateMessage
): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function firstUnreadBoundary(
  params: FirstUnreadBoundaryParams
): FirstUnreadBoundaryResult | null {
  const {
    messages,
    lastReadMessageId,
    lastReadAt,
    lastReadMessageCreatedAt,
    joinedAt,
    viewerId,
    unreadCountHint,
  } = params;

  const boundaryTime = lastReadMessageCreatedAt ?? lastReadAt ?? joinedAt ?? null;

  const otherMessages = messages
    .filter((message) => message.senderId !== viewerId)
    .filter((message) => message.id !== lastReadMessageId)
    .sort(byCreatedAtThenId);

  const candidates =
    boundaryTime !== null
      ? otherMessages.filter((message) => message.createdAt.getTime() > boundaryTime.getTime())
      : unreadCountHint === undefined
        ? otherMessages
        : otherMessages.slice(Math.max(0, otherMessages.length - Math.max(0, unreadCountHint)));

  const first = candidates[0];
  if (!first) return null;

  return { firstUnreadId: first.id, unreadCount: candidates.length };
}
