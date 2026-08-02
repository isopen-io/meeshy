# 03 — Temps réel & sockets

> Périmètre : sockets messages (conversations, éditions/suppressions, réactions, lecture multi-device) et sockets sociaux (feed, stories, statuses, notifications) — événements, reconnexion, écriture au cache. Méthodologie et sévérités : voir README.md. Architecture de référence : 00-etat-des-lieux.md. HEAD audité : 901e92589.

## Rappel d'architecture (voir 00-etat-des-lieux.md §4 pour le détail)

Deux singletons SDK transportent le temps réel : `MessageSocketManager` (~70 listeners) et `SocialSocketManager` (31 événements), tous deux avec décodage off-main sérialisé et stratégie de dates ISO8601. Côté messages, un double étage écrit le cache : `ConversationSocketHandler` (conversation ouverte, write-through GRDB systématique) et `ConversationSyncEngine` (relay global qui persiste `message:new` même conversation fermée via `apiMessagePersistor` et maintient la liste). Point établi par la vérification adversariale : le gateway joint le socket à TOUTES les rooms de conversation actives dès l'authentification (`AuthHandler._joinUserConversations`, avec retries) — un client connecté reçoit donc les événements de ses conversations fermées ; l'offline ≤ 48 h est rejoué par la file de livraison Redis (fallback mémoire plafonné à 50 messages/utilisateur). Côté social, les sinks vivent dans `FeedViewModel`/`StoryViewModel`/`StatusViewModel` ; le feed est re-souscrit au `.connect` et rattrapé au `didReconnect` quand il est à l'écran. À la reconnexion : `suspendTransport()` préserve `hadPreviousConnection` + rooms, puis `didReconnect` → `triggerSyncIfNeeded` (coalescé 2 s) → `syncMissedMessages` (forward-paging par watermark `?after=`).

## Écarts retenus

### realtime-01 — Édits/suppressions reçus conversation fermée : jamais écrits en GRDB (les événements ARRIVENT mais restent volatiles) ; un « supprimer pour tous » reste affiché à vie · **P1** · effort S (ajusté de M : le backstop d'absence initialement proposé est abandonné)

**Constat.** `handleEditedMessage` et `handleDeletedMessage` du relay global ne patchent que le CacheCoordinator (volatile), jamais GRDB — contrairement à `handleNewMessage` qui appelle `apiMessagePersistor`. Les événements arrivent pourtant bien au client : en live grâce à l'auto-join de toutes les rooms à l'authentification, et au reconnect ≤ 48 h via le rejeu de la file de livraison. Ils ne sont simplement jamais persistés. Comme la liste REST filtre les messages supprimés (`deletedAt: null`) et que `upsertFromAPIMessages` n'a aucune réconciliation d'absence, la suppression ne guérit JAMAIS ; l'édition, elle, guérit au refresh des 30 derniers ou au scroll (staleness bornée).

**Preuve.** `ConversationSyncEngine.swift:986-998` (`handleEditedMessage`) et `:1000-1017` (`handleDeletedMessage`) — aucun appel à `apiMessagePersistor`, contrairement à `handleNewMessage` (`:906`). Filtre REST : `services/gateway/src/routes/conversations/messages.ts:605-608` (la référence initiale `routes/messages.ts:111` désignait le GET unitaire). `markDeleted` matche déjà `localId OR serverId` (`MessagePersistenceActor.swift:837-850`) — aucun `resolveLocalId` nécessaire.

**Impact.** Un message « supprimé pour tous » pendant que le destinataire a la conversation fermée continue de s'afficher indéfiniment à la réouverture, peint depuis GRDB — violation directe de la promesse delete-for-everyone. Un message édité s'affiche dans sa version périmée jusqu'au prochain refresh.

**Correctif pas-à-pas.**
1. `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`, `handleEditedMessage` (`:986-998`) : après l'`upsertPatch`, ajouter `await apiMessagePersistor?([apiMessage])` — cela route vers `bufferIncomingAPIMessages` → `upsertFromAPIMessages`, où la garde `pendingEditMessageIds` (`MessagePersistenceActor.swift:1433`, `:1722`) protège déjà les éditions optimistes locales.
2. Ajouter au `ConversationSyncEngine` un hook `messageDeletionPersistor: (@Sendable (_ conversationId: String, _ messageId: String, _ deletedAt: Date) async -> Void)?`, construit sur le modèle exact de `_apiMessagePersistor` (`:135-138`, accès via `stateQueue`) ; l'appeler en fin de `handleDeletedMessage` (`:1000-1017`) avec `event.conversationId`, `event.messageId`, `Date()`.
3. Câbler le hook dans `apps/ios/Meeshy/Core/DependencyContainer.swift` (juste après le bloc `:96-99`) : `ConversationSyncEngine.shared.messageDeletionPersistor = { [weak persistence] _, messageId, deletedAt in try? await persistence?.markDeleted(localId: messageId, deletedAt: deletedAt) }` — le WHERE de `markDeleted` matche le `serverId` directement.
4. Ne PAS implémenter de backstop d'absence par fenêtre REST dans `refreshMessagesFromAPI` : le cas offline > 48 h relève du client `/sync` à tombstones (écart sync-01, fichier 04) — cross-référencer, ne pas dupliquer. Ne PAS toucher au handler de conversation ouverte (`ConversationSocketHandler`) : la double écriture est idempotente.

