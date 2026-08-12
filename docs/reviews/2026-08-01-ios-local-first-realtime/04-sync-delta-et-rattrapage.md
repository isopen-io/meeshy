# 04 — Moteur de sync : delta, watermarks, tombstones, rattrapage de gaps

> Périmètre : `ConversationSyncEngine` (fullSync/delta/watermarks), `SyncWatermark`, `SyncSeqState`/`SyncSeqTracker`, rattrapage de messages (`syncMissedMessages`), resync notifications, endpoint gateway `GET /sync`, déclencheurs de sync au cycle de vie. Méthodologie et sévérités : voir README.md. Architecture de référence : 00-etat-des-lieux.md (§5). HEAD audité : 901e92589.

## Rappel d'architecture

Le moteur est centré sur `ConversationSyncEngine` (singleton SDK) : `fullSync` paginé qui REMPLACE la clé cache `"list"` (première page peinte ~300 ms, fan-out borné à 4), `deltaSyncCore` `GET /conversations?updatedSince=` (merge upsert, retrait des `isActive:false`), réconciliation complète chaînée toutes les 24 h pour les hard-deletes. Les watermarks (`me.meeshy.lastSyncTimestamp` et associés, UserDefaults) sont dérivés du temps SERVEUR via `SyncWatermark`. Le rattrapage de messages est per-conversation-OUVERTE uniquement (`syncMissedMessages`, forward-paging `?after=`, cap 1000). Le séquencement exact `_seq` (SyncSeqTracker) est un pilote câblé sur le seul event `notification:new`, en mémoire d'actor. Fait majeur : le gateway expose déjà `GET /sync` avec tombstones messages (added/modified/deleted, curseur keyset, ETag) — et le client iOS ne l'appelle nulle part. Couverture par entité, forces et acquis de juin : voir 00-etat-des-lieux.md §5 et §8.

## Écarts retenus

### sync-01-message-tombstones-unused-sync-endpoint — Suppressions/éditions de messages jamais réconciliées hors-ligne : l'endpoint gateway /sync (tombstones) n'a aucun client iOS · **P1** · effort L

**Constat.** Le gateway livre déjà un flux de réconciliation complet pour les messages — `GET /sync` retourne `added`/`modified`/`deleted` par watermark avec curseur keyset — mais aucun code iOS ne l'appelle. Côté client, tous les merges de messages sont additifs : une suppression (« supprimer pour tous ») ou une édition survenue pendant que le device était déconnecté n'est jamais rattrapée. Le REST de liste filtre `deletedAt: null`, donc le fantôme local n'est jamais contredit par une lecture ultérieure. Sévérité rétrogradée P0 → P1 par la passe adversariale : selon la grille, c'est de la correctness de sync avec aggravateur confidentialité (rétention locale de contenu volontairement retiré), pas une perte de données ni une fuite cross-compte.

