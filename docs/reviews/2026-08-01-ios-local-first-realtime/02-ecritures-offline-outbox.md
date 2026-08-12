# 02 — Écritures offline : outbox unifié, files parallèles, flushers

> Périmètre : le chemin d'écriture hors-ligne complet — outbox unifié (`OfflineQueue`/`OutboxFlusher`/`OutboxDispatcher`), files annexes (`StoryPublishQueue`, `SettingsActionQueue`, `ConversationStateOutbox`, `PendingStatusQueue`, `ImpressionBatcher`), déclencheurs de drain, hygiène de logout des files, idempotence serveur. Méthodologie et sévérités : voir README.md. Architecture de référence : 00-etat-des-lieux.md. HEAD audité : 901e92589.

## Rappel d'architecture

L'écriture hors-ligne repose sur un **outbox unifié** (table GRDB `outbox`, 19 `OutboxKind`, write-ahead deux phases pour les médias, claim atomique `pending→inflight`, backoff exponentiel, dédup serveur par `clientMessageId`/`X-Client-Mutation-Id`) décrit en détail dans 00-etat-des-lieux.md §3. Autour de lui coexistent **cinq files annexes durables** (StoryPublishQueue, SettingsActionQueue, ConversationStateOutbox, EngagementOutbox, ImpressionBatcher) et deux mécanismes hérités (PendingStatusQueue, widget `pending_mark_read`), chacun avec sa propre sémantique de retry, d'idempotence et — c'est le cœur des écarts ci-dessous — de purge au logout. Un **chemin chaud hérité** subsiste dans `OfflineQueue` : un miroir mémoire `items` rejoué par `retryAll()` sur chaque front socket/réseau, en parallèle du flusher SQLite. Les 12 écarts de cette dimension ont tous survécu à la vérification adversariale (aucun réfuté) ; toutes les références `fichier:ligne` ont été retrouvées exactes au HEAD audité.

## Écarts retenus

### outbox-01 — `retryAll()` rejoue les messages média/audio en texte-only et supprime la row (perte de pièces jointes + lieu) · **P0** · effort S

**Constat.** Le chemin chaud hérité `retryAll()` itère TOUS les items du miroir mémoire — y compris ceux qui portent des fichiers locaux en attente d'upload — les envoie via un handler REST qui ignore les fichiers et le lieu, puis, sur succès, supprime la row outbox correspondante. Le flusher, seul chemin qui sait uploader via TUS, ne verra donc jamais ces fichiers.

**Preuve.** `OfflineQueue.swift:2492-2516` — la boucle de `retryAll()` n'a aucune garde média ; `:2519-2531` — suppression de la row `ofq_` sur succès. Les items médias sont bien présents dans le miroir (`items.append` à `:1439` dans `enqueueAudios` et `:1577` dans `enqueueMedia`), avec des appelants réels (`ConversationView+AttachmentHandlers.swift:284/319/433/449` — le commentaire « no caller » de `OfflineQueue.swift:1470-1471` est périmé). Le handler injecté (`MeeshyApp.swift:299-317`) construit un `SendMessageRequest` sans `localMediaPaths` ni `location`, alors que `SendMessageRequest` possède `location` (`MessageModels.swift:576-587`) et que l'item le porte (`OfflineQueue.swift:62`, peuplé par `ConversationViewModel.swift:2343-2354`). `observeNetwork` (`:2582-2598`) déclenche `retryAll` à +200 ms au front réseau, process vivant. `ConversationViewModel.swift:2860-2877` documente exactement ce danger pour le retry MANUEL — le chemin automatique le commet.

**Impact.** Photo/vidéo/audio avec légende enfilé hors-ligne, app restée vivante jusqu'au retour du réseau : le REST part avec la légende seule, réussit, la row est supprimée → les fichiers ne sont jamais uploadés. Le destinataire reçoit un message texte. Le `location` d'un message texte est perdu de la même façon. Perte de données silencieuse.

