/**
 * La loi du PREMIER MESSAGE NON LU — UNE fonction, ni dans un client ni dans
 * le gateway (issue #7215, dépend de G1 #7198). C'est elle qui décide où un
 * fil s'ouvre (D-L2 : sur le séparateur dès qu'il existe des non-lus, quel
 * que soit leur nombre) et ce que dit le séparateur (D-L3 : « N messages non
 * lus », en couleur primaire).
 *
 * Miroir Swift : `FirstUnreadBoundary.resolve(...)`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/FirstUnreadBoundary.swift`),
 * mêmes 8 cas rejoués en Swift Testing.
 *
 * Entrée : la fenêtre de messages CHARGÉE (pas nécessairement toute
 * l'historique) et la frontière de lecture du lecteur, exactement la forme
 * servie par `GET /conversations` et `GET /conversations/:id`
 * (`ReadCursorBoundary`, `services/gateway/src/routes/conversations/
 * read-cursor-projection.ts:16-20`) : `lastReadMessageId` / `lastReadAt` /
 * `lastReadMessageCreatedAt`, chacun `undefined` ou `null` quand le curseur
 * (ou le champ) n'existe pas — jamais fabriqué (REV-4).
 *
 * Règles :
 * 1. **Jamais un message du LECTEUR** — un message que le lecteur a
 *    lui-même envoyé n'est jamais « non lu » pour lui : ni élu
 *    `firstUnreadId`, ni compté dans `unreadCount`. Il ne bloque pas non
 *    plus le message d'autrui suivant.
 * 2. **Jamais avant (ni AU) la frontière** — la frontière chronologique est
 *    `lastReadMessageCreatedAt` en priorité (c'est le createdAt du message
 *    lu, la clé chronologique — voir son doc-comment dans
 *    `packages/shared/types/conversation.ts:608` pour la raison exacte de
 *    préférer CE champ à `lastReadAt`, qui n'est que l'horloge de l'ACTION
 *    de lecture, pas la position dans le flux), avec repli sur `lastReadAt`
 *    quand le premier est absent. Aucun des deux ⇒ rien n'a jamais été lu
 *    (participant neuf, ou curseur absent) ⇒ tout message d'autrui est
 *    candidat. `lastReadMessageId` est en plus exclu explicitement du calcul
 *    (défense contre un décalage d'horloge entre le curseur et la fenêtre
 *    chargée) : le message AU curseur n'est jamais lui-même « non lu ».
 * 3. **`null` si tout est lu** — jamais un objet avec `unreadCount: 0` : un
 *    seul test suffit à l'appelant (`if (boundary) { … }`).
 *
 * La fonction trie une COPIE de `messages` (immutabilité, et les deux points
 * d'entrée possibles — page REST, page rejouée depuis un socket — ne
 * garantissent pas le même ordre).
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
  readonly viewerId: string;
};

export type FirstUnreadBoundaryResult = {
  readonly firstUnreadId: string;
  readonly unreadCount: number;
};

export function firstUnreadBoundary(
  params: FirstUnreadBoundaryParams
): FirstUnreadBoundaryResult | null {
  const { messages, lastReadMessageId, lastReadAt, lastReadMessageCreatedAt, viewerId } = params;
  const boundaryTime = lastReadMessageCreatedAt ?? lastReadAt ?? null;

  const candidates = messages
    .filter((message) => message.senderId !== viewerId)
    .filter((message) => message.id !== lastReadMessageId)
    .filter((message) => boundaryTime === null || message.createdAt.getTime() > boundaryTime.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const first = candidates[0];
  if (!first) return null;

  return { firstUnreadId: first.id, unreadCount: candidates.length };
}