**Preuve.**
- `services/gateway/src/routes/sync.ts:26` — `const SUPPORTED_COLLECTIONS = ['messages']` ; `syncMessages` (:184-283) livre added/modified/deleted avec curseur keyset (updatedAt,id)/(deletedAt,id). Endpoint LIVE : `services/gateway/src/route-registration.ts:203` (préfixe `/api/v1`).
- grep `hasGap|"/sync"` dans `apps/ios` + `packages/MeeshySDK` = 0 résultat.
- Merges tous additifs : `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:642-645` (`let fromCacheOnly = existing.filter { !freshIds.contains($0.id) }; return (freshMessages + fromCacheOnly)`) ; `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1632-1636` (idem) ; `syncMissedMessages` ne page que `createdAt > after` (:3719-3722).
- `services/gateway/src/routes/conversations/messages.ts:605-608` — le list filtre `deletedAt: null`, le fantôme n'est jamais contredit (la référence `routes/messages.ts:111` désigne le GET unitaire, cf. realtime-01, fichier 03).
- Seam de persistance déjà disponible : `MessagePersistenceActor.markDeleted(localId:deletedAt:)` (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift:837`), dont le SQL matche localId OU serverId.

**Impact.** Un message supprimé ou édité pendant une déconnexion de ce device reste affiché à vie dans sa version d'origine (seul le retention cleanup 1 an/600 le fera partir). Désync visible persistante entre devices + enjeu de confidentialité : du contenu retiré « pour tous » continue d'exister localement. Les éditions hors du top-30 ne sont jamais rattrapées non plus.

**Correctif pas-à-pas.**
1. PRÉ-REQUIS : appliquer d'abord realtime-01 (fichier 03) — le hook `messageDeletionPersistor` sur `ConversationSyncEngine`, câblé dans `apps/ios/Meeshy/Core/DependencyContainer.swift` à côté du câblage `apiMessagePersistor` (:96), vers `MessagePersistenceActor.markDeleted(localId:deletedAt:)` (API déjà existante, `MessagePersistenceActor.swift:837`).
2. Ajouter les modèles `Codable` de réponse /sync dans `packages/MeeshySDK/Sources/MeeshySDK/Models/` : `SyncDeltaResponse` avec `checkpoint`, `checkpointSeq`, `collections.messages.{added[], modified[], deleted[]: {id, conversationId, deletedAt}}`, `hasMore`, `nextCursor`, `hasGap` — les modèles vont au SDK (règle CLAUDE.md apps/ios).
3. Créer `apps/ios/Meeshy/Features/Main/Services/MessageDeltaSyncService.swift` (app-side, SDK purity) : boucle `GET /sync?since=<checkpoint>&collections=messages&cursor=<nextCursor>&limit=500` tant que `hasMore`. Le paramètre `since` doit être un ISO8601 AVEC offset (le schéma gateway est `z.string().datetime({offset:true})`, `sync.ts:64`). NE PAS envoyer `seq` (paramètre optionnel — attendre sync-05).
4. Appliquer `deleted[]` : `CacheCoordinator.shared.messages.upsertPatch(for: conversationId, itemId: id) { $0.deletedAt = …; $0.content = "" }` (même transformation que `handleDeletedMessage`, `ConversationSyncEngine.swift:1000-1017`) + hook `messageDeletionPersistor` pour GRDB. Idempotent : re-marquer un message déjà supprimé = no-op.
5. Appliquer `modified[]`/`added[]` : refetch ciblé des conversations touchées via `messageService` (les payloads /sync ne portent pas les attachments) OU `upsertFromAPIMessages` si le contenu seul suffit.
6. Persister le checkpoint retourné dans UserDefaults `me.meeshy.messageSyncCheckpoint.<userId>` — avancé UNIQUEMENT après application intégrale réussie de toutes les pages (leçon sync-02). Premier run : seed depuis le watermark messages le plus ancien raisonnable (ex. now-30 j) pour borner le backfill.
7. Déclencheurs : `messageSocket.didReconnect`, `BackgroundTransitionCoordinator.resumeFromBackground` (à côté de `sync.conversations`, :131-133), BGAppRefreshTask (`BackgroundTaskManager`) — avec cooldown local de 3 s.
8. Ne PAS toucher : `syncMissedMessages` (rattrapage per-conversation-ouverte), `handleDeletedMessage` (chemin socket live), `GAP_THRESHOLD` gateway.

Contrat gateway associé : le /sync et les tombstones messages côté serveur sont suivis dans le fichier 06 (gwcontract-02/03) — le présent correctif consomme l'endpoint tel qu'il existe déjà, rien à écrire côté gateway.

**Tests (TDD — RED d'abord).** Nouvelle suite `MeeshyTests/Unit/Services/MessageDeltaSyncServiceTests.swift` (MockAPIClient injecté, convention makeSUT) :
- `test_sync_deletedTombstone_marksCachedMessageDeleted`
- `test_sync_deletedTombstone_invokesDeletionPersistor_withServerIds`
- `test_sync_multiPage_followsNextCursorUntilHasMoreFalse`
- `test_sync_applyFails_doesNotAdvanceCheckpoint`
- `test_sync_deletedTombstone_alreadyDeleted_isNoOp`
- `test_sync_firstRun_seedsCheckpointWithoutFullHistoryFetch`

Fixtures à dates RELATIVES (les dates absolues pourrissent). Côté gateway, rien à écrire (endpoint déjà testé) ; option : un test de contrat jest sur la forme exacte du payload consommé par les modèles Swift.

**Risque de régression.** Moyen : appliquer un tombstone à une bulle actuellement à l'écran doit produire le même rendu que le chemin existant `handleDeletedMessage`/`message:deleted` (déjà testé) pour ne pas casser l'UI ouverte. Neutraliser par les tests unitaires du service (fixtures added/modified/deleted + curseur multi-pages) et par l'idempotence des tombstones.

**Dépendances.** realtime-01 (fichier 03) ; sync-02-watermark-advances-on-failed-persist ; sync-05-seq-coverage-single-event-not-persisted (optionnel, pour le paramètre `seq`/`hasGap` uniquement). · **Backend requis :** non

---

### sync-02-watermark-advances-on-failed-persist — R3 confirmé : le watermark delta avance même quand le persist GRDB a échoué — updates perdues silencieusement · **P1** · effort S

**Constat.** `saveSorted` avale toute erreur d'écriture GRDB dans un `catch` qui se contente de logger ; ni `deltaSyncCore` ni `fullSync` ne savent que la persistance a échoué, et les watermarks avancent quand même. La vérification adversariale a validé le mécanisme en profondeur : `GRDBCacheStore.save` écrit L2 SYNCHRONEMENT avant L1 (`try writeToL2`, `GRDBCacheStore.swift:64-79`), donc l'échec GRDB jette bien au call-site — un retour `Bool` de `saveSorted` capture réellement l'échec de persistance. Les doublons absorbés (realtime-03, stores-11, vm-r3-savesorted-01) ont révélé un troisième site de watermark oublié par la fiche d'origine : l'early-return de `fullSync` (:314-315).

**Preuve.**
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:1423-1427` — `do { try await cache.conversations.save(sorted, for: cacheKey) } catch { Logger.cache.error(…) }` : fonction Void, erreur avalée.
- `:586` — `deltaSyncCore` enchaîne `lastSyncTimestamp = SyncWatermark.advanced(...)` inconditionnellement.
- `:509-510` — `fullSync` pose `lastSyncTimestamp`/`lastFullReconcileAt` ; `succeeded` ne trace que les échecs de FETCH (:497-500).
- `:314-315` — troisième site : l'early-return single-page de `fullSync` pose aussi les deux watermarks après le `saveSorted` de :300.
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift:64-79` — écriture L2 synchrone : l'échec jette bien au call-site.

**Impact.** Si l'écriture GRDB échoue (disque plein, DB corrompue), les conversations du delta sont perdues localement mais le curseur `updatedSince` a avancé : le prochain delta ne les redemandera JAMAIS. Liste périmée jusqu'au reconcile 24 h — et le même bug y avance `lastFullReconcileAt`, auto-confirmant la dérive (motif « purge avalée auto-confirmée » déjà vu en prod gateway).

**Correctif pas-à-pas.**
1. `ConversationSyncEngine.swift` : `saveSorted` (:1397-1431) retourne `@discardableResult Bool` — `true` si le `try await cache.conversations.save` réussit. Garder le log et le passer en `.fault` (diagnosticable).
2. `deltaSyncCore` : `let saved = await saveSorted(merged, to: "list", baseline: existing)` (:578) ; n'exécuter `lastSyncTimestamp = SyncWatermark.advanced(...)` (:586) que si `saved` ; `return saved`.
3. `fullSync`, early-return : capturer le Bool du `saveSorted` de :300 ; si `false`, `return false` AVANT :314-315 (ne poser ni `lastSyncTimestamp` ni `lastFullReconcileAt`).
4. `fullSync`, corps : accumuler `persistOK` sur :436 et chaque itération du tail :467 ; `succeeded = succeeded && persistOK` avant le bloc :507-511.
5. Ne PAS toucher : `reconcileUnread`, `recomputeTotalUnread`, le cooldown delta, les appelants publics (signatures inchangées).

**Tests (TDD — RED d'abord).** Suite existante `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineTests.swift` (le seam est déjà en place : `CacheCoordinator(messageSocket:socialSocket:db:)`, ligne 51) :
- `test_syncSinceLastCheckpoint_persistFails_doesNotAdvanceWatermark` (DatabaseQueue fermée/read-only après seed pour faire jeter `save` ; lire UserDefaults `me.meeshy.lastSyncTimestamp` avant/après)
- `test_fullSync_persistFails_returnsFalse_andKeepsFullReconcileDue`
- `test_fullSync_singlePageEarlyReturn_persistFails_doesNotSetWatermark`

Nettoyer les clés UserDefaults en fin de test (résidus inter-suites — motif des tests :189/:334 existants).

**Risque de régression.** Faible : changement de signature privé au fichier. Risque résiduel : un échec de save répété bloque le curseur et fait re-télécharger le même delta en boucle — acceptable (cooldown 3 s) et préférable à la perte ; le log `.fault` le rend diagnosticable.

**Dépendances.** aucune · **Backend requis :** non

---

### sync-03-fullsync-destructive-partial-replace — fullSync remplace la liste en cache par un état partiel AVANT d'avoir toutes les pages — un échec ou un kill tronque le cache local · **P1** · effort M

**Constat.** Les trois écritures intermédiaires de `fullSync` remplacent la clé cache `"list"` entière par l'état partiel courant (page 1 seule, puis merges partiels). Si la queue de pages échoue en route (`catch { succeeded = false; break }`), le partiel reste persisté. Nuance vérifiée : sur échec les watermarks ne sont pas posés, donc `isFullReconcileDue` reste vrai et le prochain delta réussi re-chaîne un fullSync — la fenêtre de troncature dure jusqu'au prochain fullSync réussi, c'est-à-dire tant que l'utilisateur reste offline ou que les fullSync échouent : exactement le scénario visé par Offline Graceful Degradation → P1 maintenu.

**Preuve.**
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:300` — `await saveSorted(firstPage, to: "list", baseline: baseline)` remplace TOUTE la liste par la page 1 (`saveSorted` → `cache.conversations.save` = remplacement de la clé, :1422-1424).
- `:436` et `:467` — idem avec un merged partiel.
- `:497-500` — `catch { succeeded = false; break }` laisse le partiel persisté.
- Caveat explicitement documenté côté app : « its parallel fan-out can persist a partial merge to the "list" cache key … pre-existing SDK-level gap » (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:1194-1202`).

**Impact.** Pendant le reconcile quotidien P7-10 (cache chaud, compte multi-pages), un blip réseau ou un kill de l'app laisse le cache réduit à un préfixe (voire à la seule page 1). Les conversations manquantes ne reviennent PAS par delta (`updatedSince` ne renvoie que les rows modifiées) : lecture offline amputée jusqu'au prochain fullSync réussi. Visuellement : la liste rétrécit puis regonfle à chaque reconcile lent.

**Correctif pas-à-pas.**
1. Dans `ConversationSyncEngine.fullSync`, remplacer les 3 écritures intermédiaires (:300, :436, :467) par un UPSERT dans la baseline : réutiliser `Self.mergeDeltaConversations(existing: currentUnion, deltas: page)` (:600-615, déjà testé), puis `saveSorted` du résultat — la baseline figée (:284) sert de point de départ, chaque page s'y fusionne.
2. Ajouter l'écriture de REMPLACEMENT finale UNIQUE (liste complète `merged`) juste avant :507, exécutée SEULEMENT si `succeeded == true` — c'est elle qui purge les fantômes hard-supprimés (P7-10).
3. Sur échec : le cache contient baseline ∪ pages reçues, aucune purge, `return false`.
4. Iso-fonctionnel à préserver : la purge actuelle par remplacement n'invalide pas les caches messages des fantômes — ne PAS ajouter cette invalidation dans ce lot.
5. Ne PAS toucher : `reconcileUnread`/baseline (frontière de lecture), `SearchIndex.indexConversations` (upsert-only), la première peinture rapide (l'upsert de la page 1 peint toujours en ~300 ms).

**Tests (TDD — RED d'abord).** `ConversationSyncEngineTests` (réutiliser le harnais db-injecté du test :48-51) :
- `test_fullSync_tailPageFails_cacheRetainsBaselineConversations` (seed baseline 5 convs, mock service qui jette à la page 2 → assert cache ⊇ baseline)
- `test_fullSync_tailPageFails_doesNotPurgeServerAbsentConversations`
- `test_fullSync_success_replacesListAndPurgesGhosts` (non-régression P7-10 — garder vert `test_syncSinceLastCheckpoint_prunesServerHardDeletedConversation_whenFullReconcileDue` :332)
- `test_fullSync_partialFailure_returnsFalse`

**Risque de régression.** Moyen : la purge des fantômes (P7-10) ne doit pas être perdue — elle reste garantie par l'écriture finale conditionnée à `succeeded`. Les tests ci-dessus verrouillent les deux faces (rétention sur échec, purge sur succès).

**Dépendances.** sync-02-watermark-advances-on-failed-persist · **Backend requis :** non

---

### sync-04-watermarks-not-purged-at-logout — Watermarks de sync cross-compte : lastSyncTimestamp / lastFullReconcileAt / lastCleanupDate survivent au logout · **P1** · effort S

**Constat.** Les trois clés de checkpoint de l'engine vivent en `UserDefaults.standard` non namespacées et survivent au logout : `AuthManager.logout()` purge Keychain, CacheCoordinator, stores, et reset `SyncSeqTracker` (« A5 — le curseur de séquence est per-user »), mais aucun `removeObject` sur ces clés. Vérifié : aucun chemin de switch de compte ne contourne logout (pas de `switchAccount` dans AuthManager — switch = logout + login). Le déclencheur réel du scénario : un delta (foreground/reconnect) courant AVANT le premier fullSync réussi du compte B persiste une liste partielle `?updatedSince=T_A` considérée fraîche, et le `lastFullReconcileAt` hérité repousse la réconciliation réparatrice.

**Preuve.**
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:165-168` (`syncTimestampKey` = `me.meeshy.lastSyncTimestamp`), `:171-174` (`cleanupDateKey`), `:186-189` (`fullReconcileKey`) — UserDefaults.standard, non namespacés.
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift:428-522` — `logout()` purge Keychain, CacheCoordinator (:511), stores, `SyncSeqTracker.shared.reset()` (:491-493) — mais aucune de ces trois clés.
- grep repo : seuls les tests manipulent `me.meeshy.lastFullReconcileAt` (`ConversationSyncEngineTests` :189/:220/:334).

**Impact.** Après un switch A→B sur le même device : B hérite du curseur delta de A. Si le premier fullSync de B échoue (offline au login) ou si un delta court avant lui, `?updatedSince=T_A` ne rapatrie que les conversations de B modifiées depuis T_A → liste partielle persistée et considérée fraîche ; `lastFullReconcileAt` hérité repousse la réconciliation réparatrice jusqu'à 24 h. Le même motif exact a déjà justifié le reset de `SyncSeqTracker` — les curseurs temporels ont été oubliés.

**Correctif pas-à-pas.**
1. `ConversationSyncEngine.swift` : ajouter `public func resetSyncCheckpoints()` — `UserDefaults.standard.removeObject(forKey:)` sur `syncTimestampKey`, `cleanupDateKey`, `fullReconcileKey` ; remettre aussi `lastDeltaSyncAt = .distantPast` pour ne pas hériter du cooldown.
2. `AuthManager.logout()` : appeler `ConversationSyncEngine.shared.resetSyncCheckpoints()` juste à côté de `SyncSeqTracker.shared.reset()` (:493) — les deux types sont dans MeeshySDK, aucun problème de dépendance.
2bis. `AuthManager.requireReauthentication` (`AuthManager.swift:820-828`) : appeler `ConversationSyncEngine.shared.resetSyncCheckpoints()` avant le flip `isAuthenticated = false` (func private du même module — appel direct ; ce chemin ne passe pas par `logout()`).
3. Ne PAS namespacer par userId dans ce lot (le reset simple suffit, diff minimal — l'alternative namespacée reste l'évolution robuste si un jour un switch sans logout apparaît).
4. Ne PAS toucher les autres resets du logout (ordre existant préservé).

**Tests (TDD — RED d'abord).**
- `ConversationSyncEngineTests` : `test_resetSyncCheckpoints_removesAllThreeUserDefaultsKeys` (poser les 3 clés, appeler, assert nil ×3).
- Suite AuthManager du SDK (`MeeshySDKTests/Auth`) : `test_logout_clearsSyncCheckpoints` et `test_requireReauthentication_clearsSyncCheckpoints` — attention à la leçon AuthServiceTests/phase 3 : ces tests mutent la session réelle, ils doivent suivre le pattern des suites phase 2 (état restauré) et nettoyer UserDefaults en défense.

**Risque de régression.** Quasi nul : le pire effet d'un reset est un fullSync au prochain login (comportement déjà nominal sur cache vide).

**Dépendances.** aucune · **Backend requis :** non

---

### sync-05-seq-coverage-single-event-not-persisted — Pilote _seq (A5) : un seul event estampillé/observé, curseur non persisté — l'extension A6 et le paramètre seq du /sync restent à livrer · **P2** · effort L

**Constat.** Le séquencement exact per-user `_seq` ne couvre qu'un event : le gateway n'estampille que `notification:new` (unique call-site `emitWithSeq`), le client n'observe que ce même event, et `SyncSeqTracker` garde son état en mémoire d'actor sans persistance — le paramètre `seq` du `/sync` (qui active `hasGap`) n'est donc jamais envoyable. Cadrage corrigé par la passe adversariale : le code se déclare explicitement PILOTE en rollout par étapes (« A5.2 », « d'autres collections viendront avec la migration (A6) ») — c'est de la dette planifiée, pas une régression. L'impact « fenêtre app-killed totalement aveugle » est aussi tempéré : `NotificationGapResyncCoordinator` resync inconditionnellement au reconnect (A5.4) et la cloche refetch au stale 2 min. P2 maintenu uniquement parce que la persistance de `lastSeq` gate l'étape `seq`/`hasGap` de sync-01.

**Preuve.**
- `services/gateway/src/services/notifications/NotificationService.ts:838` — unique call-site `emitWithSeq` (sur NOTIFICATION_NEW).
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:3037-3040` — unique observe côté client (listener `notification:new`).
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncSeqState.swift:48` — état d'actor sans persistance ; `:13-14` et `:43-44` — rollout par étapes explicitement documenté (A5.2, A6 à venir).
- `services/gateway/src/routes/sync.ts:143-144` — `hasGap` jamais alimenté (`seq` optionnel, jamais envoyé par le client).
- `apps/ios/Meeshy/Features/Main/Services/NotificationGapResyncCoordinator.swift:56-59` — resync inconditionnel au reconnect (mitigation existante).

**Impact.** La détection de gap exacte couvre 1 type d'event sur ~40 : messages, réactions, conversations, posts restent sur le gap recovery temporel (rate les timestamps identiques, sur-fetch). Le curseur non persisté empêche de détecter un gap couvrant la fenêtre app-killed (premier event post-boot = baseline) et interdit d'alimenter `hasGap` au `/sync` — l'impact pratique sur les notifications est amorti par les mitigations ci-dessus.

**Correctif pas-à-pas.** Par incréments STRICTEMENT séparés :
1. (Livrable seul, sans risque) Persister `lastSeq` dans `SyncSeqTracker` : clé UserDefaults namespacée `me.meeshy.syncSeq.<userId>` écrite dans `observe()`, rechargée paresseusement au premier `observe` post-login (le singleton naît avant l'auth — ne PAS charger à l'init), purgée dans `reset()` (déjà appelé au logout, `AuthManager:493`).
2. Gateway : étendre `emitWithSeq` aux events user-scoped à forte valeur (`message:new` room user, `conversation:*`) selon le plan A6 — dans le MÊME train de release que l'étape 3.
3. Client : observer `_seq` sur exactement les mêmes events (le seq est per-user GLOBAL — émission et observation en LOCKSTEP, sinon faux gaps ; ils sont amortis par le débounce 300 ms existant, mais l'alignement strict est la vraie garde).
4. Après sync-01 : passer `seq=lastSeq` aux appels `/sync` pour activer `gapAction=full_resync_required`.
5. Ne PAS resserrer `GAP_THRESHOLD` (question ouverte à trancher produit — voir plus bas).

**Tests (TDD — RED d'abord).**
- Étape 1 — suite existante `MeeshySDKTests/Sync/SyncSeqStateTests` : `test_observe_persistsLastSeq_forCurrentUser` ; `test_firstObserveAfterRelaunch_reloadsPersistedSeq_andDetectsGap` ; `test_reset_clearsPersistedSeq`.
- Étapes 2-3 — test jest gateway énumérant COMPORTEMENTALEMENT les events passant par `emitWithSeq` (ancrer sur le comportement, pas sur une fenêtre de caractères — leçon source-guards) + test client miroir sur la liste des listeners qui observent : les deux listes doivent être identiques.

**Risque de régression.** Élevé si émission et observation divergent (faux gaps → resyncs en rafale, amortis par le débounce). Neutraliser : livrer l'étape 1 seule d'abord, puis 2+3 dans le même train de release, verrouillées par le couple de tests miroir.

**Dépendances.** sync-01-message-tombstones-unused-sync-endpoint (pour l'étape 4 uniquement) · **Backend requis :** oui (étape 2 — extension `emitWithSeq` gateway)

---

### sync-07-fullsync-returns-success-while-delta-inflight — fullSync retourne « succès » sans rien faire si un delta est en vol — pull-to-refresh factice, purge des fantômes sautée · **P2** · effort M

**Constat.** `fullSync` sort en `return true` dès que le flag `isSyncing` est levé — or ce flag est partagé avec `deltaSyncCore` : un delta de quelques secondes en vol fait mentir fullSync, qui prétend avoir réussi un refresh complet sans avoir rien fetché. Les deux appelants app (`forceRefresh`, `syncAndReconcileList`) traitent ce `true` comme un succès autoritaire et repeignent depuis le cache. Aggravant vérifié : un fullSync concurrent d'un AUTRE fullSync retourne aussi `true` — `forceRefresh` peut alors relire un cache où le fullSync en vol vient d'écrire sa page 1 seule (interaction avec sync-03) et peindre une liste tronquée transitoire.

**Preuve.**
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:273-276` — `public func fullSync() async -> Bool { guard !isSyncing else { return true } … }`.
- `:534-546` — `deltaSyncCore` partage le flag (:534 guard, :545 set) et retourne aussi `true` sur cooldown (:541-543, sémantique « fresh enough » documentée).
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:1149-1170` (`syncAndReconcileList`) et `:1178-1219` (`forceRefresh`) — le `true` est traité comme refresh complet réussi.

**Impact.** L'utilisateur tire pour rafraîchir précisément quand il doute de la liste (ex. conversation fantôme) ; si un delta est en vol (reconnect concurrent, retour foreground), le pull-to-refresh se termine « avec succès » sans full fetch : le fantôme reste, le spinner a menti. Idem pour le reconcile P7-10 s'il tombe sur la fenêtre.

**Correctif pas-à-pas.**
1. `ConversationSyncEngine` : remplacer le flag booléen par une task partagée `private var _currentSyncTask: Task<Bool, Never>?` protégée par `stateQueue` (motif des autres propriétés, :136-139).
2. `fullSync` : si une task FULL est en vol → `return await task.value` (le vrai résultat, jamais un `true` fabriqué) ; si un DELTA est en vol → `_ = await deltaTask.value` puis lancer le full (sérialisation, pas d'assimilation).
3. `deltaSyncCore` : s'enregistrer comme task pour être attendable ; CONSERVER le `return true` du cooldown (:541-543 — sémantique documentée, raisonnable pour les fronts delta).
4. Préserver le chaînage reconcile :527-529 : le full se lance APRÈS la fin du delta, hors du corps de celui-ci — pas de réentrance : une seule task non réentrante rend le deadlock impossible.
5. Ne PAS changer les signatures publiques ni le comportement de `syncSinceLastCheckpoint` pour ses appelants.

**Tests (TDD — RED d'abord).** `ConversationSyncEngineTests` :
- `test_fullSync_whileDeltaInFlight_stillPerformsFullFetch` (mock ConversationService avec délai artificiel sur le delta ; assert `list(offset:limit:)` appelé — compteur en DELTA, pas en absolu, leçon compteurs d'appels)
- `test_fullSync_concurrentCalls_shareSingleFetch_andAllReceiveRealResult` (10 Task concurrentes → 1 seul fetch réseau, 10 résultats identiques réels)
- `test_fullSync_failure_propagatesToAwaitingCallers` (le second appelant reçoit `false`, pas `true`)
- Non-régression : `test_syncSinceLastCheckpoint_prunesServerHardDeletedConversation_whenFullReconcileDue` (:332) reste vert.

**Risque de régression.** Moyen (concurrence) : risque théorique de deadlock si fullSync attendait une task qui l'attend — impossible avec une seule task partagée non réentrante ; le test de stress à 10 appels concurrents le verrouille.

**Dépendances.** sync-02-watermark-advances-on-failed-persist ; sync-03-fullsync-destructive-partial-replace · **Backend requis :** non

---

### sync-10-mark-received-not-queued — markAsReceived du relay socket lancé en try? direct — accusé de réception perdu si le réseau retombe · **P3** · effort S

**Constat.** Le relay global de `message:new` déclenche l'accusé de réception REST en fire-and-forget (`Task { try? await … }`), hors de toute file durable, alors qu'une flush-loop existe déjà (reconnect + foreground). Le correctif d'origine (« router vers PendingStatusQueue depuis l'engine ») était inapplicable tel quel : `PendingStatusQueue` est APP-side alors que `ConversationSyncEngine` est SDK — pas d'import possible — et l'API `enqueueReceived(conversationId:)` n'existe pas (API réelle : `enqueue(PendingAction)` avec `type: "received"`). Le fix passe par un seam injectable, motif `apiMessagePersistor`.

**Preuve.**
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:979-983` — `if !isMe { Task { try? await ConversationService.shared.markAsReceived(conversationId: msg.conversationId) } }`.
- Flush-loop existante : `ConversationSocketHandler.swift:1141` (reconnect), `BackgroundTransitionCoordinator.swift:143` (foreground).
- `apps/ios/Meeshy/Features/Main/Services/PendingStatusQueue.swift:5` — type APP-side ; usage réel de l'API : `ConversationViewModel.swift:3636`.

**Impact.** Si le REST échoue juste après réception socket (réseau instable), le curseur de livraison n'avance pas côté serveur : l'expéditeur garde le simple-check gris plus longtemps que la réalité, et le compteur unread serveur peut diverger jusqu'au prochain événement. Auto-réparé par les acks suivants → P3.

**Correctif pas-à-pas.**
1. SDK — `ConversationSyncEngine.swift` : ajouter un seam `public var markAsReceivedFallback: (@Sendable (String) async -> Void)?` (même motif `stateQueue` que `apiMessagePersistor`, :135-139).
2. Remplacer :979-983 par : `if !isMe { Task { do { try await ConversationService.shared.markAsReceived(conversationId: msg.conversationId) } catch { await self.markAsReceivedFallback?(msg.conversationId) } } }`.
3. App — `DependencyContainer.swift` (à côté du câblage `apiMessagePersistor`, :96) : `ConversationSyncEngine.shared.markAsReceivedFallback = { convId in await PendingStatusQueue.shared.enqueue(.init(conversationId: convId, type: "received", timestamp: Date())) }`.
4. Ne PAS toucher : `PendingStatusQueue` (le flush filtre déjà les ids vides et l'âge 24 h), le gateway (mark-as-received idempotent), les flushes existants (:1141, :143).

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Sync/ConversationSyncEngineTests` :
- `test_messageNewRelay_markAsReceivedFails_invokesFallback` (MockConversationService dont `markAsReceived` jette ; fallback closure comptée via `XCTestExpectation` — pas de `Task.sleep`)
- `test_messageNewRelay_markAsReceivedSucceeds_doesNotInvokeFallback`
- `test_messageNewRelay_ownMessage_neverCallsMarkAsReceived` (non-régression `isMe`)

App : le couple enqueue/flush de `PendingStatusQueue` est déjà couvert — ne rien redéfinir.

**Risque de régression.** Faible : la queue coalesce déjà par conversation ; pas de double-ack possible (le gateway est idempotent sur mark-as-received).

**Dépendances.** aucune · **Backend requis :** non

---

### sync-11-cold-launch-fresh-window-no-delta — Cold start dans la fenêtre de fraîcheur (5 min) : aucun delta ne court, le premier connect socket ne fire pas didReconnect · **P3** · effort S

**Constat.** Au cold launch avec un cache conversations frais (< 5 min), aucun mécanisme de rattrapage ne court : la branche `.fresh` du VM peint sans sync, `handleForegroundTransition` ne s'exécute pas (`didEnterBackground` est faux au boot), le `.task` de RootView connecte et démarre le relay SANS delta, et `didReconnect` exige `hadPreviousConnection` (le premier connect ne le fire pas). Précision d'évidence apportée par la vérification : le drain NSE ne court pas « au boot » génériquement — il court à l'ouverture d'une conversation et au foreground-resume ; la couverture pratique passe par le tap-sur-push (qui ouvre la conversation). Le trou « boot sur la liste, sans push » reste réel mais borné à ~5 min de fenêtre fraîche → P3.

**Preuve.**
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:1088-1092` — branche `.fresh` sans aucun sync ; staleTTL conversations = 5 min (`CachePolicy.swift:50`).
- `apps/ios/Meeshy/MeeshyApp.swift:576-581` — `handleForegroundTransition` ne court pas au cold launch.
- `apps/ios/Meeshy/Features/Main/Views/RootView.swift:616-627` — le `.task` connecte + `startSocketRelay` sans delta.
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:1706-1712` — `didReconnect` exige `hadPreviousConnection`.
- Drain NSE : ouverture de conversation (`ConversationViewModel.swift:1458`) et foreground-resume (`BackgroundTransitionCoordinator.swift:103`) — pas au boot générique.

**Impact.** Kill de l'app puis relaunch < 5 min : les messages arrivés entre-temps ne remontent ni par delta ni par `didReconnect`. Couvert en pratique par le push (tap → ouverture de conversation → drain NSE) et par le premier event socket — le trou ne mord que si push indisponible/désactivé. Fenêtre courte → P3.

**Correctif pas-à-pas.**
1. `RootView.swift`, dans le `.task` (:616-627), juste après `await ConversationSyncEngine.shared.startSocketRelay()` : ajouter `Task { await ConversationSyncEngine.shared.syncSinceLastCheckpoint() }` (fire-and-forget pour ne pas retarder le reste du boot).
2. Passer par l'ENGINE directement — surtout pas par le VM — pour ne pas écraser le `loadState` `.cachedFresh` par un état transitoire.
3. Garde-fous existants suffisants : le cooldown 3 s (:541-543) et `isSyncing` dédoublonnent les fronts concurrents ; au login frais (cache `.empty`) la liste lance `fullSync` et le delta concurrent sort sur `isSyncing` ; un delta vide coûte ~1 requête.
4. Ne PAS toucher `handleForegroundTransition` ni la sémantique `didReconnect`/`hadPreviousConnection`.

**Tests (TDD — RED d'abord).** Au niveau engine (RootView n'est pas unit-testable proprement) — `ConversationSyncEngineTests` : étendre `test_syncSinceLastCheckpoint_callsAPIRequest` (:149) avec un assert sur `updatedSince=<watermark persisté>` (le delta au boot doit repartir du checkpoint, pas de `distantPast`, quand un watermark existe). Non-régression VM : la branche `.fresh` de `ConversationListViewModel` ne change pas (tests VM existants restent verts). Vérification manuelle E2E : kill + relaunch < 5 min → log `[SyncEngine]` d'un delta au boot.

**Risque de régression.** Quasi nul (chemin nominal existant + cooldown). Seul point de vigilance : ne pas écraser l'état `.cachedFresh` — d'où le passage direct par l'engine (étape 2).

**Dépendances.** sync-04-watermarks-not-purged-at-logout (recommandé avant : sinon le delta au boot post-switch consomme un watermark hérité) ; sync-02-watermark-advances-on-failed-persist · **Backend requis :** non

## Doublons rattachés

| Doublon | Canonique | Apport au canonique |
|---|---|---|
| sync-06-anonymous-resume-no-reconnect (sessions anonymes : sockets suspendus au background, jamais relancés au foreground) | → voir net-02 (fichier 06) | Faits confirmés (guard `MeeshyApp.swift:867-868`, suspend inconditionnel `BackgroundTransitionCoordinator.swift:76-81`), mais le fix proposé ici — appeler `resumeFromBackground()` pour un invité depuis MeeshyApp — serait un NO-OP seul : les managers ont leur PROPRE guard `authToken != nil` (`MessageSocketManager.swift:1666-1668`, `SocialSocketManager:521-524`). Apport intégré au fix canonique net-02 : il y a DEUX verrous en série — élargir aussi le guard app-niveau `MeeshyApp.swift:868` (chemin réduit invité : resume sockets seulement, sans outbox ni `syncSinceLastCheckpoint`), sinon les managers ne sont même pas appelés. |
| realtime-03 (fichier 03), stores-11 / vm-r3-savesorted-01 (fichier 05) | sync-02 (ce fichier) | Doublons du même R3, absorbés par le canonique. Leur apport : le 3e site de watermark oublié par la fiche d'origine (early-return de fullSync, `ConversationSyncEngine.swift:314-315`) et le seam de test via le cache injectable (`CacheCoordinator(messageSocket:socialSocket:db:)`). Le correctif de sync-02 couvre les trois sites (:314-315, :509-510, :586) et les quatre appels `saveSorted` (:300, :436, :467, :578). |

## Écartés après vérification

- **sync-08-notif-resync-truncates-cache** — « Le resync notifications remplace le cache "all" par les 30 dernières : l'historique paginé en cache est évincé. » Réfuté : l'historique paginé qui serait évincé n'existe jamais dans le cache. `NotificationListView.loadMore` accumule en mémoire mais N'ÉCRIT JAMAIS le cache (`packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListView.swift:520-534`), et `refreshFromAPI` fait lui-même `save(response.data, for: "all")` avec la même première page de 30 (limit=30, :363 ; :504-512) à chaque revalidation stale (2 min). Le `save(30)` du resync (`NotificationGapResyncCoordinator.swift:85`) reproduit donc le contrat steady-state existant de la clé "all" ; `maxItemCount` 200 (`CachePolicy.swift:90`) est un plafond, pas un état rempli. Le doublon rts-08 tombe avec ce verdict.
- **sync-09-searchindex-never-deindexes** — « Les conversations supprimées/quittées restent trouvables en recherche (tap → 403 cul-de-sac). » Le fait brut est exact (`SearchIndex.removeConversation`, `SearchIndex.swift:95-103`, jamais appelé par l'engine ; index upsert-only), mais l'impact est neutralisé par un garde-fou existant : l'UNIQUE consommateur de `searchConversations` est `GlobalSearchViewModel` (:290), qui hydrate chaque id FTS contre le cache "list" et JETTE les ids sans homologue (`guard let conv = byId[id] else { return nil }`, `GlobalSearchViewModel.swift:308-309`) — une conversation retirée du cache ne peut jamais apparaître dans les résultats. Pas de fuite cross-compte non plus : logout → `CacheCoordinator.reset()` → `SearchIndex.clearAll()` (`CacheCoordinator.swift:376`). Résidu = lignes FTS mortes inertes (hygiène d'index négligeable) — durcissement optionnel, pas un écart.

## Questions ouvertes

- `GAP_THRESHOLD = 10 000` (`routes/sync.ts:25`) : un client peut manquer 9 999 events sans que `hasGap` ne se déclenche. Seuil volontairement lâche pour le pilote, ou valeur à resserrer quand le client consommera `/sync` (sync-01 + étape 4 de sync-05) ? Décision produit à prendre — les correctifs ci-dessus ne le touchent pas.
- Le delta conversations suppose que le gateway bump `Conversation.updatedAt` sur CHAQUE événement pertinent (nouveau message, membre, préférence) — non vérifié côté gateway dans cette passe ; si un type de mutation ne touche pas `updatedAt`, le delta le rate structurellement. À instruire avec le contrat gateway (fichier 06).
- `ISO8601DateFormatter()` sans fractional seconds dans `deltaSyncCore` (:550) : le curseur envoyé est tronqué à la seconde (direction sûre — over-fetch de la même seconde, idempotent). Harmonisation avec le format fractionnaire du `/sync` (`z.string().datetime({offset:true})`) à faire lors du câblage sync-01, qui impose déjà l'offset pour `since`.
- Statuts hors dimension non réévalués ici : T15b(a/c) (revalidation URLCache/304 fast-path côté client) — renvoyés à la dimension cache/réseau (fichiers 01 et 06).