**Tests (TDD — RED d'abord).** `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift` : `test_startSocketRelay_messageEditedEvent_forwardsToApiMessagePersistor` (mock socket publie `messageEdited`, stub de persistor enregistre l'appel, assert de l'`apiMessage` transmis) ; `test_startSocketRelay_messageDeletedEvent_invokesMessageDeletionPersistor` (assert `conversationId`/`messageId` transmis). `MeeshySDKTests/Persistence` : `test_markDeleted_matchedByServerIdOnly_setsDeletedAtAndClearsContent` (ligne insérée avec `serverId ≠ localId`). Intégration app (`MeeshyTests`) : `test_reopenConversation_afterRemoteDeleteWhileClosed_rendersDeletedBubble` (fixture GRDB + événement simulé via le relay, snapshot du `MessageStore`).

**Risque de régression.** Double écriture avec le handler de conversation ouverte — idempotente (`markDeleted` pose `deletedAt` ; l'upsert d'édition a une garde de staleness par `editedAt`). Garde-fous : les gardes outbox `pendingEditMessageIds`/`pendingDeleteMessageIds` existantes protègent les mutations optimistes en attente ; tester « édition optimiste locale pendant un `message:edited` entrant ».

**Dépendances.** sync-01 (fichier 04, complémentaire pour l'offline > 48 h). · **Backend requis :** non

---

### realtime-02 — Trou intérieur de timeline à l'ouverture : les 30 derniers sont récupérés sans backfill de continuité · **P1** · effort M

**Constat.** À l'ouverture d'une conversation, `refreshMessagesFromAPI` ne récupère que les 30 derniers messages ; `syncMissedMessages` (le forward-paging par watermark qui saurait combler un trou) n'est appelé que depuis `triggerSyncIfNeeded` — déclenché par `didReconnect`/`willEnterForeground` pour une conversation DÉJÀ ouverte, jamais sur le chemin d'ouverture. La fenêtre du store (`ORDER BY createdAt DESC LIMIT 200`) ne détecte aucune discontinuité, et `loadOlderMessages` pagine sous le plus ancien affiché, donc sous le trou. Déclencheurs réels (corrigés par la vérification — le scénario « groupe jamais ouvert depuis le login » est réfuté, voir Écartés) : offline > 48 h (TTL de la file de livraison, `RedisDeliveryQueue.ts:340`), fallback mémoire de la file plafonné à 50 messages/utilisateur (`RedisDeliveryQueue.ts:154-155`, `:212-226`), échec d'enqueue/drain, drop de décodage.

**Preuve.** `ConversationViewModel.swift:1591-1598` (`limit: 30`) ; `ConversationSocketHandler.swift:1135-1148` (seul appelant de `syncMissedMessages`) ; `MessageStore.swift:106-113` et `:148` (fenêtre 200 sans détection de discontinuité) ; `ConversationViewModel.swift:1788` (`loadOlderMessages` pagine sous le plus ancien). Détail vérifié qui dicte l'emplacement du correctif : la branche `.expired`/`.empty` de `loadMessages` (`ConversationViewModel.swift:1533-1537`) appelle `refreshMessagesFromAPI` sans passer par les Tasks `.fresh`/`.stale` — un pré-appel dans `loadMessages` la raterait.

**Impact.** GRDB contient les vieux messages plus les 30 derniers, avec un trou silencieux entre les deux, rendu comme une timeline contiguë — et jamais comblé ensuite (le watermark part du plus récent ; la pagination arrière part du plus ancien affiché).

**Correctif pas-à-pas.**
1. `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` : extraire le cœur de forward-paging de `syncMissedMessages` (`:3708-3734`) en helper privé `backfillForward(from: Date) async throws -> [APIMessage]` (boucle `messageService.listAfter`, pages de 100, cap 1000, avance du curseur au max de page) ; `syncMissedMessages` délègue au helper (comportement inchangé).
2. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` : ajouter `func newestServerCreatedAt(conversationId: String) throws -> Date?` — max(`createdAt`) des `MessageRecord` de la conversation avec `serverId != NULL` (exclut les lignes optimistes à horloge locale, même règle que `SyncWatermark.newest`).
3. Dans `refreshMessagesFromAPI` (`:1582`), APRÈS le fetch (`:1591-1598`) et AVANT `upsertFromAPIMessages` (`:1602`) : lire `let newestLocal = try? await messagePersistence.newestServerCreatedAt(conversationId:)` ; si `newestLocal != nil` ET `min(response.data.createdAt) > newestLocal` ET aucun id de la page n'est déjà présent en GRDB → `let gap = try await backfillForward(from: newestLocal)` puis upserter `gap` + page ensemble.
4. Ne toucher NI `triggerSyncIfNeeded` NI `MessageStore`. GRDB vide → `newestLocal` nil → no-op (cold start intact).

**Tests (TDD — RED d'abord).** `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` : `test_refreshMessagesFromAPI_pageDisjointAheadOfLocal_backfillsGapContiguously` (GRDB seedé avec de vieux messages porteurs de `serverId`, mock service servant une page « 30 derniers » disjointe + réponses `listAfter` ; assert que `listAfter` est appelé depuis le watermark local et que les messages intermédiaires sont upsertés) ; `test_refreshMessagesFromAPI_pageOverlapsLocal_skipsBackfill` ; `test_refreshMessagesFromAPI_emptyLocalStore_skipsBackfill`. `MeeshySDKTests/Persistence` : `test_newestServerCreatedAt_ignoresOptimisticRows_returnsNewestServerStamped`. Scénario branche `.expired` : `test_loadMessages_expiredCacheWithLocalHistory_backfillsInteriorGap`.

**Risque de régression.** Sur-fetch au premier open après longue absence — borné (pages de 100, cap 1000). Le no-op sur GRDB vide préserve le cold start.

**Dépendances.** realtime-05 (fiabilise `syncMissedMessages`, dont le cœur est extrait ici). · **Backend requis :** non

---

### rts-01 — Fenêtre aveugle du feed hors écran : sinks désarmés + feed room quittée, aucun refetch au retour · **P1** · effort S

**Constat.** Quand le feed quitte l'écran, `onDisappear` appelle `unsubscribeFromSocketEvents()`, qui vide `socketCancellables` (y compris le sink `didReconnect`) ET émet `feed:unsubscribe` — le gateway retire le client de la feed room. Au retour, `subscribeToSocketEvents` ne fait que `connect()`, qui early-return si déjà connecté, et `subscribeFeed()` n'est ré-émis QUE dans le handler `.connect`. Le `.task` de la vue ne recharge que si `posts` est vide. Résultat : aucun rattrapage, aucun flux — donnée périmée persistante jusqu'au pull-to-refresh.

**Preuve.** `FeedView.swift:1081-1083` (`if viewModel.posts.isEmpty { await viewModel.loadFeed() }`) ; `FeedView.swift:1190-1196` (`onDisappear` → `unsubscribeFromSocketEvents()`) ; `FeedViewModel.swift:1171-1175` (purge des cancellables + `feed:unsubscribe` l.1173) ; `FeedViewModel.swift:944-952` (ré-arm sans re-souscription) ; `SocialSocketManager.swift:441-443` (early-return de `connect()`) et `:846` (`subscribeFeed()` uniquement au `.connect`).

**Impact.** L'utilisateur quitte le feed 30 minutes (conversations) puis revient : posts créés/supprimés/commentés pendant l'absence ni appliqués (sinks morts, GRDB désarmé) ni rattrapés (pas de refetch, `didReconnect` survenu pendant l'absence perdu). Violation directe de « zéro donnée périmée persistante ».

**Correctif pas-à-pas.**
1. `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` : ajouter `private var hasSubscribedOnce = false`.
2. Dans `subscribeToSocketEvents()`, après `guard socketCancellables.isEmpty else { return }` (l.951) : `let isRearm = hasSubscribedOnce; hasSubscribedOnce = true`.
3. Après `socialSocket.connect()` (l.952), ajouter `socialSocket.subscribeFeed()` (= correctif stores-02, fichier 05, à livrer ENSEMBLE ; le join est idempotent côté Socket.IO ; si le socket n'est pas encore connecté, le handler `.connect` rejouera l'émission ; la méthode est déjà sur le protocole `SocialSocketProviding` l.279).
4. Si `isRearm` : `Task { await self.loadFeed(forceRefresh: true) }` — c'est exactement le chemin du sink `didReconnect` existant : garde `isFeedLoadInProgress` (l.112-114), `mergePreservingRealtimeHead` (l.219-226), silencieux car `showLoading: posts.isEmpty`.
5. Ne PAS appeler `fetchFeedFromNetwork` directement (méthode privée, sans garde in-progress → double fetch concurrent avec un refresh `.stale`).
6. Ne PAS mettre de `loadFeed()` inconditionnel dans le `.task` de `FeedView` : la branche `.fresh` (l.124-128) fait `posts = cachedPosts` et reverterait les mutations socket si le save débouncé de 2 s est encore en vol.
7. Ne rien toucher dans `FeedView` ni dans `unsubscribeFromSocketEvents`.

**Tests (TDD — RED d'abord).** `MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift` : `test_subscribeToSocketEvents_rearmAfterUnsubscribe_backfillsFeedFromNetwork` (arm → `unsubscribeFromSocketEvents` → stub `/posts/feed` → arm ⇒ posts rafraîchis via `waitForCondition`, exactement 1 fetch) ; `test_subscribeToSocketEvents_firstArm_doesNotFetchFeed` (arm à froid ⇒ 0 requête `/posts/feed`) ; `test_subscribeToSocketEvents_rearm_reemitsFeedSubscribe` (subscribe/unsubscribe/subscribe ⇒ `MockSocialSocket.subscribeFeedCallCount == 2` — compteur déjà présent, `MockSocialSocket.swift:55`). Modèle : `test_didReconnect_backfillsFeedFromNetwork` (`FeedViewModelTests.swift:168`), en delta d'appels, jamais en absolu.

**Risque de régression.** Double fetch au premier appear — neutralisé par le flag « pas au premier arm » + la garde `isFeedLoadInProgress` existante.

**Dépendances.** stores-02 (fichier 05 — re-souscription `subscribeFeed`, même PR). · **Backend requis :** non

---

### rts-02 — Aucun rattrapage stories au reconnect social : l'infra delta + tombstones existe mais n'est pas branchée · **P1** · effort S

**Constat.** Le seul observer de reconnexion de `StoryViewModel` est `MessageSocketManager.shared.$isConnected` et il ne fait QUE relancer les uploads en échec (`retryUpload`). `subscribeToSocketEvents` (l.2416-2637) ne contient aucun sink `socialSocket.didReconnect` (zéro occurrence du symbole dans le fichier, vérifié par grep). `loadStories` n'est appelé qu'aux `.task`/appear et aux pull-to-refresh — jamais au retour de background. Pourtant toute l'infrastructure de delta est complète et inutilisée sur ce signal : `fetchStoriesFromNetwork(deltaSince:)` (l.426-457), tombstones `purgeDeadStories(deletedIds:)` (l.447, appelé même sur delta vide), curseur `Self.deltaSince` (l.2380). Le `didReconnect` du socket social FIRE bien au resume (`suspendTransport` préserve `hadPreviousConnection`, `SocialSocketManager.swift:479-492`, `:551-559`).

**Preuve.** `StoryViewModel.swift:297-319` (observer limité au retry d'upload) ; `:2416-2637` (aucun sink `didReconnect`) ; sites d'appel de `loadStories` : `RootView.swift:675`, `RootViewComponents.swift:566` et `:681`, `FeedView.swift:1111`, `ConversationListView.swift:903`, `FeedView.swift:926`.

**Impact.** Retour de background sur l'écran conversations : tray périmé — stories supprimées pendant la coupure toujours affichées (tap → « story introuvable »), nouvelles stories absentes — jusqu'à navigation vers le feed ou pull-to-refresh.

**Correctif pas-à-pas.**
1. `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`, dans `subscribeToSocketEvents()` juste après la garde `guard socketCancellables.isEmpty` (l.2420), ajouter :
   ```swift
   socialSocket.didReconnect
       .receive(on: DispatchQueue.main)
       .sink { [weak self] in
           guard let self, !self.isLoading else { return }
           Task { await self.fetchStoriesFromNetwork(deltaSince: Self.deltaSince(for: self.storyGroups)) }
       }
       .store(in: &socketCancellables)
   ```
2. Le curseur `deltaSince` se calcule DANS le sink, au moment de l'événement — jamais à l'armement.
3. Rien d'autre à écrire : `insertOrMergeStoryGroups(replacingExisting: true)` (l.439), la garde `isViewed` monotone, les tombstones (l.447) et le fallback full sur échec du delta (l.454-456) garantissent l'idempotence.
4. Ne PAS toucher `observeReconnectionForRetry` (l.297 — socket messages, retries d'upload) ni les sites d'appel de `loadStories`.
5. Les deux surfaces (`RootView:624`, `iPadRootView:166`) appellent `subscribeToSocketEvents` → couvertes par le même sink.

**Tests (TDD — RED d'abord).** `MeeshyTests/Unit/ViewModels/StoryViewModelTests.swift` (DI déjà en place, init l.141-146) : `test_didReconnect_fetchesStoriesDeltaFromTrayCursor` (seed de `storyGroups` avec `updatedAt` connus, `MockSocialSocket.didReconnect.send()` ⇒ `MockStoryService.list` appelé avec `updatedSince == max(updatedAt)`) ; `test_didReconnect_whileLoading_skipsFetch` (`isLoading` true ⇒ 0 appel) ; `test_didReconnect_deltaWithTombstones_purgesDeletedStories` (réponse `meta.deletedStoryIds` ⇒ story retirée du tray — réutiliser les fixtures tombstones existantes de la suite).

**Risque de régression.** Quasi nul : merge + garde monotone + purge tombstones déjà testés ; delta borné à 50 ; coalescence assurée par la garde `isLoading` (faible mais suffisante : le delta est idempotent).

**Dépendances.** aucune · **Backend requis :** non

---

### realtime-05 — `syncMissedMessages` : échec réseau silencieux sans retry, et la fenêtre de coalescence 2 s consomme le trigger même en échec · **P2** · effort S

**Constat.** Le backfill de la conversation ouverte se termine par un catch silencieux (log seulement) ; `triggerSyncIfNeeded` pose `lastSyncTriggerAt = now` AVANT le résultat de la Task — un échec dans la fenêtre de 2 s consomme donc le trigger et bloque toute nouvelle tentative immédiate ; le cap `maxTotal = 1000` est atteint sans aucun signal. Nota vérifié : `syncMissedMessages` ne route PAS le 403 (contrairement à `refreshMessagesFromAPI` qui a `handleAccessRevoked`, `ConversationViewModel.swift:1637-1643`) — le retry devra exclure `MeeshyError.forbidden`.

**Preuve.** `ConversationViewModel.swift:3765-3767` (catch terminal, `Logger.socket.error` seulement) ; `ConversationSocketHandler.swift:1136-1138` (`lastSyncTriggerAt = now` avant le résultat) ; `ConversationViewModel.swift:3709` (cap silencieux), boucle `:3719`.

**Impact.** Reconnect sur réseau flappant → le backfill de la conversation ouverte échoue en silence ; les messages manqués n'apparaissent qu'au prochain foreground/reconnect — ou jamais si l'utilisateur reste dans la conversation.

**Correctif pas-à-pas.**
1. `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift` : changer la signature du protocole `ConversationSocketDelegate` (`:45`) en `@discardableResult func syncMissedMessages() async -> Bool` ; l'implémentation du VM (`ConversationViewModel.swift:3693`) retourne `false` dans le catch, `true` sinon (y compris `collected` vide).
2. Dans `triggerSyncIfNeeded` (`:1135-1148`) : `let ok = await self?.delegate?.syncMissedMessages() ?? true ; if !ok { self?.lastSyncTriggerAt = .distantPast }` — le prochain `didReconnect`/foreground retente immédiatement.
3. Dans `syncMissedMessages` : un retry unique après `Task.sleep` 2 s, sur toute erreur qui n'est ni `CancellationError` ni `MeeshyError.forbidden`.
4. Si `collected.count >= maxTotal` : `Logger.socket.fault` + retourner `false` (traiter le cap comme un backfill incomplet).
5. Ne pas toucher `PendingStatusQueue.flush`/`OutboxFlushTrigger` dans la même Task.

**Tests (TDD — RED d'abord).** `apps/ios/MeeshyTests/Unit/ViewModels/ConversationSocketHandlerTests.swift` (suite existante) : `test_triggerSyncIfNeeded_syncFails_resetsCoalescingWindow` (mock delegate retourne `false` ; un second trigger immédiat DOIT rappeler `syncMissedMessages` — delta de compteur, pas absolu) ; `test_triggerSyncIfNeeded_syncSucceeds_coalescesWithinWindow`. `ConversationViewModelTests` : `test_syncMissedMessages_transientError_retriesOnceThenSucceeds` ; `test_syncMissedMessages_forbiddenError_doesNotRetry` ; `test_syncMissedMessages_capReached_returnsFalse`.

**Risque de régression.** Boucle de retry sur erreur permanente — bornée : 1 seul retry, exclusion explicite du 403 et de l'annulation.

**Dépendances.** aucune · **Backend requis :** non

---

### rts-03 — Statuses : événements socket jamais persistés au cache + `status:unreacted` ignoré (payload gateway à enrichir : emoji hardcodé ❤️) · **P2** · effort M (ajusté de S : le correctif vérifié ajoute un enrichissement de payload gateway + types shared + SDK — S iOS + S gateway)

**Constat.** Les 4 sinks de `StatusViewModel` (`statusCreated`, `statusDeleted`, `statusUpdated`, `statusReacted`) mutent `statuses` sans jamais appeler `saveCacheSnapshot()` (invoqué seulement par `setStatus` l.218 et `clearStatus` l.254). Aucun sink `statusUnreacted` alors que le SDK publie l'événement (`SocialSocketManager.swift:1018-1023`) et que le gateway l'émet réellement. `CacheCoordinator` possède un store `statuses` (`CacheCoordinator.swift:41`) mais aucune souscription socket ne le patche. Découverte adversariale décisive : le correctif naïf « décrément symétrique de `payload.emoji` » serait CORRUPTEUR — le `DELETE /posts/:postId/like` hardcode `emoji: '❤️'` dans `broadcastStatusUnreacted` (`interactions.ts:199-203`) alors que la réaction retirée peut être n'importe quel emoji (`reactToStatus` accepte tout, stockage max 1 réaction/utilisateur). Le résumé absolu `post.reactionSummary` est disponible au site d'émission (`interactions.ts:216`).

**Preuve.** `StatusViewModel.swift:307-351` (les 4 sinks sans persistance) ; `SocialSocketManager.swift:1018-1023` (publisher `statusUnreacted` sans sink app) ; `services/gateway/src/routes/posts/interactions.ts:199-203` (emoji hardcodé) ; chaîne d'émission : `interactions.ts:199` → `SocialEventsHandler.ts:366-368`.

**Impact.** Au restart de l'app : un statut supprimé via socket ressuscite du cache, un statut reçu via socket disparaît (jusqu'au staleTTL) ; en session, un pair qui retire sa réaction ne décrémente jamais le compteur local (dérive +N durable).

**Correctif pas-à-pas.**
1. iOS `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift` : à la fin des 4 sinks (l.307-351), ajouter `Task { await self.saveCacheSnapshot() }` (méthode async, sink synchrone).
2. `packages/shared/types/socketio-events.ts` : ajouter `readonly reactionSummary?: Record<string, number>` à `StatusReactedEventData` et `StatusUnreactedEventData` (autour de `:349`).
3. `services/gateway/src/routes/posts/interactions.ts` : poser `reactionSummary: (post.reactionSummary as Record<string, number>) ?? {}` dans les appels `broadcastStatusReacted` (l.105) et `broadcastStatusUnreacted` (l.199).
4. SDK `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift` : ajouter `public let reactionSummary: [String: Int]?` (Decodable optionnel, rétro-compatible) à `SocketStatusReactedData` (l.101-105) et `SocketStatusUnreactedData` (l.107-116).
5. iOS : ajouter le sink `statusUnreacted` ; dans les DEUX sinks reacted/unreacted, si `payload.reactionSummary != nil` → REMPLACER `statuses[index].reactionSummary` par l'absolu (idempotent, pas besoin de garde d'écho) ; fallback sans résumé : reacted garde l'incrément +1 actuel avec sa garde d'écho, unreacted = NO-OP (le payload legacy ment sur l'emoji — ne JAMAIS décrémenter dessus).
6. Optionnel : sink `socialSocket.didReconnect` → `Task { await loadStatuses() }` (miroir de rts-02).
7. Ne PAS toucher `reactToStatus` (optimisme + rollback corrects, l.356-375).
8. Ordre d'application : étapes gateway/shared/SDK (2-4) avant ou avec le sink iOS (5).

**Tests (TDD — RED d'abord).** iOS `MeeshyTests/Unit/ViewModels/StatusViewModelTests.swift` (suite et conventions en place, cf. `test_socketStatusCreated_insertsAtIndexZero` l.296) : `test_socketStatusDeleted_persistsRemovalToCache` ; `test_socketStatusCreated_persistsToCache` ; `test_socketStatusUnreacted_withAbsoluteSummary_replacesSummary` ; `test_socketStatusReacted_thenUnreacted_roundTripsSummary` ; `test_socketStatusUnreacted_withoutSummary_isNoOp`. Gateway jest : nouveau `services/gateway/src/routes/posts/__tests__/statusReactionBroadcast.test.ts` — POST puis DELETE `/posts/:id/like` sur un post de type STATUS ⇒ `broadcastStatusReacted`/`Unreacted` appelés avec un `reactionSummary` absolu non-`undefined` ; DELETE sur une réaction 🔥 ⇒ le résumé absolu reflète le retrait (pas de décrément ❤️).

**Risque de régression.** Faible : écritures cache plus fréquentes mais les statuts sont rares ; le champ ajouté au payload est optionnel donc rétro-compatible (Decodable optionnel côté SDK, clients web non concernés).

**Dépendances.** aucune (ordre interne : gateway/shared/SDK avant iOS) · **Backend requis :** oui

---

### rts-04 — `notification:read` / `notification:deleted` jamais émis par le gateway — les listeners iOS multi-device attendent un événement qui n'arrive jamais · **P2** · effort S

**Constat.** Zéro émission côté gateway : `NotificationService.markAsRead` (l.3798-3818), `markAllAsRead` (l.3823-3845) et `deleteNotification` (l.3977-4001) n'émettent que `emitCountsUpdate` → `NOTIFICATION_COUNTS` (l.3523-3530). iOS est câblé de bout en bout et attend ces événements : sinks `notificationRead`/`notificationDeleted` (`NotificationToastManager.swift:430-442`) → `handleNotificationRead`/`handleNotificationDeleted` (`:575-584`) qui patchent le cache durable et décrémentent. Les constantes (`socketio-events.ts:129-130`), les types TS (`NotificationReadEventData`/`DeletedEventData` l.687-696) et les structs Swift (`MessageSocketManager.swift:1035-1041`) existent tous déjà — il ne manque QUE l'émission.

**Preuve.** grep `NOTIFICATION_READ|NOTIFICATION_DELETED|notification:read|notification:deleted` sur `services/gateway/src` (hors types partagés) → aucun résultat d'émission.

**Impact.** Lire ou supprimer une notification sur l'appareil B ne propage à l'appareil A que le compteur : la cloche de A peut afficher 0 non-lu avec des lignes encore marquées non lues, jusqu'au prochain refetch REST.

**Correctif pas-à-pas.** *(Volet CLIENT uniquement — le volet gateway, `notification:read-bulk` inclus, vit dans la fiche canonique **gwcontract-05** (fichier 06) qui fait foi pour les émissions serveur.)*
1. iOS (mitigation propre du double décrément sur l'appareil acteur) : dans `handleNotificationRead` (`NotificationToastManager.swift:575-579`), ne décrémenter que si la ligne du cache `"all"` était encore non lue avant le patch (lecture via `loadIgnoringExpiry`, comme `hasNoKnownUnreadNotification` l.275-279) ; à défaut, accepter le transitoire — `notification:counts` est ABSOLU (`NotificationCoordinator.applyInAppNotificationCounts`, `NotificationCoordinator.swift:295-299`) et recale immédiatement.
2. Une fois gwcontract-05 livré côté gateway : vérifier le chemin iOS bout-en-bout (lecture sur l'appareil B → ligne patchée + compteur recalé sur l'appareil A) — aucun nouveau code listener n'est attendu, tout est déjà câblé.

**Tests (TDD — RED d'abord).** iOS : `MeeshyTests` `test_handleNotificationRead_rowAlreadyRead_doesNotDecrementUnread`. Les tests gateway (`NotificationService.readEvents.test.ts`) sont portés par gwcontract-05.

**Risque de régression.** Sur l'appareil acteur, double décrément (event + décrément local de `markRead`) — neutralisé par l'étape 1, et en dernier recours recalé par le `notification:counts` absolu émis juste après.

**Dépendances.** gwcontract-05 (fichier 06 — volet gateway du même chantier) · **Backend requis :** non (porté par gwcontract-05)

---

### realtime-06 — Curseur de lecture multi-device : `ReadStatusUpdateEvent.lastReadAt` jamais consommé pour avancer la frontière locale · **P3** · effort S

**Constat.** `handleReadStatusUpdated` n'applique, dans la branche « mon propre événement de lecture » (`eventUserId == userId && event.type == "read"`), que `event.unreadCount` — jamais `event.lastReadAt`, pourtant documenté « multi-device read sync, scoped to userId, apply only when strictly newer » (`MessageSocketManager.swift:393-409`). Tous les writers de `userState.lastReadAt` sont locaux (`:1327`, `:1346`, `:1548`, plus `:1361` qui l'efface) ; or `reconcileUnread` défend le non-lu via cette frontière (`:1454-1477`, comparaison `:1471`).

**Preuve.** `ConversationSyncEngine.swift:1156-1207` (`handleReadStatusUpdated`), branche `:1171-1182`.

**Impact.** L'appareil B voit le badge tomber (unreadCount autoritaire), mais sa frontière locale reste ancienne → un instantané serveur retardataire (accusé de lecture de l'appareil A encore en vol) peut rallumer transitoirement le badge au deltaSync suivant.

**Correctif pas-à-pas.**
1. `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`, `handleReadStatusUpdated`, branche `:1171-1182` : dans le même `cache.conversations.update(for: "list")`, si `let remote = event.lastReadAt` → `updated[idx].userState.lastReadAt = max(updated[idx].userState.lastReadAt ?? .distantPast, remote)`.
2. Ne JAMAIS appliquer le champ si `eventUserId != userId` (scoping documenté — déjà garanti par la branche).
3. Ne pas toucher `applyReadReceipt` ni les writers locaux.

**Tests (TDD — RED d'abord).** `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift` (suite existante, pattern des tests `reconcileUnread` `:187-278`) : `test_readStatusUpdated_ownReadEventWithLastReadAt_advancesLocalFrontier` ; `test_readStatusUpdated_staleRemoteLastReadAt_keepsNewerLocalFrontier` (out-of-order) ; `test_readStatusUpdated_otherUsersEvent_leavesLocalFrontierUntouched` ; `test_readStatusUpdated_thenStaleDeltaSnapshot_doesNotRelightBadge` (enchaîne avec `reconcileUnread`).

**Risque de régression.** Monotonie à préserver (le `max` la garantit) ; jamais d'application cross-user (la branche existante scope déjà).

**Dépendances.** aucune · **Backend requis :** non

---

### realtime-08 — Réactions temps réel pour messages hors conversation ouverte : cache volatile seulement, pas GRDB (limitation E5 documentée) · **P3** · effort M

**Constat.** Dette DOCUMENTÉE et auto-réparante : la note E5 dit explicitement « silently dropped … evaluated (approach A) but deferred » (`MessageSocketManager.swift:2668-2674`). Les handlers globaux `handleReactionAdded`/`Removed` n'écrivent que `cache.messages.upsertPatch` (`ConversationSyncEngine.swift:1086-1107`), jamais GRDB ; seul le handler de conversation ouverte persiste via `persistence.appendReaction` (`ConversationSocketHandler.swift:696-720`).

**Preuve.** Voir ci-dessus ; le refresh des 30 derniers et `loadOlderMessages` upsertent le `reactionSummary` serveur autoritaire, d'où le caractère auto-réparant.

**Impact.** Réaction posée pendant que la conversation est fermée → à la réouverture, la bulle peint depuis GRDB sans la réaction, corrigée au premier refresh (ou au scroll pour les plus vieux). Transitoire.

**Correctif pas-à-pas.** À n'implémenter QU'APRÈS realtime-01 (réutilise son pattern de hook) :
1. Ajouter au `ConversationSyncEngine` un hook `reactionPersistor: (@Sendable (_ apply: Bool, _ messageId: String, _ participantId: String?, _ emoji: String, _ maxCount: Int?) async -> Void)?` ; l'appeler depuis `handleReactionAdded` (`:1086`) avec `apply=true` et `event.aggregation?.count`, et depuis `handleReactionRemoved` (`:1101`) avec `apply=false`.
2. Câbler dans `DependencyContainer` vers `persistence.appendReaction(localId: messageId, reactionId: UUID().uuidString, messageId:, participantId:, emoji:, maxCount:)` / `removeReaction` — miroir exact du chemin conversation ouverte (`ConversationSocketHandler.swift:707-720`), y compris le cap anti-écho (garde T13 déjà dans `appendReaction`, `MessagePersistenceActor.swift:1157-1163`).
3. Mettre à jour la note E5 (`MessageSocketManager.swift:2668-2674`).
4. Ne PAS créer de store réactions dédié (l'approche A rejetée reste rejetée).

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Sync/ConversationSyncEngineTests.swift` : `test_startSocketRelay_reactionAddedEvent_invokesReactionPersistor` ; `test_startSocketRelay_reactionRemovedEvent_invokesReactionPersistorWithRemoval`. `MeeshySDKTests/Persistence` : `test_appendReaction_ownEchoAtCap_doesNotDuplicateOptimisticRow` (écho de sa propre réaction, `maxCount=1`).

**Risque de régression.** Collision avec la garde T13 des réactions optimistes en outbox — `appendReaction(maxCount:)` la gère déjà ; le test d'écho la verrouille.

**Dépendances.** realtime-01 (pattern de hook réutilisé). · **Backend requis :** non

---

### realtime-09 — Dette de nettoyage : chaîne `reaction:sync` entièrement morte (publisher sans `socket.on` ni `.send`), listener `conversation:online-stats` jamais émis, `message:pending-delivered` ignoré · **P3** · effort S

**Constat.** Il n'existe AUCUN `socket.on("reaction:sync")` dans `MessageSocketManager` — le publisher `reactionSynced` (`:1430`, protocole `:1165`) n'a aucun `.send`, donc l'abonnement du SyncEngine (`:754`) et `handleReactionSynced` (`:1109-1132`) sont du code mort à double titre ; de plus le gateway répond au `reaction:request-sync` par CALLBACK ack (`ReactionHandler.ts:310-365`), pas par un événement émis — câbler l'émission client ne nourrirait même pas ce listener. `conversation:online-stats` est écouté (`:3077`) mais jamais émis par le gateway (grep : uniquement des noms de fixtures de `StatusService.test.ts`). `message:pending-delivered` est bien émis (`MeeshySocketIOManager.ts:439`, user room après drain) mais non écouté par iOS.

**Preuve.** Voir références ci-dessus ; impact prod nul — dette d'inventaire.

**Impact.** Aucun en production ; du code mort qui brouille l'inventaire des événements et peut induire de futurs audits en erreur.

**Correctif pas-à-pas.**
1. Supprimer `reactionSynced` du protocole `MessageSocketProviding` (`:1165`), le publisher (`:1430`), l'abonnement du SyncEngine (`:754`) et `handleReactionSynced` (`:1109-1132`) ; adapter les mocks conformes au protocole dans les suites de tests.
2. Supprimer le listener `conversation:online-stats` (`:3077-3082`) + le publisher/type associés.
3. Optionnel (chantier séparé) : câbler `message:pending-delivered` comme signal de `reloadFromCache` groupé de la liste (payload count + conversationIds).
4. Laisser une note de commentaire dans `packages/shared/types/socketio-events.ts` (`REACTION_SYNC` `:138`, `PENDING_MESSAGES_DELIVERED` `:320`) indiquant l'état de consommation iOS.
5. Ne PAS supprimer les événements côté shared/gateway (le web peut les consommer).

**Tests (TDD — RED d'abord).** Pas de RED fonctionnel (suppression de code mort) : le gate est la compilation des bundles de tests (`meeshy.sh test` phase 0 SDK — les mocks du protocole doivent compiler). Si l'option 3 est retenue : RED dans `MeeshySDKTests/Sockets` — `test_pendingDelivered_event_publishesGroupedRefreshSignal` ; côté gateway la couverture existe déjà (`MeeshySocketIOManager.test.ts:1993`, `:4366`).

**Risque de régression.** Nul côté runtime (événements jamais émis/consommés) ; seul point d'attention : les mocks de test conformes au protocole.

**Dépendances.** aucune · **Backend requis :** non (uniquement une note de commentaire dans `packages/shared/types/socketio-events.ts`, aucune logique)

## Doublons rattachés

| Doublon | Canonique | Apport du doublon au canonique |
|---|---|---|
| realtime-03 (« saveSorted avale les erreurs de persistance et `lastSyncTimestamp` avance quand même ») | → voir sync-02-watermark-advances-on-failed-persist (fichier 04) | Faits re-vérifiés exacts sur le code actuel : catch avaleur `ConversationSyncEngine.swift:1423-1427`, avance inconditionnelle aux 3 sites `:314`/`:509`/`:586`. Précision décisive : le `succeeded` qui garde `:509` (fullSync) ne reflète QUE les erreurs de fetch (`:497-500`), jamais celle du save. Le seam de test existe (injecter un store conversations qui throw) et le fix « Bool + condition aux 3 sites » est applicable tel quel. |
| realtime-04 (« sessions anonymes sans reconnect socket au resume ni au retour réseau ») | → voir net-02 (fichier 06) | Faits re-vérifiés : guards `authToken` dans `resumeFromBackground` (`MessageSocketManager.swift:1666-1669`), `handleNetworkBackOnline` (`:1490-1494`) et `connect()` (`:1544`) ; `connectAnonymous` appelé uniquement depuis `ConversationViewModel:1067`. Apport : `disconnect()` (`:1633-1641`) purge déjà rooms + `hadPreviousConnection` — y ajouter la purge du `sessionToken` mémorisé pour éviter la fuite de session anonyme après fin de session. |
| rts-06 (« réactions emoji : GRDB écrit mais jamais lu, RAM/cache figés ») | → voir stores-05 (fichier 05) | Le volet « pipeline GRDB write-only, `useUIKitList=false` » (`FeedSocketHandler.swift:127-137`, `FeedView.swift:56`) est exactement le canonique stores-05. Le volet « RAM/cache figés » est RÉFUTÉ : `FeedPost` n'a AUCUN champ `reactionSummary` (`FeedModels.swift:444-530` — seuls `likes`/`isLiked` existent), le correctif d'origine était inapplicable ; les consommateurs RAM voulus existent (`post:liked` absolu `FeedViewModel.swift:1019-1045`, deltas `@State` `FeedView.swift:1136-1155`/`RootViewComponents.swift:703-724`/`PostDetailView.swift:769-788`, `StoryViewModel.applyPostReactionDelta` `:2603-2615`). Afficher des réactions riches sur les cellules feed serait une FEATURE, pas un fix de sync — à intégrer, si souhaité, dans la tranche « promouvoir ou retirer GRDB » de stores-05. |
| rts-05 (« sinks feed comment/translation sans écriture du cache « main-feed » ») | → voir stores-12 (fichier 05) | Apport : le correctif (ajout de `debouncedCacheSave()` en fin des 4 sinks, l.1115/1124/1149/1166) est compatible et idempotent avec le write-through central de stores-07 s'il arrive ensuite ; tester le SIGNAL (contenu du cache après debounce), pas l'enveloppe (nombre d'appels). |
| rts-07 (« sessions anonymes : jamais de resume socket », volet social) | → voir net-02 (fichier 06) | Apport majeur : élargir les guards de resume ne SUFFIT PAS — le blocage est à TROIS niveaux : `MeeshyApp.swift:867-868` (guard `isAuthenticated`), les guards de resume, et `connect()` lui-même (`MessageSocketManager.swift:1544`, `SocialSocketManager.swift:445-448`). Le resume invité doit ROUTER vers le chemin anonyme existant `MessageSocketManager.connectAnonymous(sessionToken:)` (l.1584-1608, header `X-Session-Token`). Le socket social n'a AUCUN chemin anonyme (`connect()` seul point d'entrée) — vraisemblablement voulu (pas de feed invité) : borner le fix au socket messages, en chemin réduit sans outbox/`syncSinceLastCheckpoint` (cf. sync-06). |

## Écartés après vérification

### realtime-07 — « `activeConversationId` n'a aucun writer app-side : le re-join "active-first" au reconnect est inerte » — RÉFUTÉ
Le writer existe, simplement indirect : `ConversationSocketHandler.activate()` (`apps/ios/.../ConversationSocketHandler.swift:158-164`) appelle `NotificationToastManager.shared.onConversationOpened(conversationId)`, qui pose `MessageSocketManager.shared.activeConversationId = conversationId` (`NotificationToastManager.swift:189-192`) ; le `deinit` du handler (branche `didActivate`, `:177-181`) appelle `onConversationClosed()` qui remet les deux champs à nil (`NotificationToastManager.swift:375-378`). `roomsToRejoinOnConnect()` (`MessageSocketManager.swift:1721-1730`) trie donc bien la conversation à l'écran en premier. Le grep du premier auditeur ne cherchait que l'assignation directe dans `apps/ios` et a raté le writer côté SDK. Résidu non-écart : `NotificationToastManager.reset()` (`:396-398`) ne nettoie que son propre champ — couvert par `disconnect()` (`:1639`) au logout.

### rts-08 — réfuté avec son canonique sync-08 (voir 04 §Écartés : le save(30) du resync reproduit le contrat steady-state de la clé "all", aucun historique paginé n'est évincé)

### Sous-affirmations réfutées, absorbées dans les fiches (pour empêcher une redécouverte)
- **« Le broadcast est room-scopé : un client connecté hors room ne reçoit rien »** (aggravant initial de realtime-01, scénario initial de realtime-02) — RÉFUTÉ : le gateway joint le socket à TOUTES les rooms de conversation actives dès l'authentification (`AuthHandler.ts:205`, `_joinUserConversations` `:510-527`, retries `:500-508`, sur les deux chemins d'auth `:79`/`:132`) ; l'ajout mid-session passe par `joinUserToConversationRoom` (`MeeshySocketIOManager.ts:2343`). Les événements ARRIVENT — le défaut réel est qu'ils ne sont pas persistés (realtime-01) ou que les cas résiduels de non-livraison ne sont pas comblés (realtime-02).
- **« Décrément symétrique de `payload.emoji` sur `status:unreacted` »** (correctif initial de rts-03) — RÉFUTÉ comme CORRUPTEUR : le gateway hardcode `emoji: '❤️'` dans `broadcastStatusUnreacted` (`interactions.ts:199-203`) alors que la réaction retirée peut être n'importe quel emoji. Ne jamais décrémenter sur ce payload legacy — passer par le `reactionSummary` absolu (fiche rts-03).

## Questions ouvertes

1. **Join de room qui échoue après 3 tentatives** (résidu de la question « broadcast room-scopé », résolue pour le reste par l'auto-join à l'auth) : un join qui échoue après les retries (loggé en error, `AuthHandler.ts:528+`) laisse un angle mort de livraison — connecté ⇒ pas de file offline, hors room ⇒ pas de broadcast. Faut-il un mécanisme de re-tentative ou une émission user-room de secours ? (décision cross-service)
2. **Décodage échoué d'un `message:new`** : le drop est logué (avec les clés du payload) mais sans rattrapage par id — un compteur/télémétrie de drops permettrait de détecter une dérive de schéma gateway avant que les utilisateurs ne la voient.
3. **`conversation:stats`** (émis au join, `ConversationHandler.ts:228`) : publisher iOS présent mais aucun consommateur app trouvé — feature abandonnée ou à venir ?
4. **Au-delà de 48 h offline** (TTL de la file de livraison = TTL de dédup client) : la liste et la fenêtre sont couvertes (fullSync + refresh à l'ouverture), le trou intérieur par realtime-02, l'absence (suppressions) par sync-01 — confirmer qu'aucun autre chemin ne dépend du rejeu de la file.
5. **`markAllAsRead` / `markContextNotificationsAsRead`** (follow-up de rts-04) : `updateMany` ne retourne pas les ids — faut-il un événement `notification:read-all` (nouveau type shared + listener iOS) pour la réconciliation par ligne multi-device ?
6. **Avenir du pipeline GRDB feed** (`FeedPersistenceActor`/`FeedStore`, `useUIKitList` resté à `false`) : promouvoir GRDB en chemin de lecture unique du feed, ou assumer `CacheCoordinator.feed` et retirer la double écriture ? Arbitrage porté par stores-05 (fichier 05).
7. **`post:bookmarked` déclaré « UI-only »** dans `FeedSocketHandler` (l.69-73) alors que `PostRecord` porte `bookmarkCount` — omission volontaire ?
8. **Mémoire projet à mettre à jour** : « delta-sync stories = ADDITIF, manque des tombstones » est PÉRIMÉE — les tombstones sont implémentés bout-en-bout (gateway `feed.ts:115` + `StoryViewModel.swift:447`).
