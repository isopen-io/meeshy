# iOS Local-First — Backlog (vérifié par preuves, HEAD 51ca65281)

Méthodologie par tâche : analyse → auto-review → preuves verbatim → vérif edge-cases (Opus) → **TDD (RED→GREEN→REFACTOR)** → vérif cache end-to-end (frontend↔backend coordonnés) → build/tests verts.

Backlog issu du workflow `ios-local-first-backlog` (31 agents, 16 candidats vérifiés → 7 confirmés + 12 découverts → 17 tâches). 9 candidats réfutés/déjà-corrigés écartés.

## Clusters systémiques
1. **Désync reconnect/lifecycle** : teardown background zéroie `hadPreviousConnection`/`joinedConversations`/`activeConversationId` → `didReconnect` ne fire jamais au foreground → backfill + reçus jamais flushés.
2. **Gap recovery message mort** : `ReconnectionGapDetector` jamais câblé + endpoint gateway sans watermark `after`. ✅ RÉSOLU (T8 endpoint `?after=` + T9 `syncMissedMessages` réécrit en forward-paging par watermark ; détecteur mort supprimé).
3. **Fuites cross-compte au logout** : `reset()` omet 4 stores prefs + `clearOutbox()` ne purge pas la table `messages`.

## Tâches

### P0 — corruption / perte / fuite visible
- [x] **T1** (S, sdk) — Préserver `hadPreviousConnection` à travers le teardown background → `didReconnect` fire au resume. Débloque T2, T9. ✅ `suspendTransport()` (transport-only, préserve le flag) extrait ; `disconnect` = suspend + clear flag ; `prepareForBackground`/`forceReconnect` = suspend. Seam testable `handleConnectionEstablished()`. TDD 4 tests (RED 2/4 → GREEN 4/4) + régression 148/0 sur 11 suites lifecycle.
- [x] **T3** (S, sdk) — Ne plus réinitialiser `lastFetchedAt` (horloge fraîcheur L2) sur flush de mutation locale (`GRDBCacheStore.flushKeyToL2`). ✅ Préserve `existingMeta?.lastFetchedAt ?? now` (comme writeCursorToL2). TDD 3 tests (RED 2/3 → GREEN 3/3) + régression 84/0 sur 9 suites cache. Débloque T4.
- [x] **T4** (M, sdk) — Flusher les entrées L1 dirty avant éviction LRU dans `touchKey` (+ purger dirtyKeys fuités). Dépend T3. ✅ Invariant "aucune éviction ne drop une L1 dirty sans flush" : helper `flushDirtyKeyForEviction` partagé par `touchKey`+`evictL1` ; `flushDirtyKeys` GC les clés mortes + clear `firstDirtyAt` sur vide. TDD 2 tests (RED 2/2 → GREEN 2/2) + régression 61/0.
- [x] **T5** (S, sdk) — Purger les 4 stores de préférences (categories/userTags/userPreferences/conversationPreferences) au logout (`CacheCoordinator.reset`). ✅ Le leak réel = L1 RAM (singleton) + persistTask dirty re-flush, pas L2 (déjà vidé par deleteAllL2 des autres stores). 4 `invalidateAll()` ajoutés à `reset()` ET `invalidateAll()`. TDD 2 tests (RED 2/2 → GREEN 2/2) + régression CacheCoordinator 22/0.
- [x] **T6** (S, sdk) — Purger les tables GRDB `messages` au logout (étendre `clearOutbox`). ✅ Nouveau `clearAllMessagesForLogout()` purge les 7 tables (messages+translations+transcriptions+audio+attachments+pending_ids+outbox, aucune FK, transaction atomique) ; hook `wireOutboxLogoutHook` re-câblé. TDD (stub → RED 7/7 → GREEN) + régression persistence 49/0 + app build 38s OK. **Tous les P0 terminés.**

