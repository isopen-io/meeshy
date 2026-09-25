## Leçon 37 — `getConversationReadStatuses` (batch) ne consultait que les curseurs, ses jumelles mono-message consultent l'UNION curseurs + reçus figés — sous-comptage après `cleanupObsoleteCursors` (2026-07-07, routine messaging)

**Contexte** : trois méthodes de `MessageReadStatusService` calculent le statut livré/lu par message
pour la même conversation. `getMessageReadStatus` et `getMessageStatusDetails` énumèrent l'UNION des
participants ayant un curseur ET de ceux ayant un `MessageStatusEntry` figé (write-once) pour CE message —
précisément pour survivre à `cleanupObsoleteCursors`, qui supprime un `ConversationReadCursor` dont le
`lastReadMessageId` pointe vers un message effacé mais **ne touche jamais** le reçu figé. La jumelle batch
`getConversationReadStatuses` (route `GET /conversations/:id/read-statuses`) ne bouclait QUE sur les curseurs
actifs → après nettoyage d'un curseur, un reçu de livraison/lecture figé toujours valide disparaissait du
comptage. Résultat client-observable : l'endpoint batch renvoyait `receivedCount`/`readCount` **strictement
inférieurs** à l'endpoint mono-message pour EXACTEMENT les mêmes données.

**Fix** : mirroring de la logique d'union. `getConversationReadStatuses` fetch désormais
`messageStatusEntry.findMany({ messageId: { in }, conversationId })`, indexe `messageId → participantId →
entry`, et boucle sur l'union `{curseurs actifs} ∪ {reçus figés de participants actifs}` (sender exclu, figé
d'un participant inactif ignoré — parité exacte avec le `if (!participant) continue` de `getMessageReadStatus`).
Par participant : `receivedAt = frozen.receivedAt ?? frozen.deliveredAt ?? cursorDelivered`,
`readAt = frozen.readAt ?? cursorRead` — copie littérale des lignes 944-955 de la jumelle mono-message.
158/158 sur la suite du service + 188/188 avec la suite de route, tsc gateway 0 erreur. RED prouvé par
`git stash` du seul source : le test "union parity" tombe à `receivedCount:1` au lieu de 2.

**Règle réutilisable** : quand une famille de méthodes calcule la MÊME grandeur (ici statut par message),
toute variante batch/agrégée doit être vérifiée contre la source de vérité mono-message — un durcissement
(ici l'union curseur+figé introduite pour `cleanupObsoleteCursors`) appliqué aux jumelles mono-message mais
oublié sur la variante batch est la signature exacte du sibling-drift que ce backlog trouve à répétition.
