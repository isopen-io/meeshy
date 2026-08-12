# 01 — Cache et persistance

> Périmètre : cœur du cache SDK (`CacheCoordinator`, `GRDBCacheStore`, `DiskCacheStore`, `CacheFirstLoader`, `CachePolicy`, caches RAM annexes `FriendshipCache`/`UserDisplayNameCache`) et persistance durable SQLite (`MessagePersistenceActor`, `FeedPersistenceActor`, migrations, rétention, maintenance, points d'ancrage app `MeeshyApp`/`DependencyContainer`). Méthodologie et sévérités : voir README.md. Architecture de référence : 00-etat-des-lieux.md. HEAD audité : 901e92589.

## Rappel d'architecture

Deux bases SQLite distinctes : `meeshy.sqlite` (AppDatabase, non partagée — `cache_entries`, `translation_cache`, FTS conversations/users) et `meeshy_messages.sqlite` (App Group, partagée avec la NSE — `messages`, `outbox`, `feed_*`, `send_attempts`, FTS messages). Le `CacheCoordinator` (acteur singleton) expose 27 `GRDBCacheStore` typés (L1 dictionnaire LRU 20 clés + L2 SQLite namespacé, dirty-tracking debounce 2 s / plafond 10 s, chiffrement strict optionnel), 4 `DiskCacheStore` médias et 3 caches RAM de traduction. La discipline SWR est outillée (`CacheResult` à 4 cas, `CacheFirstLoader`, `LoadState.cachedStale`). Les écritures messages passent par `MessagePersistenceActor` (transaction unique, réconciliation optimiste à 4 clés, gardes anti-clobber outbox). Détail complet et forces : 00-etat-des-lieux.md §2.

## Écarts retenus

### grdb-01 — Tables feed (isLikedByMe) et send_attempts jamais purgées au logout — résidu cross-compte at-rest, mélange des lignes A/B, leak actif à une bascule de flag près · **P0** · effort S

**Constat.** La purge de logout `clearAllMessagesForLogout` supprime exactement 7 tables (message_translations, message_transcriptions, message_audio_translations, local_attachments, pending_ids, messages, outbox) — ni `feed_posts`/`feed_comments`/`feed_translations`, ni `send_attempts`. `FeedPersistenceActor` n'expose aucun `clearAll`, et le hook de logout du container n'appelle que la purge messages. Or `feed_posts.isLikedByMe` est un flag personnel, et la lecture feed (`fetchFeedPosts`) prend le top-N par `createdAt` sans scoping utilisateur : après logout A → login B sur le même appareil, les lignes de A restent sur disque et se mélangent à celles de B. Nuance vérifiée : aucun chemin de rendu actif aujourd'hui — le rendu UIKit de `FeedStore` est gaté par `useUIKitList=false` (FeedView.swift:56, :530) et le `@Published topLevelComments` de `CommentStore` n'est lu par aucune vue. Le P0 est maintenu au titre de l'invariant Q3 « safe-by-construction » (documenté à MessagePersistenceActor.swift:160-170) : fuite cross-compte at-rest dans le fichier App Group, activable par une seule bascule de flag.

**Preuve.** MessagePersistenceActor.swift:171-181 (7 tables purgées, feed et send_attempts absents) ; FeedPersistenceActor.swift:32-238 (aucun clearAll) ; DependencyContainer.swift:130-147 (`wireOutboxLogoutHook` n'appelle que `clearAllMessagesForLogout`) ; FeedDatabaseMigrations.swift:30 (`isLikedByMe` personnel) ; FeedStore.swift:34-38 (lecture top-N par createdAt sans scoping) ; FeedView.swift:1070-1079 et PostDetailView.swift:693-700 (chargements en mémoire actifs bien que non rendus).

**Impact.** Le feed GRDB du compte A (sélection personnalisée, flags de like, commentaires — y compris posts à visibilité restreinte) survit au logout sur le disque App Group et se mélange aux insertions du compte B. Aucun symptôme visible aujourd'hui, mais leak effectif dès que `useUIKitList` (ou tout futur lecteur) s'active — même classe de défaut que le hotfix Q3 messages, traité à l'époque en purge inconditionnelle sans attendre un lecteur.

**Correctif pas-à-pas.**
1. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift` : ajouter `public func clearAllForLogout() throws` — une transaction `try dbWriter.write { db in try db.execute(sql: "DELETE FROM feed_posts"); try db.execute(sql: "DELETE FROM feed_comments"); try db.execute(sql: "DELETE FROM feed_translations") }` puis `postFeedStoreRefresh()`, avec un commentaire miroir de la doc Q3 de `clearAllMessagesForLogout`.
2. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift:171-181` : ajouter `try db.execute(sql: "DELETE FROM send_attempts")` dans la même transaction de `clearAllMessagesForLogout`.
3. `apps/ios/Meeshy/Core/DependencyContainer.swift`, `wireOutboxLogoutHook` (:130-147) : capturer `let feed = feedPersistence` à côté de `let persistence = messagePersistence` et, dans le même Task du sink, appeler `try await feed.clearAllForLogout()` avec son propre do/catch loggé — un échec de la purge feed ne doit pas empêcher la purge messages, ni l'inverse.
4. Ne PAS toucher : FeedView/CommentStore/`useUIKitList` (périmètre de stores-05, fichier 05) ; ne pas purger la table `outbox` deux fois.

**Tests (TDD — RED d'abord).** Suite SDK `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/` : (a) nouveau `FeedPersistenceLogoutPurgeTests.swift` calqué sur `MessagePersistenceLogoutPurgeTests` (DatabaseQueue + `FeedDatabaseMigrations.runAll` + `MessageDatabaseMigrations.runAll`) : `test_clearAllForLogout_purgesFeedPostsCommentsAndTranslations` — seed 1 row par table (INSERT SQL direct), appel, COUNT=0 sur les 3 tables ; (b) étendre `MessagePersistenceLogoutPurgeTests` : ajouter `send_attempts` au tableau `tables` (:18-21) + seed d'une ligne dans `seedOneRowPerTable` — le test existant `test_clearAllMessagesForLogout_purgesEveryMessageTable` devient rouge tant que le DELETE manque ; (c) app-side (`MeeshyTests/`, phase 2) : test d'intégration du hook — container de test, bascule `isAuthenticated` true→false, attendre, tables feed vides (pattern des tests Q3 existants).

**Risque de régression.** Quasi nul : purge additive au logout, aucun chemin nominal modifié. Les tests miroirs Q3 verrouillent le périmètre exact des tables.

**Dépendances.** aucune · **Backend requis :** non

### cache-01 — flushAll ne draine que 6 stores GRDB sur 27 — l'état « lu » des notifications (seul store dirty hors périmètre aujourd'hui) peut être perdu au background/kill · **P1** · effort S

**Constat.** `CacheCoordinator.flushAll(deadline:)` n'appelle `flushDirtyKeys` que sur 6 stores (conversations, messages, participants, profiles, feed, stories). Or le store `notifications` reçoit des mutations dirty (état « lu ») depuis `NotificationToastManager`, débouncées 2 s (plafond 10 s), jamais couvertes par le flush de cycle de vie. Inventaire vérifié : `notifications` est aujourd'hui le SEUL store hors périmètre recevant des mutations dirty (les mutations messages/participants/stories sont dans le périmètre) ; comments/statuses/communities ne sont qu'une exposition future. `dirtyCountForTest` compte les 6 mêmes stores, et le BGTask de flush repasse par le même `flushAll` — aucun garde-fou ailleurs.

**Preuve.** CacheCoordinator.swift:589-604 (flushAll limité à 6 stores) ; NotificationToastManager.swift:289, :300 (`update(for: "all")`) et :541 (`prependToExisting`) ; GRDBCacheStore.swift:464-483 (debounce 2 s / cap 10 s) ; CacheCoordinator.swift:835-844 (`dirtyCountForTest` même périmètre) ; CacheBackgroundFlushTask.swift:82/:92.

**Impact.** Lire une notification puis backgrounder dans les 2 s : le Task de debounce gèle à la suspension, l'OS tue l'app, la mutation n'atteint jamais L2 — la notification repart NON LUE au prochain lancement (le symptôme que la vague précédente croyait clos côté écriture). Même exposition pour toute mutation dirty future sur les 21 stores hors périmètre.

**Correctif pas-à-pas.**
1. `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift` : déclarer un petit protocole interne au module `protocol GRDBDirtyFlushing: Sendable { func flushDirtyKeys(deadline: Date?) async; func flushDirtyKeys() async; func evictL1() async; func dirtyKeyCount() async -> Int }` et y conformer `GRDBCacheStore` — toutes les méthodes existent déjà (GRDBCacheStore.swift:325-335, :370-372, :392-403).
2. `CacheCoordinator.swift` : ajouter une computed property privée `allGRDBStores: [any GRDBDirtyFlushing]` énumérant les 27 stores en criticité décroissante : conversations, messages, notifications, feed, stories, participants, profiles, puis comments, statuses, communities, stats, drafts, callTranscripts, friends, friendRequests, blockedUsers, userSearch, callHistory, timeline, affiliateTokens, shareLinks, trackingLinks, communityLinks, categories, userTags, userPreferences, conversationPreferences.
3. Réécrire `flushAll(deadline:)` (:589-604) en boucle `for store in allGRDBStores { if let deadline, Date() >= deadline { return }; await store.flushDirtyKeys(deadline: deadline) }`, puis l'appel aux traductions — dont le sort est réglé par cache-02.
4. Réécrire `dirtyCountForTest()` (:835-844) en somme sur `allGRDBStores`.
5. Réécrire les deux boucles de `evictUnderMemoryPressure` (:606-619) sur `allGRDBStores` (`flushDirtyKeys()` puis `evictL1()`).
6. Ne PAS toucher : `reset()`/`invalidateAll()` (leurs énumérations explicites sont correctes), les timings de debounce, `markDirtyForTest`.

**Tests (TDD — RED d'abord).** Suite existante `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheBackgroundFlushTests.swift` (coordinator sur DB in-memory + `seedDirtyForTest`) : `test_flushAll_notificationsStoreDirty_drainsDirtySetToZero` (seed dirty via `coordinator.notifications.seedDirtyForTest` puis `flushAll(deadline: nil)`, assert `notifications.dirtyKeyCount() == 0` — rouge aujourd'hui) ; `test_dirtyCountForTest_notificationsStoreDirty_countsIt` (rouge aujourd'hui) ; `test_flushAll_deadlineAlreadyElapsed_leavesLaterStoresDirty` (ordre de criticité respecté) ; `test_evictUnderMemoryPressure_notificationsDirty_flushesBeforeEvicting`.

**Risque de régression.** Quasi nul : `flushDirtyKeys` est un no-op idempotent sur dirty set vide. Seul point d'attention : l'ordre de criticité sous deadline, verrouillé par le test dédié.

**Dépendances.** cache-02 (règle le sort de l'appel traductions dans flushAll) · **Backend requis :** non

### cache-02 — Memory warning puis background EFFACE la table des traductions persistées (deleteAll + réécriture d'un snapshot RAM vide) · **P1** · effort S

**Constat.** `evictUnderMemoryPressure` vide le trio RAM des traductions (`translationCache` + timestamps + ordre d'insertion). Tout passage en background appelle ensuite `flushAll` → `persistTranslationCaches()`, qui snapshotte la RAM puis exécute `try TranslationCacheRecord.deleteAll(db)` avant de ré-insérer le snapshot — désormais vide : la table est détruite. La persistance est pourtant déjà incrémentale (`cacheTranslation` → `persistTranslationIncremental`) ; le full-rewrite est un reliquat dont l'unique appelant est `flushAll` (:603) — `reset()` note même « No translation persist task to cancel — persistence is now incremental » (:377). Nuance vérifiée : une seconde persistance per-conversation existe (`TranslationRecord` écrit par ConversationSocketHandler.swift:950-975, relu par `hydrateTranslationsFromCache`) — la perte touche surtout les traductions reçues hors conversation ouverte (chemin global ConversationSyncEngine.swift:775-780), impact réel maintenu.

**Preuve.** CacheCoordinator.swift:626-630 (`translationCache.removeAll()` sous pression mémoire) ; :603 (flushAll → persistTranslationCaches) ; :662-688 (snapshot RAM puis :669 `deleteAll(db)` avant ré-insertion) ; :484 et :637-660 (persistance incrémentale déjà en place).

**Impact.** Après un simple memory warning (fréquent avec un gros feed), la mise en veille suivante détruit jusqu'à 500 messages × N langues de traductions persistées ; au cold start suivant, les bulles concernées re-sollicitent le translator (aller ZMQ + passe NLLB par message) — sur-fetch massif et affichage temporaire dans la mauvaise langue (violation du Prisme).

**Correctif pas-à-pas.**
1. `CacheCoordinator.swift:603` : supprimer l'appel `persistTranslationCaches()` de `flushAll(deadline:)`.
2. Supprimer la méthode `persistTranslationCaches` (:662-688) — elle n'a plus d'appelant (vérifié : unique site d'appel = :603).
3. Restaurer le GC que le full-rewrite assurait : dans `loadTranslationCaches` (:690-723), après le fetch filtré, ajouter `try TranslationCacheRecord.filter(Column("cachedAt") <= cutoff).deleteAll(db)` (même write que le read, ou write séparé loggé) pour borner la table à 24 h.
4. Optionnel (synchronisation exacte RAM↔table) : dans `evictTranslationCacheIfNeeded` (:502-508), supprimer aussi la row GRDB de l'id évincé (delete incrémental `filter messageId == oldest`).
5. Ne PAS toucher : `persistTranslationIncremental`, `clearTranslationCacheDB`, `invalidateTranslationCaches`.

**Tests (TDD — RED d'abord).** Suite existante `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheCoordinatorTests.swift` (coordinator + DB in-memory) : `test_flushAll_afterMemoryPressureEviction_keepsPersistedTranslationRows` (`cacheTranslation(event)` → compter les `TranslationCacheRecord` → `evictUnderMemoryPressure()` → `flushAll()` → assert le compte inchangé — rouge aujourd'hui : 0) ; `test_loadTranslationCaches_rowsOlderThanCutoff_deletedFromTable` (row backdatée > 24 h insérée à la main → `loadTranslationCaches` → row absente) ; `test_cacheTranslation_persistsIncrementallyWithoutFullRewrite` (2 messages cachés successivement → les rows du 1er survivent au persist du 2e — pin du comportement incrémental).

**Risque de régression.** Le full-rewrite était le seul GC de la table : l'étape 3 le remplace explicitement (cutoff 24 h). Le TTL de lecture (:207-215) borne déjà ce qui est servi.

**Dépendances.** aucune · **Backend requis :** non

### cache-03 — Trim suffix(maxItemCount) de save()/mergeUpdate jette les éléments les PLUS RÉCENTS des listes newest-first — le feed sert sa tranche la plus vieille en .fresh au cold start · **P1** · effort M (étape A seule : S)

**Constat.** `GRDBCacheStore.save()` et `mergeUpdate` trimment par `Array(items.suffix(max))`, alors que `prependToExisting` trime par `prefix(max)` (newest-first assumé) et que le commentaire de `update` admet « a suffix trim would drop the newest entries ». Côté app, `FeedViewModel.debouncedCacheSave` sauve le snapshot COMPLET de `posts` (newest-first, accumulé par le scroll) sur la policy `feedPosts` cap 100 : au-delà de 100 posts, `save` garde les 100 plus VIEUX. Au relaunch, la branche `.fresh` rend sans fetch. Le contournement existe déjà côté `ProfileUserPostsList.swift:553-555` (`prefix(100)` documenté) — preuve que le piège est connu et actif. Canonique du doublon stores-04 (mitigation intégrée).

**Preuve.** GRDBCacheStore.swift:66-67 (save, suffix) et :268-269 (mergeUpdate, idem) vs :300-301 (prependToExisting, prefix) et :181-183 (commentaire d'update) ; FeedViewModel.swift:1261-1269 (snapshot complet sauvé), :267/:527/:563/:677 (accumulation newest-first) et :123-127 (branche .fresh sans fetch au relaunch) ; CachePolicy.swift:79 (feedPosts maxItemCount 100).

**Impact.** Après pagination au-delà de 100 posts, kill + relaunch dans la fenêtre fraîche (5 min) : le feed rend la tranche la plus ancienne en `.fresh`, donc SANS revalidation — les posts les plus récents disparaissent de l'écran pendant plusieurs minutes. Désynchronisation visible, contraire au SWR.

**Correctif pas-à-pas.**
Étape A — mitigation immédiate (S, sans dépendance) :
1. `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift:1267` : sauver `Array(snapshot.prefix(100))` au lieu de `snapshot`, avec le même commentaire que ProfileUserPostsList.swift:553-555.

Étape B — fix SDK par policy (M) :
2. `CachePolicy.swift` : ajouter `public enum TrimDirection: Sendable { case dropHead, dropTail }` et `public let trimDirection: TrimDirection`, paramètre d'init avec défaut `.dropHead` (= suffix, comportement actuel, correct pour les messages ascendants — AUCUN call site existant à modifier grâce au défaut).
3. `GRDBCacheStore.swift:66-70` (save) et :267-270 (mergeUpdate) : `let trimmed = policy.trimDirection == .dropTail ? Array(items.prefix(max)) : Array(items.suffix(max))`.
4. `CachePolicy.swift` : passer `feedPosts` (:79), `notifications` (:90), `callHistory` (:95) en `trimDirection: .dropTail`.
5. Ne PAS toucher : `prependToExisting` (:300-302, déjà correct) ni la policy `messages` (DOIT rester dropHead).
6. Garder la mitigation app de l'étape A (elle borne aussi la taille du payload encodé). Point ouvert à trancher avec le possesseur : la policy `comments` (ordre d'affichage).

**Tests (TDD — RED d'abord).** SDK — nouvelle classe `GRDBCacheStoreTrimDirectionTests` dans `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/` (harnais in-memory de GRDBCacheStoreTests) : `test_save_dropTailPolicyOverMax_keepsFirstMaxItems` (liste sentinelle ordonnée 1…140, cap 100 → ids 1…100) ; `test_mergeUpdate_dropTailPolicy_trimsOldTail` ; pin du statu quo : `test_save_defaultDropHeadPolicy_keepsLastMaxItems`. App — `apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift` : `test_debouncedCacheSave_over100AccumulatedPosts_persistsThe100Newest` (seed 140 posts newest-first, déclencher la save, relire `CacheCoordinator.shared.feed.load(for: "main-feed")`, assert les 100 premiers ids — rouge aujourd'hui).

**Risque de régression.** Inverser le trim des messages (ordre ascendant) perdrait les plus récents — la direction DOIT rester par-policy avec défaut `.dropHead`, jamais globale ; le test pin du statu quo verrouille les policies non migrées.

**Dépendances.** aucune · **Backend requis :** non

### cache-04 — Branche .expired de CacheFirstLoader : spinner puis écran vide offline alors que le disque a la dernière donnée connue (loadIgnoringExpiry câblé dans 2 sites seulement) · **P1** · effort M

**Constat.** La branche `case .expired, .empty:` du `CacheFirstLoader` pose `.loading` puis, sur échec du fetch, `.error`/`.offline` sans jamais consulter `loadIgnoringExpiry` (la récupération best-effort de la branche `.expired` de `GRDBCacheStore`). Grep vérifié : `loadIgnoringExpiry` n'a que 2 consommateurs dans le monorepo (ConversationListViewModel.swift:1113, NotificationToastManager.swift:276). Consommateurs du loader vérifiés : RequestsViewModel (:55 et :95), DiscoverViewModel (:104), CallsViewModel (:49), BlockedViewModel (:31). Défaut bonus confirmé : `try await store.save(...)` est dans le même `do` que le fetch — un save qui throw (chiffrement) bascule l'état en `.error` alors que `apply(data)` a déjà peint l'écran. Le pattern correctif existe déjà, éprouvé : ConversationListViewModel.swift:1104-1125. Canonique du doublon vm-expired-recovery-01 (7 écrans hand-rolled, complémentaires car hors loader — intégrés au plan en suivi).

**Preuve.** CacheFirstLoader.swift:115-130 (branche fusionnée .expired/.empty, spinner puis .error/.offline, :123 save dans le do du fetch, :119-122 apply déjà exécuté) ; GRDBCacheStore.swift:144-150 (loadIgnoringExpiry existant).

**Impact.** Offline plus longtemps que le TTL (24 h requests/participants, 12 h linksAndTokens, 30 j callHistory) : Requests/Discover/Calls/Blocked affichent un spinner puis un écran vide `.offline` alors que la doctrine exige « lectures complètes offline ; skeleton seulement sur cache vide ». Et un simple échec de persistance après un fetch réussi affiche une erreur sur des données déjà rendues.

**Correctif pas-à-pas.**
1. `CacheStoreProtocols.swift` : ajouter à `MutableCacheStore` `func loadIgnoringExpiry(for key: Key) async -> (items: [Value], age: TimeInterval)?` + extension par défaut retournant `nil`. `GRDBCacheStore` (seul conformant à `MutableCacheStore` — `DiskCacheStore` n'est que `ReadableCacheStore`, vérifié DiskCacheStore.swift:6) satisfait déjà la signature exacte (GRDBCacheStore.swift:144-150).
2. `CacheFirstLoader.swift` : séparer `.expired` de `.empty`. Branche `.expired` : (a) `if let recovered = await store.loadIgnoringExpiry(for: key), !recovered.items.isEmpty` → sur MainActor `apply(recovered.items)` + `setLoadState(.cachedStale)`, puis fetch ; succès → `apply(fresh)` + `.loaded` ; échec → GARDER les items peints et `setLoadState(networkMonitor.isOnline ? .error : .offline)` ; (b) disque vide → comportement `.empty` actuel.
3. Dans les DEUX branches de succès (.expired et .empty), sortir `store.save` du `do` du fetch : do/catch dédié, échec = `Logger.cache.error` seulement, l'état reste `.loaded`.
4. Ne PAS toucher : la branche `.stale`, le contrat de `GRDBCacheStore.load` (le `.expired` sans payload reste, documenté :131-143), les 5 call sites du loader (ils bénéficient sans changement).
5. Suivi séparé (cross-référence vm-expired-recovery-01, fichier 05) : répliquer le pattern CLVM:1104-1125 dans les 7 ViewModels hand-rolled (FeedViewModel:139, PostDetailViewModel:118/:176, StatusViewModel:109, BookmarksViewModel:40, UserProfileViewModel:63, StoryViewModel:417, NotificationListView:498) — sans les forcer dans le loader.

**Tests (TDD — RED d'abord).** Suite existante `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheFirstLoaderTests.swift` (store in-memory + `debugRewindFetchTimestamp` pour backdater au-delà du ttl) : `test_load_expiredWithDiskPayloadAndFetchFailure_paintsRecoveredItemsAndSetsOffline` ; `test_load_expiredWithDiskPayloadAndFetchSuccess_appliesFreshAndSetsLoaded` ; `test_load_fetchSucceedsButSaveThrows_keepsLoadedStateAndAppliedItems` (store encrypted avec stub de chiffrement en échec — rouge aujourd'hui : `.error`). Pin : `test_load_expiredWithEmptyDisk_setsLoadingThenErrorOffline`. App : `apps/ios/MeeshyTests/Unit/ViewModels/RequestsViewModelTests.swift` : `test_loadReceived_expiredCacheAndNetworkFailure_paintsPersistedRequests`.

**Risque de régression.** Les vues qui pattern-matchent `.loading` pour un skeleton verront `.cachedStale` — c'est le comportement voulu par la doctrine. Le pin `.empty` verrouille le chemin cache réellement vide.

**Dépendances.** aucune · **Backend requis :** non

### grdb-03 — Upsert feed full-row sans garde anti-clobber outbox : un refresh REST périmé annule visiblement le like/comment optimiste · **P1** · effort M

**Constat.** `FeedPersistenceActor.insertPosts` fait `for record in records { try record.save(db) }` full-row, appelé par le refresh réseau sans consulter l'outbox. Le clobber MÉMOIRE est tout aussi réel : `posts = Self.mergePreservingRealtimeHead(fetched:existing:)` fait gagner `fetched` pour tout id présent dans la page — un like optimiste (toggle local, enqueue `.toggleLikePost`, écriture GRDB `updateLikeCount`) est écrasé par un snapshot REST qui ne contient pas encore le like. Le chemin messages possède précisément la garde manquante : `pendingOutboxMessageIds` (filtré `status == pending`), consommé par l'upsert.

**Preuve.** FeedPersistenceActor.swift:46-51 (save full-row) ; FeedViewModel.swift:187-193 et :275-281 (appel au refresh sans consulter l'outbox), :177 et :219-226 (merge mémoire où `fetched` gagne), :368-371/:386/:390-395 (chemin du like optimiste) ; MessagePersistenceActor.swift:542-573 (`pendingOutboxMessageIds`) et :1424-1438 (consommation). Violation directe de la doctrine Optimistic Updates (CLAUDE.md).

**Impact.** Like/commentaire posé offline (ou pendant un refresh en vol) : le cœur « se dé-remplit » et les compteurs régressent sous les yeux de l'utilisateur jusqu'au drain de l'outbox — en base ET à l'écran.

**Correctif pas-à-pas.**
1. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift` : dans `insertPosts`, AVANT la boucle save, répliquer le pattern `pendingOutboxMessageIds` (copier la forme de MessagePersistenceActor.swift:542-573, `status == pending` UNIQUEMENT pour rester le miroir exact de la garde messages) : requêter `OutboxRecord` `kind IN (.toggleLikePost, .createComment, .toggleLikeComment)`, décoder `ToggleLikePostPayload`/`CreateCommentPayload`/`ToggleLikeCommentPayload` (Mutations/MutationPayloads.swift:350/:364/:399) → set de postIds « protégés » + dict de commentCounts.
2. Pour chaque record dont l'id est protégé : fetch la row existante et préserver `isLikedByMe`/`likeCount`/`commentCount`/`reactionSummaryJson` avant save — ne préserver QUE ces champs, le contenu/media du serveur doit passer.
3. `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` : après `posts = Self.mergePreservingRealtimeHead(...)` (:177), ré-appliquer les flags optimistes pour les postIds à mutation pending — extraire un helper statique pur `reapplyPendingLikes(posts:pendingLikes: [String: Bool])` testable, alimenté par une nouvelle lecture nonisolated exposée par `FeedPersistenceActor` (ou par le set retourné à l'étape 1).
4. Ne PAS étendre la garde aux statuts `inflight`/`failed` (divergence avec la garde messages existante = surface de régression « compteur figé ») ; le drain d'outbox déclenche déjà le refresh qui reprend la valeur serveur.

**Tests (TDD — RED d'abord).** (a) SDK — `FeedPersistenceActorTests.swift` (suite existante) : `test_insertPosts_pendingToggleLikeInOutbox_preservesIsLikedByMeAndCounts` (seed feed_posts avec isLikedByMe=true likeCount=5, seed outbox toggleLikePost pending pour ce postId, insertPosts du même id avec isLikedByMe=false likeCount=4 → la row garde true/5) ; `test_insertPosts_noPendingMutation_takesServerValues` (outbox vide → false/4 gagne) ; `test_insertPosts_outboxDrained_serverValueWins` (row outbox status done/absente). (b) App — `FeedViewModelTests.swift` : `test_fetchFeed_pendingLike_keepsOptimisticHeart` via le helper pur `reapplyPendingLikes`. (c) Intégration existante `FeedPipelineIntegrationTests` : scénario like offline → refresh REST périmé → flag préservé → drain → valeur serveur.

**Risque de régression.** Moyen : une garde qui survivrait au drain figerait le compteur — neutralisé en limitant la garde au statut `pending` et par le test « outbox drainée → valeur serveur reprise ».

**Dépendances.** grdb-01 · **Backend requis :** non

### cache-05 — load() branche .expired L1 jette une entrée potentiellement dirty sans la flusher — mutation locale perdue · **P2** · effort S

**Constat.** La branche `.expired` de `GRDBCacheStore.load(for:)` fait `memoryCache.removeValue` + `removeFromAccessOrder` SANS `flushDirtyKeyForEviction`, contrairement à `touchKey` et `evictL1`. La clé reste dans `dirtyKeys` et `flushDirtyKeys` la jette ensuite comme fantôme (« The key lost its L1 entry… drop it from the dirty set »). Scénario vérifié : `update()` sur une entrée L1 présente ne touche pas `loadedAt` — une entrée mutée près de son seuil franchit l'expiry au load suivant dans la fenêtre de debounce 2 s → mutation jamais flushée, L2 garde la version pré-mutation.

**Preuve.** GRDBCacheStore.swift:92-94 (branche .expired sans flush) vs :442 (touchKey) et :397-399 (evictL1) ; :344-351 (drop de la clé fantôme) ; :171-177 (update ne touche pas loadedAt).

**Impact.** Une mutation locale (état lu, patch optimiste) appliquée dans la fenêtre de debounce à une entrée qui franchit son seuil d'expiration n'atteint jamais le disque : la version pré-mutation ressort au prochain démarrage. Fenêtre étroite mais silencieuse.

**Correctif pas-à-pas.**
1. `GRDBCacheStore.swift`, branche `case .expired:` de `load(for:)` (:92-94) : insérer `flushDirtyKeyForEviction(key)` AVANT `memoryCache.removeValue(forKey: key)` — même primitive que touchKey/evictL1 ; `flushKeyToL2` préserve `lastFetchedAt` (:747-754), donc le load continue de retourner `.expired` (sémantique inchangée).
2. Rien d'autre à toucher.

**Tests (TDD — RED d'abord).** Suite existante `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreEvictionFlushTests.swift` : `test_load_expiredEntryWithPendingDirtyMutation_flushesMutationToL2BeforeDropping` — `save([v1], for: k)` ; `debugRewindFetchTimestamp(by: ttl+1, for: k)` ; `update(for: k) { mutation }` ; `_ = load(for: k)` (attend `.expired`) ; assert `loadIgnoringExpiry(for: k)` contient la mutation (rouge aujourd'hui : v1 pré-mutation) et `dirtyKeyCount() == 0`. Pin : `test_load_expiredEntry_stillReturnsExpiredAfterFlush` (lastFetchedAt préservé).

**Risque de régression.** Nul — même primitive que les autres chemins d'éviction, fraîcheur préservée, verrouillée par le pin.

**Dépendances.** aucune · **Backend requis :** non

### cache-06 — Après memory warning, les traductions reçues HORS conversation ouverte deviennent inaccessibles jusqu'au cold start (RAM vidée, jamais rechargée ; repli per-conversation existant pour le reste) · **P2** · effort S

**Constat.** `evictUnderMemoryPressure` vide le trio RAM des traductions ; `cachedTranslations(for:)` ne lit que la RAM ; `loadTranslationCaches` n'est appelé qu'au `start()`. Impact ajusté à la baisse par la vérification : (a) l'unique lecteur est `ConversationViewModel.hydrateTranslationsFromCache` (call site :4034), qui possède un repli GRDB per-conversation (`TranslationRecord`, ConversationViewModel.swift:4058-4069) alimenté par le handler de la conversation OUVERTE ; (b) les payloads REST `/messages` re-livrent les traductions en ligne. La perte réelle : les traductions arrivées conversation fermée (chemin global → RAM + `TranslationCacheRecord` seulement) — offline, elles restent sur disque mais imprenables ; (c) `transcriptionCache`/`audioTranslationCache` sont hors périmètre (aucun lecteur, cf. cache-09 en section Écartés).

**Preuve.** CacheCoordinator.swift:626-630 (removeAll du trio), :203-217 (lecture RAM seule), :298 (loadTranslationCaches appelé par start() seulement) ; ConversationSocketHandler.swift:950-975 et ConversationViewModel.swift:4058-4069 (repli per-conversation) ; ConversationSyncEngine.swift:775-780 (chemin global sans repli).

**Impact.** Après un warning mémoire, les traductions reçues pendant que la conversation était fermée retombent sur le texte original (violation du Prisme) et sont re-demandées au translator, alors que la donnée est encore dans la table GRDB.

**Correctif pas-à-pas.**
1. `CacheCoordinator.evictUnderMemoryPressure` (:626-628) : NE PLUS vider `translationCache`/`translationTimestamps`/`translationInsertionOrder` — cap 500 entrées de texte, quelques centaines de Ko : le vider ne libère presque rien face aux NSCache médias de 80 Mo évincés au même endroit.
2. Laisser (ou supprimer avec le nettoyage cache-09) les `removeAll` de `transcriptionCache`/`audioTranslationCache` (:629-630) — sans lecteur, sans effet UI.
3. Alternative si l'on tient à vider : enchaîner `loadTranslationCaches()` après le removeAll — mais mesurer d'abord ; non recommandé.
4. Ne PAS ajouter de lecture lazy L2 dans `cachedTranslations` (complexité inutile une fois l'étape 1 appliquée).
5. Appliquer APRÈS cache-02 (sinon le trio conservé continue d'alimenter un full-rewrite destructeur au moindre reset partiel).

**Tests (TDD — RED d'abord).** `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheCoordinatorTests.swift` : `test_evictUnderMemoryPressure_translationCachePopulated_remainsServable` — `cacheTranslation(event)` ; `evictUnderMemoryPressure()` ; assert `cachedTranslations(for: messageId) != nil` (rouge aujourd'hui). Pin conjoint avec cache-02 : `test_memoryPressureThenFlushAll_translationTableAndRAMIntact`.

**Risque de régression.** Mémoire : le trio est borné (cap 500, éviction FIFO `evictTranslationCacheIfNeeded` conservée) — gain de l'ancienne éviction négligeable face aux caches médias.

**Dépendances.** cache-02 (à appliquer avant) ; coordination avec le nettoyage optionnel du reliquat cache-09 (voir Écartés) · **Backend requis :** non

### cache-07 — UserDisplayNameCache jamais purgé au logout — résidu cross-compte en RAM (zéro appelant de clear()) · **P2** · effort S

**Constat.** Grep monorepo vérifié : `UserDisplayNameCache.shared.clear()` n'a aucun appelant en production (la méthode existe, UserDisplayNameCache.swift:131-135). `AuthManager.logout` purge `FriendshipCache` (:490) et awaite `CacheCoordinator.reset()` (:511), mais `reset()` (CacheCoordinator.swift:334-400) ne touche pas ce cache. Sévérité maintenue P2 (et non P0) : résidu RAM uniquement (meurt au kill du process), donnée dérivée de faible sensibilité (username→displayName), exposition limitée aux rendus de mentions du compte suivant sur le même appareil.

**Preuve.** UserDisplayNameCache.swift:131-135 (clear défini, jamais appelé) ; AuthManager.swift:490 et :511 ; CacheCoordinator.swift:334-400 (reset sans ce cache).

**Impact.** Le mapping username→displayName construit depuis les conversations privées du compte A survit en RAM au logout : le compte B peut voir des display names que sa session n'a jamais chargés — fuite d'information dérivée des contacts de A, faible mais cross-compte.

**Correctif pas-à-pas.**
1. `CacheCoordinator.reset()` : ajouter `UserDisplayNameCache.shared.clear()` à côté de `await UserColorCache.shared.invalidateAll()` (CacheCoordinator.swift:375). UN SEUL site suffit : `reset()` est awaité par `AuthManager.logout` (:511) ET par le switch de compte (MeeshyApp.swift:711) — ne PAS dupliquer l'appel dans `AuthManager.logout`.
2. Rien d'autre (le cache se re-peuple opportunistement).

**Tests (TDD — RED d'abord).** `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/CacheCoordinatorLogoutPurgeTests.swift` (suite existante du reset multi-compte) : `test_reset_userDisplayNameCachePopulated_clearsAllMappings` — `UserDisplayNameCache.shared.track(username:displayName:)` ; `await coordinator.reset()` ; assert `UserDisplayNameCache.shared.displayName(for:) == nil` (rouge aujourd'hui). Attention à l'isolement : restaurer/vider le singleton en fin de test (partagé avec les autres suites — patron delta de UserDisplayNameCacheTests).

**Risque de régression.** Nul — repeuplement opportuniste à la première liste de messages/participants.

**Dépendances.** aucune · **Backend requis :** non

### cache-08 — FriendshipCache mémoire pure avec hydratation réseau uniquement — statuts d'amitié faux au cold start offline · **P2** · effort M

**Constat.** `performHydration` va directement au réseau (`friendService.sentRequests/receivedRequests`) ; sur throw, retour sans `applyHydration`, `_isHydrated` reste false ; aucun chemin de seed depuis les stores GRDB `friends`/`friendRequests` — pourtant réellement peuplés (vérifié : ContactsListViewModel.swift:103/:168 sauve `friends_list` ; RequestsViewModel.swift:55/:95 sauve `requests:received`/`requests:sent` via CacheFirstLoader). `status(for:)` rend `.none` à froid offline. Le précédent SDK existe : `FriendshipCache` référence déjà `CacheCoordinator.shared` (`invalidatePersistedFriendCaches` :351-356) — le seed est du même grain.

**Preuve.** FriendshipCache.swift:143-160 (hydratation réseau seule, échec silencieux), :74-81 (`status(for:)` → `.none` à froid) ; CacheCoordinator.swift:277-278 (stores friends/friendRequests existants).

**Impact.** Cold start offline (ou gateway KO) : boutons « Ajouter » affichés sur de vrais amis, compteurs de demandes à 0, jusqu'au retour du réseau. Violation « lectures complètes offline ».

**Correctif pas-à-pas.**
1. `FriendshipCache.swift` : ajouter un seam injectable pour les tests — `hydrate(friendService:seedSource:)` où `seedSource` est une closure async retournant `(friends: [FriendRequestUser], received: [FriendRequest], sent: [FriendRequest])?`, défaut = lecture `CacheCoordinator.shared.friends.loadIgnoringExpiry(for: PersistenceKeys.friendsList)` + `friendRequests.loadIgnoringExpiry(for: .receivedRequests / .sentRequests)` (loadIgnoringExpiry pour couvrir un offline plus long que le TTL 24 h de la policy participants).
2. Dans `performHydration`, AVANT le round-trip réseau : si `!_isHydrated` et maps vides, appeler un nouveau `applySeed(friendIds:received:sent:)` — sous lock, peuple `_friendIds` (ids du friends_list + status accepted des requests), `_sentPending`/`_receivedPending` (status pending), SANS poser `_isHydrated = true`, puis `notifyChange()` pour rafraîchir l'UI.
3. Le fetch réseau reste inchangé : succès → `applyHydration` écrase le seed ; échec → le seed reste servi, `_isHydrated = false` garantit le retry au prochain `hydrate()`.
4. Vérifier le champ id de `FriendRequestUser` au moment de l'implémentation.
5. Ne PAS toucher : `clear()`/generation counter, `invalidatePersistedFriendCaches`.

**Tests (TDD — RED d'abord).** `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/FriendshipCacheTests.swift` (suite existante, mock `FriendServiceProviding`) : `test_hydrate_serviceThrowsAndSeedSourcePopulated_servesSeededStatuses` (seedSource stub avec 1 friend + 1 pending received ; service en échec ; assert `status(for:) == .friend` / `.pendingReceived`, `pendingReceivedCount == 1` — rouge aujourd'hui : `.none`/0) ; `test_hydrate_serviceThrows_doesNotMarkHydrated` (le retry réseau reste armé) ; `test_hydrate_serviceSucceeds_networkResultOverwritesSeed` (seed puis réponse réseau divergente → statuts réseau) ; `test_hydrate_seedAfterOptimisticMutation_doesNotClobberPendingMaps`.

**Risque de régression.** Un seed périmé peut montrer un statut annulé entre-temps — neutralisé : le réseau écrase dès qu'il répond, et chaque mutation invalide déjà les stores dérivés (`invalidatePersistedFriendCaches`).

**Dépendances.** cache-04 (expose loadIgnoringExpiry au niveau protocole) · **Backend requis :** non

### grdb-02 — purgeOldMessages : rétention 6 mois = no-op silencieux (DELETE sur translation_cache inexistante dans la base messages + colonne messageId au lieu de messageLocalId, rollback total avalé par try?) · **P2** (resévérisé, était P1) · effort S

**Constat.** `purgeOldMessages` exécute `DELETE FROM translation_cache WHERE messageId IN (…)` SANS garde `tableExists` (contrairement au statement `message_translations` juste dessous) sur le pool `meeshy_messages.sqlite`, dont le migrator ne crée jamais `translation_cache` — elle n'existe que dans `meeshy.sqlite`. SQLite lève « no such table » dès que `expiredIds` est non vide → rollback de toute la transaction. Deuxième faute masquée : `WHERE messageId IN` alors que la colonne est `messageLocalId`. L'appelant `try? await retentionPersistence.purgeOldMessages()` avale tout. Aucun test ne couvre `purgeOldMessages` (grep Tests/ vide). Resévérisé P1→P2 : le rollback ne perd AUCUNE donnée et ne désynchronise rien — politique de rétention morte + croissance illimitée de la base (robustesse/efficacité), pas de la correctness de sync.

**Preuve.** MessagePersistenceActor.swift:2090-2093 (DELETE translation_cache sans garde) vs :2096 (garde tableExists sur message_translations) ; MessageDatabaseMigrations.swift:14-305 (translation_cache jamais créée dans cette base) et :91 (colonne `messageLocalId`) ; AppDatabase.swift:223-232 (translation_cache dans meeshy.sqlite) ; MeeshyApp.swift:554 (`try?` avaleur).

**Impact.** Dès qu'il existe des messages de plus de 6 mois, la purge échoue à 100 % et en silence : croissance illimitée de la base (messages, FTS, translations, pending_ids, send_attempts) ; la politique de rétention documentée n'a jamais fonctionné.

**Correctif pas-à-pas.** Dans `MessagePersistenceActor.purgeOldMessages` (:2068-2117) :
1. SUPPRIMER le statement `translation_cache` (:2088-2093) — cette table appartient à AppDatabase/CacheCoordinator (`clearTranslationCacheDB` existe déjà côté coordinator pour le logout ; la rétention du cache de traduction UI n'est pas le rôle de cet acteur).
2. Corriger `DELETE FROM message_translations WHERE messageLocalId IN (…)` (:2098) et retirer la garde `tableExists` devenue inutile (la table est toujours créée par le migrator).
3. Étendre la cascade dans la même transaction, sur les mêmes `expiredIds` : `DELETE FROM message_transcriptions WHERE messageLocalId IN`, `DELETE FROM message_audio_translations WHERE messageLocalId IN`, `DELETE FROM pending_ids WHERE localId IN`, `DELETE FROM send_attempts WHERE localId IN` (couvre le volet GC par âge de grdb-09).
4. `apps/ios/Meeshy/MeeshyApp.swift:551-560` : remplacer `try?` par do/catch avec `Logger` .error ; en profiter pour réutiliser `dependencies.messagePersistence` au lieu du 2e acteur (volet grdb-08 — si grdb-08 est traité séparément, ne faire ici que le do/catch).
5. Ne PAS toucher les triggers FTS (`msg_fts_ad` gère AFTER DELETE, migrations :241-246).

**Tests (TDD — RED d'abord).** Nouveau `MessageRetentionPurgeTests.swift` dans `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/` — c'est l'absence de test sur schéma réellement migré qui a laissé vivre le bug : DatabaseQueue + `MessageDatabaseMigrations.runAll` (PAS de schéma fabriqué à la main) ; (a) `test_purgeOldMessages_messageOlderThanRetention_deletesRowAndChildren` : seed message createdAt = −7 mois + 1 row message_translations/message_transcriptions/message_audio_translations/pending_ids/send_attempts keyées sur son localId → purge → pas de throw, COUNT=0 partout, retour == 1 — ROUGE sur le code actuel (throw « no such table ») ; (b) `test_purgeOldMessages_recentMessage_isKept` ; (c) `test_purgeOldMessages_expiredIdsEmpty_noThrow`. Vérifier via le trigger FTS que `messages_fts` ne référence plus la row purgée (SELECT COUNT sur messages_fts MATCH).

**Risque de régression.** Faible — le trigger FTS AFTER DELETE maintient l'index ; le garde-fou est précisément le test sur schéma réellement migré.

**Dépendances.** aucune — mais grdb-09 s'implémente dans la même transaction et grdb-08 doit passer APRÈS (même zone MeeshyApp:551-560) · **Backend requis :** non

### grdb-04 — updateAll sans bump changeVersion dans les réconciliateurs : refresh posté mais ignoré par le diff O(1) du MessageStore · **P2** · effort S

**Constat.** `reconcileFailedFromOutbox` et `reconcileOrphanedSendingRows` font `updateAll(db, Column("state").set(to: .failed))` sans toucher `changeVersion`, puis postent `postMessageStoreRefresh`. Or `MessageRecord ==` compare uniquement `localId + changeVersion`, et `MessageStore.refreshFromDB` skippe sur `newRecords != messages` — un state qui change sans bump est invisible au diff si la conversation est déjà en mémoire. Masquage actuel vérifié : les deux réconciliateurs tournent dans `loadMessages` AVANT `loadInitialSnapshot` et n'ont aucun autre appelant prod. `updateLayout` écrit 7 colonnes sans bump et poste un refresh — churn pur prouvé par la même égalité O(1) : ce refresh ne peut jamais publier. Contraste interne : `touchUpdatedAt` bumpe correctement — l'invariant existe déjà dans le fichier.

**Preuve.** MessagePersistenceActor.swift:437-441 et :496-499 (updateAll sans bump), :447-449/:505-507 (refresh postés), :1332-1353 (updateLayout, refresh no-op), :1312-1330 (touchUpdatedAt correct) ; MessageRecord.swift:233-237 (égalité O(1)) ; MessageStore.swift:280 (skip du diff) ; ConversationViewModel.swift:1444-1449/:1479 (masquage par l'ordre d'appel).

**Impact.** Aujourd'hui masqué par l'ordre d'appel ; tout appel futur sur une conversation déjà affichée devient un no-op UI silencieux — bulle bloquée sur l'horloge `.sending` alors que la base dit `.failed`. Invariant fragile non documenté.

**Correctif pas-à-pas.**
1. MessagePersistenceActor.swift:437-440 : `updateAll(db, Column("state").set(to: MessageState.failed.rawValue), Column("changeVersion").set(to: Column("changeVersion") + 1))` — GRDB accepte plusieurs assignments et l'expression colonne+1.
2. Idem :496-498.
3. `updateLayout` (:1332-1353) : SUPPRIMER le bloc `postMessageStoreRefresh` (:1350-1352) plutôt que bumper — bumper ferait re-render chaque bulle à chaque écriture de cache layout ; le layout est relu au prochain fetch et le refresh actuel est prouvé no-op.
4. Documenter l'invariant en commentaire au-dessus de `MessageRecord ==` (:233) : « toute écriture visible DOIT bumper changeVersion ».
5. Ne PAS toucher : `touchUpdatedAt` ni les upserts (déjà corrects).

**Tests (TDD — RED d'abord).** `MessagePersistenceActorTests.swift` (suite existante, tests réconciliateurs déjà présents :1713-1780) : (a) `test_reconcileFailedFromOutbox_flipsState_bumpsChangeVersion` — seed row `.sending` changeVersion=3 + outbox exhausted, appel, fetch → state failed ET changeVersion==4 (ROUGE aujourd'hui : reste 3) ; (b) `test_reconcileOrphanedSendingRows_orphan_bumpsChangeVersion` (même forme) ; (c) `test_updateLayout_doesNotPostRefresh` — observer `.messageStoreShouldRefresh` via expectation inversée pendant updateLayout. Vérifier qu'aucun test existant n'asserte un changeVersion figé après réconciliation (grep changeVersion dans les tests réconciliateurs).

**Risque de régression.** Faible — le bump déclenche exactement le re-render attendu ; la suppression du refresh d'updateLayout retire un no-op prouvé.

**Dépendances.** aucune · **Backend requis :** non

### grdb-05 — Vacuum/optimize au passage background hors beginBackgroundTask sur la base App Group (risque 0xdead10cc) · **P2** · effort S

**Constat.** `MeeshyApp` lance `Task.detached(priority: .background) { try DatabaseMaintenance.runIncrementalVacuum(on: pool); try DatabaseMaintenance.runOptimize(on: pool) }` au case `.background`, HORS du `BackgroundTransitionCoordinator` appelé 10 lignes plus haut. Le coordinator est le seul chemin sous `beginBackgroundTask` et termine son task id à la fin de ses steps — la Task détachée à priorité .background peut donc encore tenir une transaction d'écriture (incremental_vacuum = write lock) sur le fichier App Group partagé avec la NSE au moment de la suspension.

**Preuve.** MeeshyApp.swift:608-617 (Task.detached hors garde) ; :598 (coordinator appelé au-dessus) ; BackgroundTransitionCoordinator.swift:37-44 (beginBackgroundTask) et :95 (endBackgroundTask) ; DatabaseMaintenance.swift:60-64 (incremental_vacuum = write lock).

**Impact.** Motif documenté du kill 0xdead10cc (verrou tenu sur un conteneur partagé à la suspension) ; a minima, compaction jamais terminée sous pression.

**Correctif pas-à-pas.**
1. `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift` : ajouter en DERNIER step de `enterBackground()` (après `notifications.syncNow` :91-93, avant `endBackgroundTask` :95) : `await withBudget("db.maintenance") { let pool = DependencyContainer.shared.dbPool; do { try DatabaseMaintenance.runIncrementalVacuum(on: pool); try DatabaseMaintenance.runOptimize(on: pool) } catch { logger.error(...) } }` — dernier car c'est le step le plus sacrifiable si l'OS expire le budget.
2. `apps/ios/Meeshy/MeeshyApp.swift:606-617` : supprimer le bloc `let pool = dependencies.dbPool` + Task.detached du case `.background`.
3. Ne PAS toucher : `enableIncrementalAutoVacuumOneShot` (DependencyContainer.swift:104-118, one-shot au boot, hors scope) ni le paramètre pages=1000 (borné). Un gate sur `CallManager.shared.isCallActiveForAudioGuard` est inutile — le vacuum est indépendant du socket.

**Tests (TDD — RED d'abord).** `apps/ios/MeeshyTests/Unit/Services/BackgroundTransitionCoordinatorTests.swift` (suite existante) : (a) `test_enterBackground_runsDbMaintenanceStep` — selon le pattern de mock existant de la suite (steps mockés/observables), vérifier que le step maintenance est exécuté et QU'IL EST LE DERNIER avant endBackgroundTask ; si la suite observe via logs/hooks, injecter un spy `DatabaseWriter` et asserter qu'un write PRAGMA a eu lieu pendant enterBackground ; (b) garde de source (pattern maison SourceGuard, ancré sur le comportement, commentaires strippés — cf. tasks/lessons.md) : MeeshyApp.swift ne contient plus `runIncrementalVacuum` dans le case `.background`.

**Risque de régression.** Nul fonctionnellement ; surveiller la durée totale du background task (vacuum incrémental borné par pages=1000).

**Dépendances.** aucune · **Backend requis :** non

### grdb-06 — Save des TranslationRecord par PK id dans la transaction d'upsert : l'id fallback gateway (échec de sauvegarde → `${messageId}_${lang}_${Date.now()}`) collisionne l'index UNIQUE (messageLocalId,targetLanguage) et rollback tout le batch de messages · **P2** · effort S

**Constat.** L'index `idx_trans_msg_lang` est UNIQUE sur `(messageLocalId, targetLanguage)`, mais `try record.save(db)` upserte par PK `id` : deux ids différents pour la même paire (message, langue) → violation d'index → l'exception sort de la boucle → rollback de TOUTE la transaction `upsertFromAPIMessages`, avalé en « dropped N message(s) ». Ajustement décisif (question ouverte résolue par lecture gateway) : les ids sont nominalement STABLES — REST synthétise `${messageId}-${lang}` (translation-transformer.ts:53-56) et le chemin socket nominal retourne le même id (MessageTranslationService.ts:2930-2931). La collision réelle vient du fallback `data.translationId || data.id || \`${messageId}_${lang}_${Date.now()}\`` (MeeshySocketIOManager.ts:1352), émis quand `_saveTranslationToDatabase` échoue (erreur avalée, MessageTranslationService.ts:902-908) : iOS persiste ce record via `saveTranslation` (catch per-record), puis la retraduction réussie renvoie l'id stable en REST → PK différente, même clé métier → rollback du batch. Actif mais étroit ; P2 confirmé (fréquence faible, blast radius élevé et silencieux).

**Preuve.** MessageDatabaseMigrations.swift:100-101 (index UNIQUE) ; MessagePersistenceActor.swift:1948-1963 (save par PK dans la transaction) et :241-245 (« dropped N message(s) ») ; ConversationSocketHandler.swift:951-975 (persistance du record fallback) ; côté gateway : translation-transformer.ts:53-56, MessageTranslationService.ts:902-908 et :2930-2931, MeeshySocketIOManager.ts:1352.

**Impact.** Un batch REST/socket entier silencieusement non persisté après un échec de sauvegarde gateway préalable : messages absents au cold start suivant, désynchronisation durable jusqu'à un refresh sans collision.

**Correctif pas-à-pas.**
1. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` : extraire un helper privé `static func upsertTranslationRecord(_ record: TranslationRecord, in db: Database) throws` exécutant le SQL `INSERT INTO message_translations (id, messageLocalId, messageServerId, targetLanguage, translatedContent, translationModel, confidenceScore, sourceLanguage, receivedAt) VALUES (…) ON CONFLICT(messageLocalId, targetLanguage) DO UPDATE SET id=excluded.id, translatedContent=excluded.translatedContent, translationModel=excluded.translationModel, confidenceScore=excluded.confidenceScore, sourceLanguage=excluded.sourceLanguage, receivedAt=excluded.receivedAt` — l'ON CONFLICT cible l'index unique, pas la PK : un id divergent est réconcilié vers l'id le plus récent. Note vérifiée : le DO UPDATE réécrit `id=excluded.id` sur LA row en conflit d'index (pas d'insertion d'une seconde row), donc pas de conflit PK possible — la PK de la row conservée change.
2. Remplacer `try record.save(db)` à :1962 par ce helper.
3. Remplacer le corps de `saveTranslation` (:714-716) par le même helper.
4. NE PAS modifier le gateway dans ce lot : le fallback `Date.now()` est un écart gateway séparé — signalé dans le fichier 06, Questions ouvertes n° 8 (id fallback des traductions socket), à instruire comme fiche gateway lors de l'application ; le fix ON CONFLICT reste la bonne défense en profondeur côté client.

**Tests (TDD — RED d'abord).** `MessagePersistenceActorTests.swift` : (a) `test_saveTranslation_sameMessageAndLanguageDifferentIds_replacesWithoutThrow` — save id `m1_en_170…` puis save id `m1-en` même (m1, en) → pas de throw, 1 seule row, contenu et id = le second (ROUGE aujourd'hui : throw UNIQUE constraint) ; (b) `test_upsertFromAPIMessages_translationIdCollision_persistsWholeBatch` — seed TranslationRecord fallback-id pour (m1, en), puis `upsertFromAPIMessages` d'un batch de 2 messages dont m1 avec translations id `m1-en` → les 2 MessageRecord existent (ROUGE aujourd'hui : batch droppé) ; (c) `test_upsertFromAPIMessages_stableIds_idempotent` — deux passes du même payload → 1 row, pas de bump parasite.

**Risque de régression.** Faible — sémantique inchangée pour les ids stables (verrouillée par le test d'idempotence) ; la collision devient une mise à jour au lieu d'un rollback.

**Dépendances.** aucune · **Backend requis :** non (écart gateway du fallback à signaler séparément)

### grdb-07 — Traductions de ses propres messages non hydratées au cold start — le set de filtre de hydratePersistedTranslations n'inclut pas serverId (le keying du dict est déjà correct) · **P3** · effort S

**Constat.** Les traductions REST sont persistées sous `messageLocalId = api.id` (id SERVEUR) ; `hydratePersistedTranslations` construit son filtre avec `map(\.localId)` des MessageRecord — pour un message own réconcilié, `localId = cid_…` ≠ id serveur → aucun hit. Ajustement du correctif : la seconde moitié du fix initialement proposé (« keyer le dict par serverId ?? localId ») est inutile — le grouping se fait déjà par `translation.messageLocalId` (= id serveur) et les bulles indexent par `message.id = serverId ?? localId` (MessageRecord+ToMessage.swift:103) ; preuve par symétrie : `hydrateTranslationsFromCache` part de `message.id` et matche correctement les rows own. Seul le SET DE FILTRE doit inclure `serverId`. Impact conforme au Prisme (l'original s'affiche) — P3 confirmé.

**Preuve.** MessagePersistenceActor.swift:1948-1963 (persistance sous id serveur) ; ConversationViewModel.swift:4105-4117 (filtre sur localId seul), :4061-4069 (chemin symétrique correct) ; MessageRecord+ToMessage.swift:103 (indexation bulles).

**Impact.** La bande de drapeaux / l'exploration des langues sur ses propres messages n'apparaît qu'après le refresh REST ; le contenu affiché reste correct (l'original, conforme au Prisme).

**Correctif pas-à-pas.**
1. `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`, `hydratePersistedTranslations` (:4105-4117) : remplacer `.map(\.localId)` par une collecte des deux identifiants — fetch des records puis `let ids = records.flatMap { [$0.localId, $0.serverId].compactMap { $0 } }` — et filtrer `ids.contains(Column("messageLocalId"))`. Garder le fetch de MessageRecord complets (déjà le cas, :4106-4111) et ne changer QUE la construction du tableau.
2. Ne PAS toucher : le grouping (`Dictionary(grouping: records, by: \.messageLocalId)`, :4116) ni `hydrateTranslationsFromCache` (:4061-4069, déjà correct).
3. Ne PAS re-keyer `messageTranslations`.

**Tests (TDD — RED d'abord).** `apps/ios/MeeshyTests/Unit/ViewModels/` (phase 2, convention `test_{method}_{condition}_{expectedResult}`) : `test_hydratePersistedTranslations_ownMessageKeyedByCid_populatesDictUnderServerId` — seed GRDB en mémoire : MessageRecord(localId: "cid_abc", serverId: "srv1", conversationId: c) + TranslationRecord(messageLocalId: "srv1", targetLanguage = langue préférée du mock user) ; appeler le chemin de load du VM (ou exposer `hydratePersistedTranslations` en internal pour test) ; asserter `messageTranslations["srv1"]` non vide (ROUGE aujourd'hui : vide). Contre-test : message reçu (localId == serverId) toujours hydraté (non-régression).

**Risque de régression.** Faible — changement borné à la construction du tableau de filtre, contre-test de non-régression sur les messages reçus.

**Dépendances.** aucune · **Backend requis :** non

### grdb-08 — Code et tables morts (DBConversation/DBMessage, saveTranscription/saveAudioTranslation, feed_translations/local_attachments, MediaSnapshotStore ENTIER) + 2e MessagePersistenceActor de rétention (double worker + double GC outbox) · **P3** · effort S

**Constat.** Confirmé point par point avec un ajustement : `DBConversation`/`DBMessage` mappent des tables droppées par `v4_drop_legacy_tables`, zéro usage ; `saveTranscription`/`saveAudioTranslation` sans appelant ; `feed_translations` créée, jamais lue ni écrite ; `MeeshyApp` crée un 2e `MessagePersistenceActor` + `start()` (2e worker + 2e `purgeExhaustedOlderThan`). Ajustement : `MediaSnapshotStore` est ENTIÈREMENT mort — `save()` lui-même n'a aucun appelant, seule référence = `DependencyContainer` qui le retient — l'impact « snapshots accumulés » du premier audit était FAUX (rien n'écrit), et câbler `cleanOlderThan` câblerait du code mort ; le bon fix est la suppression. Cette ambiguïté de schéma (translation_cache vs message_translations) est la cause racine du bug grdb-02.

**Preuve.** GRDBModels.swift:4-20 et AppDatabase.swift:218-221 (tables droppées) ; MessagePersistenceActor.swift:718-724 (saveTranscription/saveAudioTranslation sans appelant) ; FeedDatabaseMigrations.swift:71-79 (feed_translations) ; MediaSnapshotStore.swift + DependencyContainer.swift:35/:75 (store entièrement mort) ; MeeshyApp.swift:551-553 (2e acteur + start()) et DependencyContainer.swift:79 (l'acteur du container est déjà démarré).

**Impact.** Poids mort et ambiguïté de schéma pour les prochains contributeurs (cause racine avérée de grdb-02) ; double worker et double GC outbox inutiles à chaque boot.

**Correctif pas-à-pas.**
1. Supprimer `packages/MeeshySDK/Sources/MeeshySDK/Persistence/GRDBModels.swift` (GRDBModelsTests ne teste que CacheEntry — vérifier qu'il compile, retirer toute référence si import direct).
2. Supprimer `saveTranscription`/`saveAudioTranslation` (MessagePersistenceActor.swift:718-724) ; CONSERVER `TranscriptionRecord`/`AudioTranslationRecord` (TranslationRecords.swift) tant que les tables existent (la purge logout référence les noms via SQL, pas les types).
3. Supprimer `MediaSnapshotStore.swift` + la propriété `mediaSnapshotStore` du `DependencyContainer` (:35, :75).
4. `apps/ios/Meeshy/MeeshyApp.swift:551-553` : remplacer `let retentionPersistence = MessagePersistenceActor(dbWriter: dependencies.dbPool)` + `start()` par `let retentionPersistence = dependencies.messagePersistence` SANS `start()` (déjà démarré par le container).
5. Ne PAS dropper les tables mortes en migration dans ce lot (migrations append-only, risque nul à les laisser) et ne PAS toucher `local_attachments` (purgée au logout, testée par MessagePersistenceLogoutPurgeTests).
6. Ordonner APRÈS grdb-02 (qui édite la même zone MeeshyApp:551-560).

**Tests (TDD — RED d'abord).** Pas de RED fonctionnel possible sur du code sans appelant — gate = compilation + suites vertes : `./apps/ios/meeshy.sh test` (phases 0-3) et `xcodebuild test` MeeshySDK-Package. Ajouter UN test de comportement pour l'étape 4 : `test_retentionPurge_usesSharedPersistenceActor` — asserter qu'un seul `purgeExhaustedOlderThan` tourne par boot (compteur en delta sur les rows exhausted GC, jamais en absolu) ; à défaut, garde de source ancrée sur le comportement (commentaires strippés) : MeeshyApp.swift ne contient plus `MessagePersistenceActor(dbWriter:`.

**Risque de régression.** Nul (code sans appelant) — garde : compilation + suites SDK/app vertes.

**Dépendances.** grdb-02 · **Backend requis :** non

### grdb-09 — pending_ids et send_attempts sans GC ; deleteAll(conversationId:) laisse des orphelins (403) · **P3** · effort S

**Constat.** Chaque message reçu insère un `PendingIdRecord` ; les seuls DELETE existants sont ceux de `clearAllMessagesForLogout` — ni `purgeOldMessages` (ne touche ni pending_ids ni send_attempts) ni aucun autre chemin ne les GC. `deleteAll(conversationId:)` (chemin 403, accès révoqué) ne supprime que `MessageRecord`, laissant translations/transcriptions/audio/pending_ids/send_attempts de la conversation révoquée.

**Preuve.** MessagePersistenceActor.swift:1936-1943 (insertion PendingIdRecord), :177 (unique DELETE, au logout), :2068-2117 (purgeOldMessages sans ces tables), :1973-1985 (deleteAll partiel).

**Impact.** Croissance illimitée de lignes mortes (une par message reçu) + résidus par conversation révoquée. Pas de fuite rendue, volume seulement.

**Correctif pas-à-pas.** S'implémente AVEC grdb-02 (même fonction, même transaction) :
1. Le volet « GC par âge » est couvert par l'étape 3 du correctif de grdb-02 (pending_ids + send_attempts dans la cascade de `purgeOldMessages`).
2. Étendre `deleteAll(conversationId:)` (:1973-1985) : dans la même transaction write, collecter `let ids = try String.fetchAll(db, sql: "SELECT localId FROM messages WHERE conversationId = ?")` AVANT le deleteAll, puis `DELETE FROM message_translations/message_transcriptions/message_audio_translations WHERE messageLocalId IN ids`, `DELETE FROM pending_ids WHERE conversationId = ?` (la table a une colonne conversationId, MessageDatabaseMigrations.swift:79-86 — préférer ce filtre, plus simple et complet), `DELETE FROM send_attempts WHERE localId IN ids`.
3. Ne pas poster de refresh supplémentaire (celui existant :1984 suffit).

**Tests (TDD — RED d'abord).** Même suite que grdb-02 (`MessageRetentionPurgeTests`) + `MessagePersistenceActorTests` : (a) `test_deleteAll_conversationRevoked_removesChildRows` — seed message m1 (conv c1) + 1 row par table enfant keyée m1, + message m2 (conv c2) avec ses enfants ; `deleteAll(conversationId: c1)` → tables enfants vides pour m1, intactes pour m2 (ROUGE aujourd'hui : les enfants de m1 survivent) ; (b) le test cascade de grdb-02 couvre le volet âge.

**Risque de régression.** Nul — suppression de lignes orphelines uniquement, isolement inter-conversations verrouillé par le test m2.

**Dépendances.** grdb-02 · **Backend requis :** non

### grdb-10 — cachedTimeString persisté figé (fuseau/locale du moment de l'écriture, format 24 h forcé) · **P3** · effort M

**Constat.** `TimeStringCache` est un singleton process-lifetime avec un DateFormatter `dateFormat = "HH:mm"` + `locale = Locale.current` figés à l'init (le timeZone aussi). La chaîne formatée est PERSISTÉE en colonne `cachedTimeString` (backfill de migration + `computeTimeString` à chaque upsert) puis servie telle quelle par `toMessage`. Conséquences vérifiées : (a) changement de fuseau → toutes les bulles servies du cache affichent l'heure de l'ancien fuseau jusqu'à réécriture row par row ; (b) format figé « HH:mm » → le réglage 12/24 h de l'utilisateur n'est jamais respecté (ni en écriture ni au backfill `strftime('%H:%M')`).

**Preuve.** MessageRecord.swift:214-230 (formatter figé) ; MessageDatabaseMigrations.swift:198-211 (backfill migration) ; MessageRecord+ToMessage.swift:143 (colonne servie telle quelle).

**Impact.** Heures fausses sur toutes les bulles servies du cache après un voyage (changement de fuseau) ; préférence 12 h jamais respectée. Affichage uniquement, aucun impact données.

**Correctif pas-à-pas.**
1. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift` : dans `TimeStringCache`, ajouter `func rebuild()` qui recrée le formatter sous lock (et, si le 12 h doit être honoré, dériver le format via `DateFormatter.dateFormat(fromTemplate: "j:mm", options: 0, locale: .current)` — décision produit à trancher : le backfill SQL strftime restera 24 h, donc si le 12 h est retenu, backfiller via Swift plutôt que SQL).
2. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` : ajouter `public func refreshCachedTimeStrings() async throws` exécutant `UPDATE messages SET cachedTimeString = strftime('%H:%M', createdAt, 'localtime'), changeVersion = changeVersion + 1` puis `postMessageStoreRefresh` sur les conversations affectées (ou sans scope : re-render global ponctuel acceptable, événement rare).
3. Côté app (orchestration = app, pas SDK) : dans MeeshyApp ou un service dédié, observer `NSSystemTimeZoneDidChange` + `NSCurrentLocaleDidChange` → `TimeStringCache.shared.rebuild()` + `Task { try await dependencies.messagePersistence.refreshCachedTimeStrings() }`.
4. Ne PAS toucher la migration existante (append-only).

**Tests (TDD — RED d'abord).** (a) SDK — `MessageTimestampPrecomputeTests.swift` (suite existante) : `test_refreshCachedTimeStrings_rewritesColumnAndBumpsChangeVersion` — seed row avec cachedTimeString figé faux ('99:99'), appel, fetch → colonne == sortie strftime localtime ET changeVersion+1 (ROUGE : méthode absente) ; (b) `test_backfillSQL_matchesFormatterOutput` — parité strftime vs TimeStringCache sur une date fixe RELATIVE (jamais de date absolue en fixture) en forçant le TimeZone du formatter ; (c) app — test d'observation : poster `NSSystemTimeZoneDidChange` → vérifier l'appel `refreshCachedTimeStrings` via mock `{ServiceName}Providing` (delta de call count).

**Risque de régression.** Re-render global ponctuel sur un événement rare — acceptable ; la parité backfill/formatter est verrouillée par le test (b).

**Dépendances.** aucune · **Backend requis :** non

## Doublons rattachés

| Doublon | Canonique | Ce que le doublon a apporté au canonique |
|---|---|---|
| stores-04 (fichier 05) | → cache-03 (ce fichier) | La mitigation immédiate app-side : sauver `Array(snapshot.prefix(100))` dans `FeedViewModel.debouncedCacheSave`, patron déjà appliqué et documenté par `ProfileUserPostsList.swift:553-555`. Intégrée comme étape A du correctif de cache-03 — appliquer LES DEUX (mitigation app + fix SDK par policy). |
| vm-expired-recovery-01 (fichier 05) | → cache-04 (ce fichier) | Le périmètre complémentaire des 7 écrans qui font le switch `.expired` à la main HORS `CacheFirstLoader` et jettent aussi la donnée disque : FeedViewModel:139, PostDetailViewModel:118/:176, StatusViewModel:109, BookmarksViewModel:40, UserProfileViewModel:63, StoryViewModel:417, NotificationListView:498. Repris comme suivi séparé (étape 5 de cache-04) — même pattern CLVM:1104-1125, sans les forcer dans le loader. |
| stores-05 (fichier 05) — chevauchement partiel, pas un doublon | → grdb-01 (ce fichier) | Le point 1 du fix de stores-05 décrit la même purge feed au logout : elle s'implémente UNE seule fois, ICI (grdb-01) ; stores-05 conserve la décision distincte « pipeline GRDB feed mort / useUIKitList ». Ne pas implémenter deux fois. |
| cache-10 (ce fichier) — déclassé d'« Écart retenu » en doublon | → media-03 + media-04 (fichier 09, canoniques) | Trois apports intégrés aux fiches canoniques : (1) l'URLCache par défaut de `URLSession.shared` duplique les octets média sur disque à côté du store SHA256 — la session injectée doit avoir `urlCache = nil` ; (2) le contrat `Task<Data,Error>` des awaiters est préservable sans pic mémoire via `Data(contentsOf:options:.mappedIfSafe)` ; (3) les prefetchers comptent comme awaiters (priorité `.utility`) — c'est leur annulation qui doit libérer le transfert. La prescription qui fait foi sur `DiskCacheStore.networkData` est celle de media-03/net-03 (fichiers 09 et 06) : injection de la `transferSession` PINNÉE d'APIClient avec `urlCache = nil` — pas de session statique `URLSessionConfiguration.ephemeral` propre à `DiskCacheStore`. |

## Écartés après vérification

### cache-09 — « Transcriptions et traductions audio jamais persistées (RAM seule) — perdues à chaque restart, re-fetch du pipeline le plus coûteux »
Réfuté sur les deux points d'impact : (1) la persistance durable existe déjà ailleurs — transcription et audios traduits vivent dans `MessageRecord.attachmentsJson`, rechargés offline par `ConversationViewModel.hydrateMetadataFromGRDB` (ConversationViewModel.swift:4384-4462) et re-livrés par REST `/messages` — ni perte au restart sur les surfaces produit, ni re-sollicitation Whisper/TTS ; (2) les caches RAM incriminés sont write-only : `cachedTranscription(for:)`/`cachedAudioTranslations(for:)` n'ont AUCUN appelant en production (seuls écrivains : ConversationSyncEngine.swift:785-806). Persister ces caches durabiliserait un chemin de lecture mort. Le correctif initialement proposé (étendre `TranslationCacheRecord`) ne doit PAS être appliqué. Reliquat P3 optionnel (dead code) : supprimer le trio caches/accesseurs/écrivains (CacheCoordinator.swift:197-200, :229-235, :487-500 ; ConversationSyncEngine.swift:782-807), retirer les removeAll correspondants et corriger le log mensonger :717 — à coordonner avec cache-06.

### cache-11 — « DiskCacheStore.load L1 : âge par défaut 0 (`?? Date()`) fabrique un .fresh éternel quand le miroir fileTimestamps manque »
Réfuté comme bug actif : la condition « hit NSCache sans miroir fileTimestamps » est inatteignable aujourd'hui — chaque `memoryCache.setObject` est apparié à une écriture du miroir dans le même scope actor-isolé (DiskCacheStore.swift:108-109, :113-114, :158-159) et chaque chemin de retrait retire LES DEUX (invalidate :124-125, invalidateAll :135-136, evictExpired :473-474, evictOverBudget :508-510, purge :858-860, purgeUnattributed :891-892). Le seul déséquilibre possible est l'inverse (NSCache évincé par le système → miroir orphelin), inoffensif. Aucun `.fresh` fabriqué n'est observable. Reliquat P3 optionnel (durcissement contre de futurs chemins d'écriture) : remplacer le `?? Date()` (:74) par un repli vers la branche disque (mtime + re-seed du miroir), avec seam `@testable` si implémenté.

## Questions ouvertes

1. `flushAll` séquence une transaction GRDB par clé et par store — un batch par store (une transaction pour toutes ses clés dirty) réduirait le coût du drain au background ; trade-off contention/latence à mesurer avant de changer (pertinence accrue une fois cache-01 appliqué : 27 stores drainés au lieu de 6).
2. Politique `.expired` des stores DISQUE : un média expiré (6 mois sans accès) encore présent sur disque est retourné `.expired` puis re-téléchargé alors que l'URL est immuable — servir le fichier et re-toucher le mtime serait plus local-first. Choix volontaire ?
3. L'ordre des items (ascendant messages vs newest-first feed) reste un contrat implicite entre ViewModels et primitives de trim — cache-03 le déclare dans `CachePolicy` pour feed/notifications/callHistory, mais la direction de la policy `comments` (ordre d'affichage) reste à trancher avec son possesseur.
4. `resolveCurrentUserId` est async (hop MainActor, CacheCoordinator.swift:402-408) : un `post:liked` de l'utilisateur courant reçu avant la résolution n'allume pas `isLiked` — fenêtre de boot de quelques ms, acceptable ?
5. Budget RAM réel des 4 NSCache L1 Data de 80 Mo chacun (DiskCacheStore.swift:50-52) en plus des caches image statiques configurés par `configureImageMemory` — audit mémoire dédié souhaitable.
6. `useUIKitList` (FeedView.swift:56, défaut false) : la liste UIKit pilotée par FeedStore/GRDB est-elle destinée à être activée ? Si oui, l'exposition de grdb-01 et grdb-03 monte d'un cran (le résidu at-rest devient un rendu effectif).
7. `AppDatabase` (meeshy.sqlite) reste hors App Group : assumé (la NSE n'enrichit pas cache_entries/translation_cache) ou dette pour les widgets et l'extension de partage ?
8. La rétention 6 mois doit-elle aussi couvrir `feed_posts`/`feed_comments` ? Aucune éviction feed par âge aujourd'hui — le logout est couvert par grdb-01, mais pas la croissance en usage continu.
