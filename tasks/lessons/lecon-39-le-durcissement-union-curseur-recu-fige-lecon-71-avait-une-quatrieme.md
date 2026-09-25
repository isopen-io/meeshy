## Leçon 39 — le durcissement union curseur+reçu figé (Leçon 71) avait UNE quatrième jumelle non traitée : le calcul INLINE des compteurs dans la route liste `GET /messages` — la plus chaude de toutes (2026-07-07, routine messaging)

**Contexte** : Leçon 37 a corrigé le sous-comptage de `getConversationReadStatuses` (batch) en l'alignant
sur l'union `{curseurs actifs} ∪ {reçus figés actifs}` déjà présente dans `getMessageReadStatus` /
`getMessageStatusDetails`. Mais le calcul des `deliveredCount`/`readCount` par message existe AUSSI en
quatrième exemplaire : inliné dans le handler `GET /conversations/:id/messages`
(`routes/conversations/messages.ts:988-1022`), pas dans le service. Ce quatrième site ne bouclait QUE sur
`conversationReadCursor.findMany` — jamais `messageStatusEntry`. Après `cleanupObsoleteCursors` (supprime un
curseur dont le `lastReadMessageId` pointe vers un message effacé, sans toucher le reçu figé write-once), la
liste rendait `deliveredCount:0`/`readCount:0` (aucun tick ✓✓) alors que `GET /messages/:id/read-status` et
`GET /conversations/:id/read-statuses` renvoyaient `1` pour EXACTEMENT le même message — incohérence sur le
chemin le plus fréquenté (chaque ouverture de conversation).

**Fix** : mirroring littéral de la boucle union de `getConversationReadStatuses` dans la route — troisième
`Promise.all` fetch `messageStatusEntry.findMany({ conversationId, messageId: { in: messageIds } })`, index
`messageId → participantId → entry`, union `evaluatedParticipantIds` (sender exclu, figé d'un participant
inactif ignoré), puis `deliveredAt = frozen?.receivedAt ?? frozen?.deliveredAt ?? cursorDelivered`,
`readAt = frozen?.readAt ?? cursorRead`. 172/172 route + 210/210 suites read-status siblings. RED prouvé par
`git stash` du seul source : le test "union parity" tombe à `deliveredCount:0` au lieu de 1.

**Règle réutilisable** : quand une leçon corrige une « jumelle oubliée » d'une famille de méthodes, GREPPER
tous les sites qui recalculent la même grandeur — pas seulement les méthodes du service. Un calcul INLINE
dans une route (ici un handler de 30 lignes qui n'appelle même pas le service partagé) est un site jumeau
invisible pour une recherche par nom de méthode ; ici la même grandeur (statut livré/lu par message) était
implémentée QUATRE fois — trois dans `MessageReadStatusService`, une inlinée dans la route. Le durcissement
appliqué aux trois du service mais oublié sur l'inline-route est la signature exacte du sibling-drift, et le
site inline est souvent le PLUS chaud (rendu direct de la liste). Idéalement : déléguer la route au service
plutôt que dupliquer la logique — mais à défaut, tout durcissement d'une grandeur doit balayer les copies
inline autant que les méthodes nommées.