### P1 — sync correctness + efficacité haute valeur
- [x] **T2** (M, sdk) — Préserver/restaurer `joinedConversations` + `activeConversationId` à travers suspend/resume. Dépend T1. ✅ `suspendTransport` préserve les rooms (resume re-join via seam `roomsToRejoinOnConnect()` active-first) ; `disconnect` (logout) les efface. `joinRoom()` mort supprimé (ConversationSocketHandler). TDD 3 tests (RED 1/3 → GREEN 3/3) + régr 64/0 + app build OK.
- [x] **T7** (M, sdk+app) — Tagger la réaction de l'utilisateur courant avec son `userId` (pas le `participantId` de l'auteur) en ingestion REST. ✅ Bug réel localisé : `MessagePersistenceActor.upsertFromAPIMessages` taguait la réaction du user courant avec `api.senderId` (participantId de l'**auteur**) → après reload cache/REST (source de vérité local-first, read = passthrough), l'highlight « j'ai réagi » disparaissait. `toMessage` était correct (`currentUserId`). Fix single-source-of-truth : helper pur partagé `MeeshyReaction.reconstructFromSummary(messageId:reactionSummary:currentUserReactions:currentUserId:)` (dédupe les 2 blocs, empêche la re-divergence) ; l'actor reçoit `currentUserId` (état injecté via `DependencyContainer.wireCurrentUserHook` ⇐ `AuthManager.$currentUser`, seed+sync login/switch/logout). End-to-end : gateway fournit déjà `currentUserReactions`+`reactionSummary` (0 changement backend, pas d'over-fetch). TDD : test pur helper + test intégration `upsertFromAPIMessages` (RED `author_participant_id`≠`me_user_id` → GREEN). Régr MessagePersistenceActorTests + APIMessageToMessageTests verts + app build 72s. **Débloque T13.**
- [x] **T8** (S, backend) — Param watermark `since`/`after` sur `GET /conversations/:id/messages`. ✅ Helper pur `buildAfterWatermarkClause(after)` (gt Date, garde Invalid Date) + `afterMode` câblé : `createdAt > after`, ordre **asc** (backfill contigu), skip COUNT + skip offset-pagination. `MessagesQuery.after?` ajouté. TDD 4 tests jest (RED 1/4 → GREEN 4/4, ts-jest typecheck OK). Débloque T9.
- [x] **T9** (M, sdk+app) — Câbler gap recovery message au reconnect via watermark `after` (remplacer `ReconnectionGapDetector`). Dépend T1, T8. ✅ Le chemin LIVE était déjà câblé (`ConversationSocketHandler.subscribeToReconnect` → `delegate.syncMissedMessages()`) mais **bogué** : `list(offset:0,limit:30)` ne récupérait que les 30 derniers → un gap > 30 msgs jamais comblé. Fix = `syncMissedMessages` réécrit en **forward-paging par watermark** : `after = max(createdAt local) − 1ms` (tie-backoff anti strict `>`), boucle `listAfter` jusqu'à page < pageSize (100) ou cap 1000. Nouveau `MessageServiceProviding.listAfter(after:Date)` (consomme T8 `?after=` ISO8601 fractional, ordre asc) + overload backward-compat + 3 mocks étendus. **Acteur mort `ReconnectionGapDetector` SUPPRIMÉ** (jamais instancié, redondant — single source of truth) ; `AsyncSemaphore` partait avec (0 autre usage). TDD : SDK `testListAfterCallsWithCorrectEndpoint` (GREEN) + 3 tests app (RED 2/3 → GREEN 3/3 : watermark, multi-page gap-fill, empty-guard). Régr MessageServiceTests 15/0, ConversationSyncEngine+CacheCoordinator verts, ConversationViewModelTests full vert, app build 62s OK.
- [ ] **T10** (S, app) — Flusher les mutations offline non-message au reconnect réseau (block/friend/profile/like/comment).
- [ ] **T11** (M, app) — Router edit/delete offline via l'outbox (câbler `enqueueEdit`/`enqueueDelete`). Dépend T10.
- [x] **T12** (S, sdk) — Re-fetch ciblé des pages intérieures perdues dans `fullSync` (liste partielle silencieuse). ✅ `droppedIndices` re-fetchés avant `saveSorted` (merge dédupe par id) ; `succeeded=recoveredAll` (un échec transitoire récupéré ne flag plus incomplet). TDD 1 test (RED 150≠250 → GREEN 250) + régr ConversationSyncEngine 21/0.

### P2 — efficacité / robustesse
- [ ] **T13** (S, sdk) — Ne pas clobber `reactionsJson` muté localement avec un snapshot REST périmé. Dépend T7.
- [ ] **T14** (M, multiple) — Surfacer les lignes outbox `.exhausted` non-message dans SyncPill + GC des lignes terminales. Dépend T10.
- [ ] **T15** (M, backend) — ETag/304 sur `GET /conversations` et `/conversations/:id/messages`.

### P3 — over-fetch
- [ ] **T16** (S, backend) — Trimmer les champs `sender.user` inutilisés du select GET messages (+ projeter `isOnline`).
- [ ] **T17** (S, backend) — Trimmer `permissions`/`language` du select participants de la LISTE conversations.

## Découvertes annexes (à backloguer après vérif)
- `SocialSocketManager` : même pattern `disconnect()` zéroie le flag de reconnect (lignes 333/411/418/424/429) — sibling de T1 ; vérifier si son `didReconnect` pilote du sync-critique.
- `resumeFromBackground()` guard sur `APIClient.shared.authToken != nil` → no-op pour les sessions **anonymes** (session token, pas authToken) → pas de reconnect socket au resume pour anonymes. Pré-existant, hors T1.

## Review log
_(rempli au fil des tâches)_