**Correctif pas-à-pas.**
1. `OfflineQueue.swift`, `retryAll()`, en tête de la boucle `for` (`:2492`) : ajouter `guard (item.localMediaPaths ?? []).isEmpty, (item.localAudioPaths ?? []).isEmpty, (item.localAudioPath ?? "").isEmpty else { continue }` — les items porteurs de fichiers appartiennent exclusivement au flusher (seul à savoir uploader via TUS).
2. `MeeshyApp.swift:301-309` : ajouter `location: item.location` au `SendMessageRequest` construit dans le handler `setRetrySend`.
3. Ne PAS toucher : ni au flusher, ni au dispatcher. La suppression structurelle de `retryAll` est portée par outbox-07.

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/OfflineQueueTests` : `test_retryAll_itemWithLocalMediaPaths_keepsRowAndSkipsSend` (enqueueMedia sur le pool de test, stub `setRetrySend` avec compteur en DELTA, `retryAll` → compteur inchangé, row `ofq_` toujours présente via `outboxPoolForTesting`) ; `test_retryAll_itemWithLocalAudioPaths_skipped` ; `test_retryAll_textItemWithoutMedia_stillSent` (non-régression). Côté app : `MeeshyTests/Unit/Services/MeeshyAppOutboxHygieneTests` (suite source-guard existante sur `MeeshyApp.swift`) : ajouter un extracteur `retrySendHandlerBody(from:)` sur le modèle de `settingsFlushHandlerBody`, puis `test_setRetrySendBody_includesLocationField` — ancrer sur le comportement, filtrer les commentaires.

**Risque de régression.** Faible : les items médias restent drainés par le flusher, déjà déclenché sur les mêmes fronts (`OutboxRetryScheduler` + `ConversationSocketHandler:1146`).

**Dépendances.** outbox-07 (correctif structurel qui supprimera `retryAll` ; le présent écart s'applique immédiatement sans l'attendre) · **Backend requis :** non

### outbox-02 — `SettingsActionQueue` jamais purgée au logout → PATCH `/users/me` du compte A rejoué sous le token du compte B · **P0** · effort S

**Constat.** `AuthManager.logout()` purge de nombreux stores mais ne référence jamais `SettingsActionQueue`. La file persiste sur disque, non scopée par userId, et son flush rejoue endpoint + corps verbatim sous le token de la session COURANTE — y compris juste après l'abonnement de l'observer réseau.

**Preuve.** `AuthManager.swift:428-522` — `logout()` purge StoryPublishQueue (`:487`), ConversationStore (`:488`), CacheCoordinator (`:511`) mais jamais SettingsActionQueue (lecture intégrale). `SettingsActionQueue.swift:193-198` — `clearAll()` n'a AUCUN appelant production (grep exhaustif : seuls `MeeshyApp:318` `setFlushHandler`, `ProfileView:848` `enqueue`, `RootView:2151-2152` `count`). L'observer `:216-229` rejoue sans `dropFirst` « Y COMPRIS à l'abonnement » (+2 s) ; le handler `MeeshyApp.swift:318-327` rejoue endpoint + body via `APIClient.shared` sous le token courant. Producteur : `ProfileView.swift:838-848` (PATCH `/users/me` hors-ligne). `wireOutboxLogoutHook` (`DependencyContainer.swift:130-147`) ne purge que les tables messages — aucun garde-fou.

**Impact.** L'utilisateur A édite son profil hors-ligne puis se déconnecte ; l'utilisateur B se connecte sur le même appareil : le `PATCH /users/me` de A est appliqué au profil de B au premier front réseau ou ~2 s après le boot. Écriture cross-compte destructive et invisible.

**Correctif pas-à-pas.**
1. `AuthManager.swift`, `logout()` : juste après `await StoryPublishQueue.shared.clearAll()` (`:487`), ajouter `await SettingsActionQueue.shared.clearAll()`. Les deux types sont SDK — aucun problème de pureté SDK ; même contrat de perte assumée que StoryPublishQueue (décision E9).
2. Défense en profondeur (optionnel, seconde PR) : préfixer `queueFileName` par userId, sur le pattern `DraftStore` (décision Q4).
3. Ne PAS toucher : ni au flush handler ni à l'observer (comportement voulu, verrouillé par `QueueDrainReachabilityGuardTests`).

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/SettingsActionQueueTests` (suite existante) : `test_clearAll_removesPersistedItems_publishesZero` (enqueue → clearAll → `count == 0` + `pendingCountChanged` émet 0 + fichier réécrit vide). Garde d'intégration : nouvelle classe `MeeshyTests` source-guard `AuthManagerLogoutPurgeGuardTests.test_logout_purgesSettingsActionQueue`, ancrée sur le corps de `logout()` dans `AuthManager.swift` (ancrer sur le comportement, strip des commentaires, pas de fenêtre de découpe fixe).

**Risque de régression.** Nul — perte assumée des éditions offline non synchronisées au logout, même contrat que StoryPublishQueue E9.

**Dépendances.** aucune · **Backend requis :** non

### outbox-03 — `ConversationStateOutbox` (pin/mute/archive/leave/deleteForUser) jamais purgée au logout → mutations de A rejouées sous le token de B, dont leave/deleteForUser destructifs · **P0** · effort S

**Constat.** `ConversationStateOutbox` (base SQLite dédiée) n'expose aucune API de purge, réhydrate ses rows à chaque boot, et est flushée `force: true` au foreground et au reconnect socket sous le token courant. `ConversationStore.reset()` — appelé au logout — ne vide que la mémoire. La portée dépasse les préférences : `UserStateMutation` inclut `.leave` et `.deleteForUser`, mutations non locales et destructives. Sévérité relevée P1 → P0 par le vérificateur (arbitrage du doublon stores-01, voir « Doublons rattachés »).

**Preuve.** `ConversationStateOutbox.swift` (lecture intégrale `:1-441`) : aucune API de purge ; base `Documents/meeshy_conversation_outbox.db` (`:103-104`) ; réhydratation au boot (`:108`, `:175-219`). Flush `force: true` via `ConversationStore.flushOutbox` (`ConversationStore.swift:317-318`), déclenché au foreground (`BackgroundTransitionCoordinator.swift:~134`) et au socket `didReconnect` (`ConversationStoreSocketBridge.swift:149`) sous le token courant. `ConversationStore.reset()` = mémoire seulement (`:163-166`). `UserStateMutation.swift:34-37` inclut `.deleteForUser` et `.leave`, non couverts par `isLocalOnly` (`:71-72` ne couvre que `.setLocked`), à clés de coalescing UNIQUES (`:63-64`) donc jamais écrasées, dispatchées via `ConversationService.leave` (`ConversationStore.swift:589-592`).

**Impact.** Un `leave` en attente du compte A, rejoué sous le token du compte B sur une conversation commune, retire B de la conversation — perte d'accès cross-compte visible, pas seulement une préférence mutée. Pins/mutes/archives de A appliqués à l'état de B sur toute conversation commune.

**Correctif pas-à-pas.**
1. `ConversationStateOutbox.swift` : ajouter `public func purgeAll()` — nommage miroir de `EngagementOutbox.purgeAll` (`Store/EngagementOutbox.swift:203`) — corps : `pending.removeAll(); indexByCoalescingKey.removeAll();` puis `DELETE FROM conversation_outbox_tasks` dans un `do/catch` loggé (pattern `deleteRow` `:375-388`).
2. `ConversationStore.swift` : rendre `reset()` **async** (source-compatible : `AuthManager.logout` l'`await` déjà à `:488`) et y ajouter `await outbox.purgeAll()` — passer par l'outbox INJECTÉ (`:127`, `:138`) ; ne PAS appeler `ConversationStateOutbox.shared` depuis `AuthManager`.
3. Ne PAS toucher : ni au flush ni au coalescing.

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Store/ConversationStateOutboxTests` (suite existante, utilise `init(dbPath:clock:)` `:114-121`) : `test_purgeAll_emptiesPendingAndIndex` ; `test_purgeAll_deletesRows_rehydrationOnSamePathIsEmpty` (une 2e instance sur le même `dbPath` prouve que le DELETE est durable). `MeeshySDKTests/Store/ConversationStoreTests` : `test_reset_purgesOutboxPending` (enqueue via `apply` → `reset` → `outbox.allPending().isEmpty`).

**Risque de régression.** Faible — le changement de signature de `reset()` est source-compatible avec l'appelant existant ; le flush et le coalescing sont intouchés. (La cartographie corrigée estime l'effort S/M ; l'API tient en quelques lignes, l'effort S d'origine est conservé.)

**Dépendances.** aucune · **Backend requis :** non

### outbox-04 — Aucune mutation sociale ne déclenche de flush après enqueue — un like/post/commentaire créé EN LIGNE ne part qu'au prochain événement incident · **P1** · effort M

**Constat.** Les chemins sociaux sont outbox-first (aucun appel REST direct) mais aucun d'eux n'appelle `OutboxFlushTrigger.flushNow()` après l'enqueue, alors que la documentation du trigger l'exige. Le flusher n'a aucun timer périodique : après un drain complet, le scheduler est désarmé. Une mutation sociale enfilée en ligne reste `.pending` jusqu'à un événement incident.

**Preuve.** Grep exhaustif de `OutboxFlushTrigger.flushNow` côté app : uniquement `MeeshyApp:268` (settings), `ConversationViewModel:2891/3196/3242/3634`, `StoryViewModel:1008`, `ConversationSocketHandler:1146` (reconnect, conversation ouverte seulement), `BackgroundTaskManager:127` — AUCUN site social. `FeedViewModel.swift:373-386` est outbox-first sans REST direct ni flush. La doc d'`OutboxFlushTrigger` exige « Call this right after enqueueing » (`OutboxDispatcher.swift:1144-1150`). Le scheduler réseau ne réagit qu'au front offline→online avec `dropFirst` (`OutboxDispatcher.swift:1199-1204`) ; après un drain complet, `earliestDeferred == nil` (`OutboxFlusher.swift:227-242`) → `schedule(at: nil)` ANNULE le timer (`OutboxDispatcher.swift:1209-1214`).

**Impact.** Session feed pure (aucune conversation ouverte, aucune story vue) : likes/commentaires/posts/blocks restent `.pending` des minutes jusqu'au background ou à un front réseau ; les compteurs des autres utilisateurs ne bougent pas ; `observeOutcome` (rollback R7) attend indéfiniment ; le SyncPill affiche « Synchronisation… » sans cause réseau.

**Correctif pas-à-pas.** Réutiliser les patterns maison (`onSettingsMutationEnqueued` `MeeshyApp:267-269` + les `SendablePassthrough` existants `OfflineQueue:547-556`).
1. SDK, `OfflineQueue.swift` : déclarer `public nonisolated let mutationEnqueued = SendablePassthrough<Void>()` près de `retrySucceeded` (`:547`) ; l'émettre en fin de CHAQUE enqueue réussi : `enqueue(_:)` (après `:1060`), `enqueue(kind:payload:)` (`:1174-1176`), `enqueueReaction`, `enqueueEdit`, `enqueueDelete`, `enqueueAudio`/`enqueueAudios`, `enqueueMedia`, `enqueuePostMedia` (après `refreshPendingCount`).
2. `MeeshyApp.swift`, à côté de `:267-269` : s'abonner au signal avec un debounce ~250 ms → `Task { await OutboxFlushTrigger.flushNow() }` (stocker l'`AnyCancellable` au même endroit que les autres abonnements de boot).
3. LAISSER les appels `flushNow` explicites existants (redondants mais inoffensifs — le claim `claimPending` S1 neutralise la réentrance, `OutboxFlusher.swift:253-273`).
4. Ne PAS ajouter `flushNow` dans les 12 ViewModels — un seul point d'abonnement au lieu de 12 sites fragiles.

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/OutboxUnifiedSignalsTests` (suite dédiée aux signaux, existante) : `test_enqueueKindPayload_emitsMutationEnqueued` ; `test_enqueueMedia_emitsMutationEnqueued` ; `test_enqueueFailure_doesNotEmit`. Côté app : `MeeshyTests/Unit/ViewModels/FeedViewModelTests` : `test_toggleLike_online_triggersOutboxDrainWithoutLifecycleEvent` (expectation sur le signal + compteur en DELTA sur le dispatcher stub, jamais d'absolu — bruit host-app).

**Risque de régression.** Réentrance de flush neutralisée par `claimPending` (S1) + sérialisation GRDB.

**Dépendances.** aucune · **Backend requis :** non

### outbox-05 — Le coalescing `markAsRead` latest-wins détruit les `messageIds` des lots précédents — contrat read-exactness violé offline · **P1** · effort M

**Constat.** L'enqueue coalescé de `markAsRead` supprime les rows précédentes du même anchor avant d'insérer le nouveau payload. Le commentaire qui justifie ce latest-wins (« lire jusqu'au message N couvre 1..N-1 ») est antérieur à la spécification read-exactness, qui dit exactement l'inverse : `messageIds` porte les accusés de lecture EXACTS. Les ids des lots précédents sont détruits.

**Preuve.** `OfflineQueue.swift:1136-1156` — la branche `shouldCoalesce` DELETE toutes les rows pending/failed du même anchor avant l'INSERT ; le commentaire `:1139-1144` contredit frontalement `MutationPayloads.swift:63-76` (« Descendre au dernier message… ne rend pas les cent quatre-vingt-dix intermédiaires lus » ; `messageIds` = accusés EXACTS, `:39-48`). Le dispatcher n'envoie que les `messageIds` du payload survivant (`OutboxDispatcher.swift:296-341`, report à `:304`). `coalescesByAnchor` (`:1194-1207`) inclut `.markAsRead`.

**Impact.** Hors-ligne : lecture de m1-m3 (row A) puis de m7 seul (row B) → la row A est supprimée → le serveur n'apprend jamais que m1-m3 ont été affichés. Coches de lecture inexactes précisément dans le cas (lecture offline) que l'outbox existe pour couvrir.

**Correctif pas-à-pas.**
1. `OfflineQueue.enqueue(kind:payload:)`, dans la transaction `pool.write` (`:1137-1168`), spécialiser `kind == .markAsRead` : décoder `encoded` ET chaque row stale (`OutboxRecord.payload`) en `MarkAsReadPayload` (décodage tolérant — ignorer les rows indécodables) ; unionner les `messageIds` (anciens puis nouveaux, dédupliqués) et fusionner les `messageLanguages` (le nouveau gagne par clé) ; conserver `upToMessageId`/`caughtUpToMessageId`/`language`/`clientMutationId` du payload le PLUS RÉCENT ; ré-encoder et insérer ce payload fusionné.
2. Règle nil-safe : si TOUS les lots sont nil-informés → `messageIds` nil (repli fenêtre historique) ; sinon union des seuls lots informés.
3. `.markStoryViewed` conserve le latest-wins actuel (vu binaire idempotent) — ne PAS généraliser la fusion.
4. Rien à faire à l'enqueue pour le plafond : `MarkAsReadBody.cap` (`OutboxDispatcher.swift:1107-1110`) borne déjà à 200 au dispatch.

**Tests (TDD — RED d'abord).** Nouvelle classe `MeeshySDKTests/Persistence/OfflineQueueMarkAsReadCoalescingTests` (à côté d'`OfflineQueueTests`) : `test_enqueueMarkAsRead_twoOfflineBatches_unionsMessageIds` ; `test_enqueueMarkAsRead_staleRowNilMessageIds_keepsInformedBatchOnly` ; `test_enqueueMarkAsRead_allBatchesNil_staysNil` ; `test_enqueueMarkAsRead_mergesMessageLanguages_newestWinsPerKey` ; `test_enqueueMarkAsRead_keepsNewestCaughtUpToMessageId` — relire la row via `outboxPoolForTesting` (`:2716-2718`) et décoder le payload réel (vérifier le SIGNAL, pas l'enveloppe).

**Risque de régression.** Payload plus gros mais borné à 200 au dispatch ; rows legacy sans `messageIds` gérées par la règle nil-safe.

**Dépendances.** aucune · **Backend requis :** non

### outbox-06 — `OutboxFlusher.flush()` borne à 50 sans boucle ni ré-armement — un backlog > 50 stalle jusqu'au prochain événement incident · **P2** · effort S

**Constat.** Le flush SELECT au plus 50 rows échues ; le calcul d'échéance qui ré-arme le timer ne considère que les rows différées dans le FUTUR. Les rows 51 et suivantes, échues mais jamais tentées, sont invisibles des deux côtés : ni traitées, ni re-planifiées — le timer est annulé.

**Preuve.** `OutboxFlusher.swift:208-217` — SELECT `.pending` échues `.limit(50)` ; `:227-242` — `earliestDeferred` ne considère que `nextAttemptAt > Date()` : les rows 51+ échues (`nextAttemptAt <= now`) sont invisibles → `flush()` retourne nil → `OutboxRetryScheduler.schedule(at: nil)` annule le timer (`OutboxDispatcher.swift:1209-1214`). Aucun autre réveil avant un événement incident. La terminaison d'une boucle corrective est garantie : les rows disposées sortent de la table, les claims perdus passent `.inflight`, les échecs repoussent `nextAttemptAt` dans le futur — un re-SELECT ne revoit aucune row non progressée.

**Impact.** Grosse rafale offline (par exemple 80 lus + 30 likes + messages) : 50 partent au reconnect, le reste attend le foreground ou un nouvel enqueue — désynchronisation visible prolongée.

**Correctif pas-à-pas.**
1. `OutboxFlusher.flush()` : envelopper le bloc SELECT (`:208-221`) + la boucle `processRecord` (`:223-225`) dans `var iterations = 0; repeat { …; iterations += 1 } while pending.count == 50 && iterations < 20` (borne dure 1000 rows par passe, garde anti-pathologie).
2. Conserver le calcul d'`earliestDeferred` APRÈS la boucle, inchangé.
3. Ne PAS toucher : ni au gate réseau BW1 (`:176-187`), ni au reclaim (`:189-207`), ni à `claimPending`.

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/OutboxFlusherTests` (suite existante avec rig pool + dispatcher stub) : `test_flush_backlogOf60ReadyRows_drainsAllInSinglePass` (60 rows pending échues + dispatcher en succès → table vide après UN SEUL `flush()`) ; `test_flush_failingRow_terminates` (row en échec → `nextAttemptAt` futur, le flush termine et retourne l'échéance) ; `test_flush_claimsLostToConcurrentFlusher_doesNotLoop`.

**Risque de régression.** Pas de boucle infinie possible : un échec repousse `nextAttemptAt` dans le futur et sort la row du SELECT ; la borne de 20 itérations protège du cas pathologique.

**Dépendances.** aucune · **Backend requis :** non

### outbox-07 — Double chemin de drain (`retryAll` miroir mémoire vs flusher SQLite) sur les mêmes fronts — envois doublés, miroir jamais purgé côté flusher · **P2** · effort L

**Constat.** Les mêmes fronts (socket connecté, réseau revenu) déclenchent deux drains concurrents : `retryAll()` sur le miroir mémoire, et `flushNow()` sur le flusher SQLite. `retryAll` ne claim pas les rows ; le miroir n'est jamais purgé quand c'est le flusher qui draine — l'item est donc re-envoyé à chaque front suivant, absorbé par la dédup cmid côté gateway. C'est aussi la racine de la course d'outbox-01.

**Preuve.** `OfflineQueue.swift:2555-2571` (socket → `retryAll`) et `:2582-2598` (réseau → `retryAll`) vs `OutboxDispatcher.swift:1195-1205` (réseau → `flushNow`) et `ConversationSocketHandler.swift:1146` (socket → `flushNow`). `retryAll` ne claim pas (`:2492-2516`) ; le miroir `items` n'est purgé QUE par `enqueueDelete` (`:1955`), `dequeue` (`:1961`), `retryAll` (`:2520`), `clearAll` (`:2604`) — le chemin flusher (réconciliation `OutboxDispatcher:679-705`) ne dequeue jamais. Course aggravante d'outbox-01 : si le texte-only de `retryAll` ATTEINT le serveur avant le send-with-attachments du flusher, la dédup cmid fait perdre les attachments même sur le chemin flusher.

**Impact.** Trafic doublé au reconnect, courses non déterministes (racine d'outbox-01), `publishOutcome` ré-émis pour des cmid déjà appliqués — complexité et gaspillage, sans doublon visible pour l'utilisateur (dédup gateway).

**Correctif pas-à-pas.**
1. PRÉREQUIS : outbox-04 livré (câblage signal SDK → `OutboxFlushTrigger.flushNow` app-side).
2. `OfflineQueue.swift` : remplacer le corps des `Task` de `observeConnection` (`:2563-2569`) et `observeNetwork` (`:2590-2595`) par l'émission d'un signal `drainRequested` (`SendablePassthrough<Void>`, ou réutiliser `mutationEnqueued` d'outbox-04 puisque le consommateur est identique) — garder les délais de 200 ms.
3. `MeeshyApp` : mutualiser l'abonnement d'outbox-04 (même sink debouncé).
4. Puis retirer `retryAll`/`setRetrySend`/`onRetrySend`/le miroir `items` (+ les checks `maxQueueSize` `:1058/:1437/:1575`) et le handler `MeeshyApp:288-317` ; limiter `migrateToOutbox` (`:2632`) aux tests ; CONSERVER `publishOutcome`/`retrySucceeded`/`retryExhausted` (utilisés par le flusher).
5. Dérouler derrière les suites existantes `OfflineQueueTests` + `ConversationSocketHandlerTests`.

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/OfflineQueueTests` : `test_networkEdge_emitsDrainSignal_andDoesNotCallRetrySend` (stub `setRetrySend`, compteur en delta = 0, signal reçu) ; `test_socketEdge_emitsDrainSignal`. `MeeshyTests/Unit/ViewModels/ConversationSocketHandlerTests` : `test_reconnect_flushesOutboxExactlyOncePerEdge` (compteur en delta sur le flush injecté).

**Risque de régression.** Le miroir servait de filet pré-pool — obsolète (`poolNotConfigured` refuse l'enqueue). Dérouler derrière les tests de reconnexion existants.

**Dépendances.** outbox-04, outbox-01 · **Backend requis :** non

### outbox-08 — Publication de story sans clé d'idempotence serveur — story dupliquée sur crash-rejeu · **P2** · effort M

**Constat.** Le claim de `StoryPublishQueue` est volatile par design : après un kill, l'item redevient éligible au drain de boot et l'executor rejoue tout le pipeline avec un état d'upload FRAIS (reprise à la slide 0). La création de story part sans aucun header d'idempotence. Le vérificateur a corrigé deux erreurs factuelles du plan initial : le gateway est DÉJÀ prêt (route `POST /posts` wrappée `withMutationLog`), et `tempStoryId` est inutilisable comme header (format `cmid_<uuid v4>` imposé sous peine de 400) ; de plus une story multi-slides émet un POST PAR SLIDE, donc il faut un cmid persisté PAR SLIDE. Le correctif est iOS-only.

**Preuve.** Claim volatile auto-documenté (`StoryPublishQueue.swift:332-342`) ; l'executor rejoue le pipeline avec un `StoryUploadState` frais — `publishedPostIds` vide, reprise à la slide 0 (`StoryViewModel.swift:213-270` + résumé `:1726-1728`) ; `PostService.createStory` (`PostService.swift:327-336`) poste via `api.post` SANS header ni cmid ; le kind `.publishStory` jette 501 au dispatcher (`OutboxDispatcher.swift:87-100`). Côté gateway : `POST /posts` est DÉJÀ wrappée `withMutationLog` kind `createPost` avec refetch `onDuplicate` (`services/gateway/src/routes/posts/core.ts:74-89`) ; le hook global REJETTE en 400 tout header hors `^cmid_<uuid v4 lowercase>$` (`middleware/clientMutationId.ts:26-27`, `:70-78`). Une story multi-slides émet un POST par slide (`StoryViewModel:1871-1879`).

**Impact.** App tuée entre la création serveur et le dequeue (ou réponse perdue) : rejeu au boot → story publiée en double, visible par tous les contacts.

**Correctif pas-à-pas (iOS uniquement — aucun travail gateway).**
1. `StoryPublishQueueItem` (`StoryPublishQueue.swift`) : ajouter `var slideMutationIds: [String]?` Codable-optionnel (`decodeIfPresent`, rétro-compatible comme `retryCount` `:87`), peuplé à l'enqueue avec un `cmid_<uuid>` par slide (`ClientMutationId.generate()`).
2. `PostService.createStory` (`PostService.swift:327-336`) : ajouter un paramètre `clientMutationId: String? = nil` ; si présent, passer par `api.requestWithHeaders(... headers: ["X-Client-Mutation-Id": cmid])` (pattern `OutboxDispatcher:206-211`).
3. `runStoryUpload` (`StoryViewModel.swift:1711+`) : recevoir les cmids par slide (depuis `StoryUploadState` pour le chemin online, depuis `item.slideMutationIds` pour `executeQueuedPublish` `:213-252`) et passer `slideCmids[slideIdx]` à `createStory`.
4. Item legacy sans `slideMutationIds` : publier sans header (`withMutationLog` no-op sans cmid — comportement actuel, toléré).
5. Long terme inchangé : Tier C (fusion dans l'outbox unifié).

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/StoryPublishQueueTests` (existante) : `test_enqueue_generatesOneMutationIdPerSlide_cmidFormat` ; `test_decode_legacyItemWithoutSlideMutationIds_succeeds`. `MeeshySDKTests/Services` (MockAPIClient) : `test_createStory_withClientMutationId_sendsHeader` ; `test_createStory_withoutCmid_omitsHeader`. Gateway : déjà couvert par les tests jest `withMutationLog`/`createPost` (double POST même cmid → un seul post).

**Risque de régression.** Aucun sur le chemin nominal : le header est optionnel et les items legacy publient comme aujourd'hui.

**Dépendances.** aucune · **Backend requis :** non (le gateway est déjà prêt)

### outbox-09 — `StoryPublishQueue.retryDelays` déclaré mais jamais lu — aucune porte temporelle entre passes, budget brûlé par flapping · **P2** · effort M

**Constat.** Le tableau de délais de retry est déclaré mais jamais consulté : chaque front socket déclenche une passe qui consomme une tentative sur l'item de tête, sans aucune porte temporelle. Un réseau instable épuise le budget de retries en quelques minutes et envoie l'item en retry manuel alors qu'un backoff l'aurait sauvé.

**Preuve.** Auto-documenté `StoryPublishQueue.swift:203-210` (« DÉCLARÉ MAIS JAMAIS LU — il n'existe aucune porte temporelle entre deux passes ») ; seuls freins : `maxConsecutiveRetryableFailures = 2` (`:217`) et `maxItemsPerSweep = 10` (`:225`). `retryCount += 1` à chaque échec retryable (`:523`), bascule en `failedItems` à `maxRetries = 5` (`:202`, `:526-533`) ; chaque front socket déclenche `processNext` (`:626-641`). Cinq flaps réseau suffisent.

**Impact.** L'item de tête part en `failedItems` (retry manuel requis) après quelques minutes de réseau instable, alors que la publication aurait abouti avec un simple backoff.

**Correctif pas-à-pas.**
1. `StoryPublishQueueItem` : ajouter `var nextAttemptAt: Date?` Codable-optionnel (`decodeIfPresent`, pattern `retryCount` `:87`).
2. À chaque échec retryable (zone `:523`) : `items[idx].nextAttemptAt = Date().addingTimeInterval(Self.retryDelays[min(items[idx].retryCount, Self.retryDelays.count - 1)])` — `retryDelays` devient enfin LU ; retirer le TODO `:205-209`.
3. `processNext` : sauter un item non échu SANS l'inclure dans `attemptedInSweep` ni `consecutiveRetryableFailures` (même traitement qu'un claim perdu, `:222-224`).
4. Ajouter un paramètre `force: Bool = false` sur `processNext` ; le drain de `setPublishHandler` (`:274-281`) et le drain de boot passent `force: true` (ignorent la porte) ; les fronts socket restent `force: false`.
5. `retryFailedItem` force aussi (action utilisateur explicite).

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/StoryPublishQueueSweepTests` (suite existante des passes) : `test_processNext_itemNotDue_skippedWithoutBurningAttempt` ; `test_processNext_force_bypassesTimeGate` ; `test_retryableFailure_setsNextAttemptAtFromRetryDelays` (clock injectable) ; `test_decode_legacyItemWithoutNextAttemptAt_succeeds`. Fixtures à dates RELATIVES, jamais absolues.

**Risque de régression.** Reprise plus lente après une vraie panne longue — borné par le drain forcé au boot et à `setPublishHandler`.

**Dépendances.** aucune · **Backend requis :** non

### outbox-10 — Files parallèles à l'outbox pour le même domaine (SettingsActionQueue, PendingStatusQueue) — Single Source of Truth violé, sans cmid ni SyncPill · **P2** · effort L

**Constat.** Le profil offline passe par `SettingsActionQueue` alors que le kind outbox `.updateProfile` et son bras dispatcher existent — sans aucun producteur. `PendingStatusQueue` poste un mark-read SANS corps (repli fenêtre gateway qui sur-déclare, à l'opposé du corps exact du dispatcher). `deleteComment` part en appel direct. Deux précisions du vérificateur : (a) le payload existant NE SUFFIT PAS — il ne porte que 3 des 7 champs édités par `ProfileView` ; (b) `likeComment` n'est pas un pur appel direct mais socket-first avec repli REST — hors-ligne les deux échouent, la perte offline tient.

**Preuve.** `ProfileView.swift:838-848` passe par `SettingsActionQueue` alors que `dispatchUpdateProfile` existe (`OutboxDispatcher.swift:202-237`) sans AUCUN producteur (grep `enqueue .updateProfile` : zéro). `UpdateProfilePayload`/`UpdateProfileFieldsBody` ne portent que `displayName`/`bio`/`avatarUrl` (`:205-224`) alors que `ProfileView` édite aussi `firstName`/`lastName`/`systemLanguage`/`regionalLanguage`/`customDestinationLanguage` (`:825-833`). `PendingStatusQueue.swift:57-64` poste un mark-read sans corps (vs corps exact `OutboxDispatcher:296-341`). `deleteComment` part en DIRECT (`PostDetailViewModel:819`, `FeedCommentsSheet:1690`) ; `likeComment` = socket-first + repli REST (`PostDetailViewModel:465-477`).

**Impact.** Deux sémantiques de retry/idempotence/visibilité pour la même donnée ; le fallback des lus dégrade l'exactitude des coches ; dette déjà à l'origine du P0 outbox-02 (absence de purge logout) ; suppression et like de commentaire perdus hors-ligne.

**Correctif pas-à-pas.**
1. Étendre `UpdateProfilePayload` (`MutationPayloads.swift`) + `UpdateProfileFieldsBody` (`OutboxDispatcher.swift:221-224`) avec `firstName`/`lastName`/`systemLanguage`/`regionalLanguage`/`customDestinationLanguage` (mêmes clés que `UpdateProfileRequest` / `PATCH /users/me`).
2. `ProfileView.saveProfile` offline (`:838-848`) : remplacer le `SettingsAction` par `OfflineQueue.enqueue(.updateProfile, payload:)` — le flush post-enqueue vient d'outbox-04.
3. `RootView:2151-2152` : re-brancher la bannière sur `OfflineQueue.pendingCountPublisher`.
4. Migration en vol : au boot, drainer une dernière fois `settings_action_queue.json` (pattern `MigrateLegacyQueues`/`StoryQueueMigrator`) avant de retirer le type.
5. `deleteComment`/`toggleLikeComment` : brancher sur leurs kinds existants (producteurs dans `PostDetailViewModel` + `FeedCommentsSheet`) — ou documenter le choix produit si la perte offline est assumée (question ouverte n° 2).
6. `PendingStatusQueue` : restreindre au fallback `poolNotConfigured` (`ConversationViewModel:3636`) ou supprimer.
7. Ne PAS faire dans la même PR qu'outbox-02 — le `clearAll` au logout reste nécessaire tant que la file existe.

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/MutationPayloadsTests` : roundtrip du payload étendu + rétro-compat `decodeIfPresent`. `MeeshyTests` : `test_dispatchUpdateProfile_sendsLanguageFields` (stub APIClient, vérifier le CORPS encodé — le signal, pas l'enveloppe) ; `test_saveProfile_offline_enqueuesUpdateProfileKind` (logique extraite pure) ; `test_bootMigration_drainsLegacySettingsActionFileOnce`.

**Risque de régression.** Migration de file en vol : consommer les rows JSON existantes avant suppression du type ; re-branchement de la bannière RootView à vérifier visuellement.

**Dépendances.** outbox-02, outbox-04 · **Backend requis :** non

### outbox-11 — Résidus cross-compte non purgés au logout : impressions (UserDefaults standard) + PendingStatusQueue — `pending_mark_read` délégué à appgroup-01 · **P3** · effort S

**Constat.** Deux résidus survivent au logout : la file d'impressions (`UserDefaults` standard, clé sans userId, rechargée et rejouée dès l'init) et `PendingStatusQueue` (`clearAll()` existe mais n'est appelé nulle part au logout). Le périmètre a été réduit par le vérificateur : la clé App Group `pending_mark_read` du widget est couverte par le canonique appgroup-01 (fichier 07) — ne pas la doubler ici.

**Preuve.** `ImpressionBatcher.swift:60` — `storageKey` sans userId, pending rechargé et rejoué dès l'init (`:61-66`) ; `PendingStatusQueue.clearAll` (`:74-76`) sans appelant logout (grep : aucun) ; `wireOutboxLogoutHook` (`DependencyContainer.swift:130-147`) ne purge que les tables messages.

**Impact.** Impressions du compte A comptées pour le compte B (métriques) ; mark-read de A rejoués sous B (403/404 probables, conservés en file et re-tentés à chaque foreground).

**Correctif pas-à-pas.**
1. `DependencyContainer.wireOutboxLogoutHook` (`:130-147`), dans le sink de logout : ajouter `await PendingStatusQueue.shared.clearAll()` + purge des clés `meeshy.impressions.pending.*` (`UserDefaults.standard.dictionaryRepresentation().keys.filter { $0.hasPrefix("meeshy.impressions.pending.") }.forEach(removeObject)`) — extraire la purge en helper pur testable.
2. Ne PAS toucher : `pending_mark_read` (App Group — propriété du canonique appgroup-01, fichier 07).
3. Option : préfixer le `storageKey` d'`ImpressionBatcher` par userId (l'init accepte déjà des `defaults` injectés, `:54`).

**Tests (TDD — RED d'abord).** `MeeshyTests` : `test_purgeImpressionKeys_removesOnlyPrefixedKeys` (helper pur + `UserDefaults(suiteName:)` jetable) ; `test_pendingStatusQueue_clearAll_emptiesStorage`. Vérifier qu'aucun test existant ne dépend de la survie des impressions au logout.

**Risque de régression.** Nul.

**Dépendances.** appgroup-01 (fichier 07 — pour le volet App Group uniquement ; le présent correctif s'applique indépendamment) · **Backend requis :** non

### outbox-12 — `OfflineQueue.clearAll()` ne supprime que les rows du miroir mémoire — API trompeuse · **P3** · effort S

**Constat.** `clearAll()` construit les ids à supprimer depuis le miroir mémoire `items` (vide après un relaunch, jamais réhydraté) et ne DELETE que les clés préfixées `ofq_` : les rows des sessions antérieures et tous les kinds non-message (`ofqm_`) survivent. Le logout production n'y passe pas — l'impact est l'API trompeuse pour un futur appelant.

**Preuve.** `OfflineQueue.swift:2602-2622`. Le logout réel passe par `MessagePersistenceActor.clearAllMessagesForLogout` (`:171-181`, `DELETE FROM outbox` complet, câblé `DependencyContainer:140`). Appelants de `clearAll` : uniquement des tests (`QueueMigrationTests:13/17`, `OutboxUnifiedSignalsTests:19/24`, `UserPreferencesManagerTests:360/382`).

**Impact.** Un futur appelant (reset, tests) laisserait des rows orphelines re-dispatchées — l'API ment sur son nom.

**Correctif pas-à-pas.**
1. `OfflineQueue.clearAll()` : remplacer la boucle `deleteOne` (`:2612-2617`) par `try await pool.write { try $0.execute(sql: "DELETE FROM outbox") }` ; conserver `items.removeAll()`, `outcomeTombstones.removeAll()` et `refreshPendingCount()`.
2. Vérifier les 3 suites de tests appelantes — elles utilisent `clearAll` pour l'ISOLATION ; le wipe complet la renforce (aucune ne dépend de la sémantique partielle).
3. Option : sweep des dossiers `pending-media`/`pending-audio` orphelins via `pendingLocalFileAbsolutePaths` avant le DELETE.
4. À séquencer avec outbox-07 : si le miroir `items` disparaît, `clearAll` se réduit au DELETE + tombstones.

**Tests (TDD — RED d'abord).** `MeeshySDKTests/Persistence/OfflineQueueTests` : `test_clearAll_removesNonMessageKindsAndPriorSessionRows` (insérer directement une row `ofqm_` + une row `ofq_` orpheline via `outboxPoolForTesting` en contournant l'enqueue, `clearAll` → `fetchCount == 0`, `pendingCount` publie 0).

**Risque de régression.** Vérifier que les trois suites appelantes restent vertes (elles le devraient : le wipe complet renforce leur isolation).

**Dépendances.** outbox-07 (séquencement seulement — applicable avant lui) · **Backend requis :** non

## Doublons rattachés

| Doublon | Canonique | Apport au canonique |
|---|---|---|
| stores-01 (dimension stores & viewmodels, fichier 05) | **outbox-03** (ici) | A imposé le relèvement de sévérité P1 → P0 et l'extension de portée : `UserStateMutation` inclut `.leave`/`.deleteForUser`, non-localOnly (`UserStateMutation.swift:34-37`, `:63-64`), à clés de coalescing uniques donc jamais écrasées — un `leave` de A rejoué sous B retire B d'une conversation commune (perte d'accès, pas une simple préférence). |
| outbox-11, volet clé App Group `pending_mark_read` (`WidgetActionFlusher.swift:20`) | → voir **appgroup-01** (fichier 07) | Le wipe App Group complet au logout est porté par appgroup-01 (`NotificationCoordinator.reset` ne purge que `unread_count`) ; le périmètre d'outbox-11 a été réduit aux impressions + PendingStatusQueue pour éviter un double correctif. |

## Écartés après vérification

Aucun. Les 12 écarts de cette dimension ont été confirmés ou ajustés par la vérification adversariale (0 REFUTED) ; toutes les références `fichier:ligne` citées ont été retrouvées exactes au HEAD `901e92589`. Les ajustements (outbox-03, outbox-08, outbox-10, outbox-11) sont intégrés dans les fiches ci-dessus.

## Questions ouvertes

1. **outbox-01** : confirmer E2E que `POST /conversations/:id/messages` accepte un corps `content` non vide sans attachments (établi structurellement côté iOS ; la preuve gateway scellerait définitivement le scénario P0).
2. **Kinds sans producteur** : `.deleteComment`/`.toggleLikeComment`/`.createConversation` ont des bras dispatcher prêts mais aucun producteur — dette Wave 1 inachevée ou choix produit ? `deleteComment` et `likeComment` partent aujourd'hui en direct (perte offline) ; trancher avant l'étape 5 d'outbox-10.
3. **Sessions anonymes** : `OutboxDispatcher` passe par `APIClient` (Bearer) — le rejeu outbox fonctionne-t-il sous `X-Session-Token` ? À croiser avec la dimension sockets/auth (fichier 03).
4. **Harmonisation des drains** : `StoryPublishQueue.observeConnection` garde un `dropFirst()` (front socket uniquement, `StoryPublishQueue.swift:626-641`), contrairement à la règle « une file qui survit à un kill ne dépend pas d'un front » verrouillée par `QueueDrainReachabilityGuardTests` pour SettingsActionQueue — couvert par le drain de `setPublishHandler` au boot, mais à harmoniser.
