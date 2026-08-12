# 08 — Démarrage et cycle de vie

> Périmètre : cold start (process launch → premier contenu), transitions foreground/background, BGTasks, kill recovery, sessions anonymes. Méthodologie et sévérités : voir README.md. Architecture de référence : 00-etat-des-lieux.md. HEAD audité : 901e92589.

## Rappel d'architecture (renvoi à 00)

Le cold start ouvre et migre les deux bases SQLite dans `MeeshyApp.init` (main thread), puis le `.task` de boot enchaîne restauration d'environnement, `CacheCoordinator.start()`, `OfflineQueue.configure`, `bootRecovery()` de l'outbox et `checkExistingSession()` (cache-first : user Keychain affiché avant tout réseau, splash gaté avec attente socket bornée 1,5 s et fast-path offline). Le flip `isAuthenticated` déclenche `adaptiveOnChange` (sockets, push, VoIP, E2EE). Le passage en background est orchestré par `BackgroundTransitionCoordinator` sous `beginBackgroundTask` (flush cache → suspend des sockets → planification BGTasks gatée `authToken`) ; le retour au premier plan passe par `handleForegroundTransition` (gaté `isAuthenticated`) qui reconnecte les sockets et lance le delta sync. Trois BGTasks existent : conversation-sync (~15 min), message-prefetch (~30 min), cache-background-flush (au terminate). Détail complet : 00-etat-des-lieux.md §2 et §8.

## Écarts retenus

### startup-03 — requireReauthentication détruit silencieusement l'outbox en attente et tout le cache, même pour le même utilisateur · **P2** · effort S (ajusté depuis M : la rétention par userId est sortie du périmètre, voir plus bas)

**Constat.** `requireReauthentication` flippe `isAuthenticated = false` sans distinguer le motif (logout volontaire vs session invalidée par le serveur). Ce flip déclenche la purge complète de l'outbox et des messages on-device, ainsi que le reset de tout le cache et des sessions — sans compter les lignes en attente, sans aucun signal à l'utilisateur. Aucun publisher `sessionInvalidated` n'existe dans le repo (grep vide).

**Preuve.**
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift:820-828` : `requireReauthentication` flippe `isAuthenticated=false` sans distinction de motif. Déclencheurs vérifiés : revalidation `/auth/me` du cold start sur erreur `.auth` (656-659), `refreshCurrentUserProfile` à chaque foreground sur `.auth` (688-691, appelé depuis `MeeshyApp.swift:570`), `isActive == false` (915-917), `refreshSession` en échec (942-944, 962-965).
- Le flip déclenche `wireOutboxLogoutHook` (`apps/ios/Meeshy/Core/DependencyContainer.swift:130-147` : filtre `!isAuth` → `clearAllMessagesForLogout()`, qui DELETE outbox + messages + 5 tables enfants, `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift:171-181`) ET la branche else de `MeeshyApp.adaptiveOnChange` (`apps/ios/Meeshy/MeeshyApp.swift:693-730` : `CacheCoordinator.reset()` :711, `SessionManager.clearSessions()` :706, VoIP unregister :717).
- La purge inconditionnelle est un choix délibéré anti fuite cross-compte (commentaires `DependencyContainer.swift:82-86` et `160-170`) — mais rien, nulle part, ne couvre le silence total envers l'utilisateur ni l'absence de distinction volontaire/invalidé.

**Impact.** Scénario : l'utilisateur compose des messages hors-ligne (outbox `.pending`), son token est révoqué côté serveur (changement de mot de passe sur un autre appareil, session expirée). Au prochain foreground, `/auth/me` → `.auth` → outbox et cache détruits sans aucun signal. L'utilisateur se reconnecte (même compte) : messages en attente perdus, app à froid complet, et il ignore que ses envois ont disparu. La sévérité reste P2 (pas P0/P1) : les messages perdus étaient de toute façon inenvoyables sous la session morte (le flush aurait produit un 401), et le scénario exige token révoqué + outbox non vide.

**Correctif pas-à-pas.**
1. `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift` : ajouter `public let sessionInvalidated = PassthroughSubject<Void, Never>()` (près de `tokenDidRotate`) ; dans `requireReauthentication` (820-828), émettre `sessionInvalidated.send(())` AVANT le flip `isAuthenticated = false`.
2. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` : ajouter `public func pendingOutboxCount() async throws -> Int` (SELECT COUNT(*) FROM outbox WHERE status IN ('pending','inflight')).
3. `apps/ios/Meeshy/Core/DependencyContainer.swift`, `wireOutboxLogoutHook` (130-147) : s'abonner aussi à `sessionInvalidated` pour armer un flag one-shot « invalidation » ; dans le sink logout, lire `pendingOutboxCount()` AVANT `clearAllMessagesForLogout()` ; si count > 0 ET flag invalidation armé → `FeedbackToastManager.shared.showError(String(localized:))` « X messages non envoyés ont été annulés — reconnectez-vous ». `FeedbackToastManager` est le bon étage : il s'agit d'un état/action local, pas d'un événement réseau entrant.
4. **Ne PAS toucher :** la purge elle-même ni son inconditionnalité — c'est l'invariant anti fuite cross-compte (Q3) délibérément posé dans `DependencyContainer.swift:82-86` et `160-170`.
5. La rétention de l'outbox par userId (option SOTA : taguer les lignes, ne purger que si un AUTRE userId se connecte, rejouer au re-login du même) est un **lot séparé**, à coordonner avec grdb-01/stores-05 qui étendent le même hook aux tables feed. C'est ce retrait du périmètre qui ramène l'effort de M à S.

**Tests (TDD — RED d'abord).**
- `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/` : `test_refreshCurrentUserProfile_authError_emitsSessionInvalidatedBeforeAuthFlip` (mock authService jetant `.auth` ; capturer la valeur de `isAuthenticated` au moment de l'émission) ; `test_logout_doesNotEmitSessionInvalidated`.
- `MeeshySDKTests/Persistence/` : `test_pendingOutboxCount_countsPendingAndInflightOnly`.
- App `MeeshyTests/Unit/Services/` : `test_outboxLogoutHook_sessionInvalidatedWithPendingRows_surfacesToast` ; `test_outboxLogoutHook_voluntaryLogout_purgesWithoutToast` — compteurs mesurés en **delta**, jamais en absolu (leçon « host-app noise »).

**Risque de régression.** Faible : la purge et son déclenchement sont strictement inchangés, on ajoute un signal en amont. Garde-fous : la distinction volontaire/invalidé doit rester étanche (pas de rétention cross-compte introduite par ce lot) ; re-passer les tests multi-comptes Q3 existants.

**Dépendances.** grdb-01, stores-05 (coordination du hook partagé — le lot rétention par userId en dépend, pas ce correctif minimal) · **Backend requis :** non

---

### startup-05 — Pas de kill-recovery pour la session invitée : contexte Keychain irrécupérable sans re-taper le lien · **P2** · effort S

**Constat.** Le contexte de session anonyme est persisté en Keychain et survit au process — c'est voulu (le delete n'intervient qu'au dismiss volontaire). Mais l'UNIQUE site de lecture est `handleGuestDeepLink`, atteint seulement sur un deep link `.joinLink`/`.chatLink`. Au boot non-authentifié sans deep link pendant, rien n'est restauré : l'invité atterrit sur LoginView alors que sa session valide dort en Keychain.

**Preuve.**
- Grep exhaustif : l'unique appelant de `AnonymousSessionStore.load` est `handleGuestDeepLink` (`apps/ios/Meeshy/MeeshyApp.swift:905`), activé seulement sur `.joinLink`/`.chatLink`.
- La branche boot non-authentifiée (`MeeshyApp.swift:529-531`) n'appelle que `handleGuestDeepLink(deepLinkRouter.pendingDeepLink)` — sans deep link pendant, aucune restauration.
- `AnonymousSessionStore` (`apps/ios/Meeshy/Features/Main/Services/AnonymousSessionStore.swift:39-51`) : `load(linkId:)` exige le `linkId`, aucune API d'énumération des sessions sauvegardées.
- La persistance au-delà du process est VOULUE : `save` (:22-37) appelé par `onSessionCreated` (`MeeshyApp.swift:131-136`), `delete` appelé uniquement au dismiss volontaire (880-888). Aucune décision contraire dans `decisions.md` : c'est un trou, pas un choix documenté.

**Impact.** Un invité en pleine conversation dont le process est tué (OS, mémoire, reboot) relance l'app sur LoginView ; il doit retrouver et re-taper le lien d'invitation pour revoir sa conversation. Le principe « Offline Graceful Degradation » n'est pas tenu pour le parcours invité.

**Correctif pas-à-pas.**
1. `apps/ios/Meeshy/MeeshyApp.swift`, `onSessionCreated` (131-136) : après un `AnonymousSessionStore.save(ctx)` réussi, écrire `UserDefaults.standard.set(guestSession.identifier, forKey: "meeshy.guest.lastActiveLinkId")`. Le linkId n'est pas une donnée sensible ; le token, lui, reste en Keychain.
2. `dismissGuestSession` (880-888) : `removeObject(forKey:)` sur cette clé — le dismiss volontaire efface aussi le pointeur.
3. Branche boot non-authentifiée (529-531) : si `deepLinkRouter.pendingDeepLink == nil`, lire `lastActiveLinkId` ; si non-nil ET `AnonymousSessionStore.load(linkId:)` non-nil → `activeGuestSession = GuestSession(identifier:context:)` ; sinon no-op (LoginView). Le deep link pendant garde priorité absolue.
4. **Ne PAS toucher :** la garde `!authManager.isAuthenticated` du `fullScreenCover` (`MeeshyApp.swift:125`) — une session authentifiée restaurée prime toujours sur la session invitée.
5. Extraire la décision de restauration en helper pur statique (entrées : `pendingDeepLink`, `isAuthenticated`, `lastLinkId`, loader) pour la testabilité.
6. `AnonymousSessionStore` : inchangé.

**Tests (TDD — RED d'abord).**
- `MeeshyTests` : `test_resolveGuestRestore_noDeepLinkWithSavedLink_returnsRestore` ; `test_resolveGuestRestore_pendingDeepLink_prefersDeepLink` ; `test_resolveGuestRestore_authenticated_returnsNone` ; `test_dismissGuestSession_clearsLastActiveLinkId`.
- Vérification manuelle simulateur : créer une session invitée → kill du process (`meeshy.sh stop`) → relaunch → conversation invitée restaurée ; dismiss → relaunch → LoginView.

**Risque de régression.** Faible — chemin purement additif ; la garde du fullScreenCover conserve la priorité de la session authentifiée, et un visiteur sans session sauvegardée reste sur le chemin actuel (no-op).

**Dépendances.** net-02 (canonique de startup-01, fichier 06) — sans le resume socket anonyme, la session invitée restaurée serait vivante mais sans temps réel après un background · **Backend requis :** non

---

### startup-04 — Deux bases SQLite ouvertes + migrées synchronement sur le main thread au boot — risque latent non mesuré, instrumentation d'abord · **P3** (ajusté depuis P2) · effort S (ajusté depuis M : le détachement et le gate de readiness sont retirés du périmètre)

**Constat.** Le mécanisme est exactement celui décrit : `MeeshyApp.swift:11` (`private let dependencies = DependencyContainer.shared`) évalue l'init `@MainActor` qui exécute `MessageDatabaseMigrations.runAll` + `FeedDatabaseMigrations.runAll` synchronement ; `MeeshyApp.swift:72` (`CacheBackgroundFlushTask()`) touche `CacheCoordinator.shared` via le défaut `coordinator: .shared`, donc `AppDatabase.shared` (ouverture + migration synchrones). MAIS l'impact P2 initial était spéculatif, d'où la rétrogradation P3 : migrations nominales = simple check `user_version` (no-op) ; le WAL replay est borné par `PRAGMA journal_size_limit = 16 MiB` + `wal_autocheckpoint = 1000` ; les deux chemins ont déjà un recovery anti crash-loop ; aucune mesure prod ne montre un boot lent. Le risque latent est réel (une future migration ALTER/backfill coûteuse s'exécuterait avant le premier frame → watchdog 0x8BADF00D), mais ce n'est pas un bug actif.

**Preuve.**
- `apps/ios/Meeshy/Core/DependencyContainer.swift:61-64` : `runAll` des deux jeux de migrations dans l'init `@MainActor`, déclenché par `apps/ios/Meeshy/MeeshyApp.swift:11`.
- `MeeshyApp.swift:72` → `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBackgroundFlushTask.swift:38` (défaut `coordinator: .shared`) → `CacheCoordinator.swift:249` → `packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift:16-22` (« makeWriter opens, migrates, AND recovers »), `openOrRecover` :50-69.
- Bornes qui neutralisent l'impact immédiat : `DependencyContainer.swift:350-351` (journal_size_limit 16 MiB, wal_autocheckpoint 1000) ; recovery `openWithRecovery` :182-226.

**Impact.** Aucun symptôme utilisateur mesuré aujourd'hui. Le jour où une vraie migration coûteuse est livrée sans précaution, le lancement peut dépasser le watchdog et produire un crash-loop perçu — précisément la classe de bug que le recovery visait à éliminer.

**Correctif pas-à-pas.**
1. `apps/ios/Meeshy/Core/DependencyContainer.swift` : entourer les lignes 61-64 d'un `OSSignposter` (catégorie boot) ; idem autour du premier accès à `AppDatabase.shared` (`AppDatabase.makeWriter`).
2. Vérifier que `MeeshyMetricsSubscriber` (MetricKit, déjà branché) remonte bien les diagnostics de durée de lancement — sinon ajouter la métrique.
3. Documenter dans `apps/ios/decisions.md` : toute future migration coûteuse (ALTER/backfill) DOIT embarquer le pattern « pool ouvert, `runAll` hors main, gate de readiness async attendu par `OfflineQueue.configure` / `MessagePersistenceActor.start` / le `.task` de boot ».
4. **Ne PAS toucher :** ne pas détacher `FeedDatabaseMigrations` aujourd'hui, ne pas introduire le gate de readiness sans mesure — le risque d'une lecture pré-migration dépasse le gain non mesuré.
5. Ré-escalader en P2 avec le pattern complet si le p99 mesuré dépasse ~200 ms.

**Tests (TDD — RED d'abord).** Pas de test RED pour l'instrumentation (les signposts relèvent de l'observabilité). Si l'étape readiness est un jour déclenchée : étendre `DependencyContainerTests` (apps/ios/MeeshyTests/Unit/Services/) — `test_ready_blocksReadersUntilMigrationsComplete` ; `test_offlineQueueConfigure_awaitsReadiness`. Toute garde de source éventuelle sera ancrée sur le COMPORTEMENT, jamais sur une fenêtre de caractères fixe.

**Risque de régression.** Quasi nul pour l'instrumentation seule. Le risque élevé (lecture d'un schéma non migré) n'existe que si l'on détache les migrations — précisément ce que ce correctif interdit tant que la mesure n'est pas faite.

**Dépendances.** aucune · **Backend requis :** non

---

### startup-07 — Travail dupliqué et réseau superflu à chaque cold start authentifié (bootRecovery ×2, push ×2, E2EE upload, VoIP reregister) · **P3** · effort S

**Constat.** Cinq sites font un travail redondant à chaque lancement avec session restaurée : `bootRecovery()` est détaché deux fois ; la permission push et `refreshUnreadCount` s'exécutent dans la séquence détachée du `.task` ET dans le `onChange(isAuth)` ; le `forceReregister()` VoIP et la génération + upload du bundle E2EE partent à CHAQUE flip `isAuthenticated` — donc à chaque cold start restauré, pas seulement au login frais.

**Preuve.**
- `apps/ios/Meeshy/MeeshyApp.swift:280-286` : premier `bootRecovery` détaché ; :398-402 : re-exécution en tête du `Task.detached` du flusher (avant `flusher.flush()` :403-417 — le second suffit et préserve l'ordre recovery→flush).
- :493-501 (via `runPushBootstrapSequence` :814-820) ET :669-670 : `requestPushPermissionIfNeeded` + `refreshUnreadCount` en double.
- :677 : `VoIPPushManager.forceReregister()` ; :678-685 : `generatePublicBundle` + `uploadBundle` E2EE, à chaque flip.
- Le flip au cold start restauré est prouvé : `checkExistingSession` pose `isAuthenticated = true` (`packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift:613`) depuis le `.task` (:445) → `adaptiveOnChange` (:624) fire.
- `requestPushPermissionIfNeeded` est partiellement idempotent (`checkAuthorizationStatus` d'abord :797-804), mais `refreshUnreadCount` ×2 = 2 requêtes réelles, et l'upload E2EE / le reregister VoIP sont des POST réels non gardés par marqueur.

**Impact.** 2 à 4 requêtes réseau et un scan SQLite inutiles par lancement ; contention avec le chemin critique du splash sur réseau dégradé.

**Correctif pas-à-pas.**
1. Supprimer le `Task.detached` bootRecovery de `MeeshyApp.swift:280-286` (le second, à 398-402, est documenté :381-397 comme couvrant le cold start et précède le flush).
2. `AuthManager` : poser un flag `public private(set) var didRestoreExistingSession`, mis à `true` dans `checkExistingSession` juste avant `isAuthenticated = true` (:613), remis à `false` en tête de `login()`/`register()`/`validateMagicLink`.
3. `MeeshyApp.adaptiveOnChange(isAuth == true)` : gater :669-670 (push + unread), :677 (`forceReregister`) et :678-685 (E2EE) sur `!authManager.didRestoreExistingSession` — le cold start garde les versions du `.task` (:493-501).
4. E2EE : en plus du flag, marqueur UserDefaults `meeshy.e2ee.bundlePublished.<userId>.<fingerprint identityKey>` vérifié avant upload et posé après succès ; la rotation de token garde son chemin propre (`applySession` :798-802, `tokenDidRotate`).
5. **Ne PAS toucher :** `forceReconnect` des sockets (:661-662), NotificationCoordinator/GapResync/StoryPublishService/ConversationStoreSocketBridge — idempotents et nécessaires au restore.

**Tests (TDD — RED d'abord).**
- `MeeshySDKTests/Auth/` : `test_checkExistingSession_restoredSession_setsDidRestoreFlag` ; `test_freshLogin_clearsDidRestoreFlag`.
- App `MeeshyTests` : `test_coldStartRestoredSession_skipsE2EEBundleUpload` (mock E2EAPI, compteur en DELTA — leçon host-app noise) ; `test_freshLogin_uploadsE2EEBundle_andSetsPublishedMarker` ; `test_secondLoginSameIdentityKey_skipsUpload`.
- bootRecovery : compteur de probe sur `OfflineQueue` mesuré en delta par cold start simulé.

**Risque de régression.** Moyen sur la partie E2EE uniquement : l'upload au boot masque peut-être des bundles jamais publiés — c'est le marqueur « bundle publié pour ce userId+identityKey » (étape 4) qui neutralise ce risque, jamais une suppression aveugle. Le retrait du bootRecovery dupliqué est sans risque (le second est ordonné avant le flush).

**Dépendances.** aucune · **Backend requis :** non

---

### startup-08 — BGTasks jamais annulés au logout ; handlers se re-planifient sans garde d'auth en boucle déconnectée · **P3** · effort S

**Constat.** Aucun `cancelAllTaskRequests` ni `cancel(taskRequestWithIdentifier:)` dans le repo (grep vide sur `apps/ios` + `packages/MeeshySDK`). `handleConversationSync` se re-planifie inconditionnellement après l'issue, `handleMessagePrefetch` se re-planifie EN TÊTE avant tout travail, et seule la planification initiale est gatée sur `authToken`. Une tâche soumise avant le logout survit donc et s'auto-perpétue sur un appareil déconnecté.

**Preuve.**
- `apps/ios/Meeshy/Features/Main/Services/BackgroundTaskManager.swift:144-145` : resched inconditionnel de `handleConversationSync` ; :152 : resched en tête de `handleMessagePrefetch`.
- `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift:85-89` : seule la planification initiale est gatée `authToken != nil`.
- Le coût est réel : `deltaSyncCore` part en réseau sans header d'auth (`ConversationSyncEngine.swift:557-562` via `api.request` ; `APIClient.swift:496` ne pose `X-Session-Token` que pour un anonyme) → 401 → résultat `false` → backoff (`nextSyncDelay` :34-42, cap 15 min) → resched (:145) indéfiniment. Le prefetch relit un cache vidé par `reset()` mais se re-planifie quand même toutes les ~30 min.
- La branche logout de `MeeshyApp.adaptiveOnChange` (`MeeshyApp.swift:693-730`) n'annule rien.

**Impact.** Après logout, l'appareil est réveillé périodiquement pour un delta sync sans token (401 systématique) et un prefetch sur cache vide : batterie et réseau gaspillés indéfiniment, logs d'erreurs. Pas de désync (P3).

**Correctif pas-à-pas.**
1. `BackgroundTaskManager.handleConversationSync` (:119) : en tête, `guard AuthManager.shared.authToken != nil else { task.setTaskCompleted(success: false); return }` — sans resched.
2. `handleMessagePrefetch` (:151) : même garde AVANT le `scheduleMessagePrefetch()` de tête (:152).
3. `MeeshyApp.adaptiveOnChange(isAuth)`, branche else (:693-730) : `BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: BackgroundTaskManager.conversationSyncTaskId)` + idem `messagePrefetchTaskId`. **Ne PAS toucher :** pas de `cancelAllTaskRequests` — préserver `me.meeshy.cache.background-flush`, filet du flush au terminate.
4. Re-login : rien à faire — la prochaine transition background re-planifie (`BackgroundTransitionCoordinator.swift:85-89`, chemin existant).
5. Testabilité : injecter un seam `authTokenProvider: () -> String?` (défaut `{ AuthManager.shared.authToken }`) dans `BackgroundTaskManager` plutôt que lire le singleton en dur ; `BGAppRefreshTask` n'étant pas instanciable en test, extraire la décision « run + resched » en helper pur si besoin.

**Tests (TDD — RED d'abord).**
- `MeeshyTests` : `test_conversationSyncDecision_noAuthToken_completesFailureWithoutReschedule` et `test_messagePrefetchDecision_noAuthToken_skipsHeadReschedule`, via le helper pur / seam injecté (mock scheduler comptant les submit).
- `test_logoutBranch_cancelsBothBGTaskIdentifiers_preservesCacheFlush` (mock `BGTaskScheduling` relevant les identifiants annulés).
- Ancrer les assertions sur le comportement, pas sur le texte source.

**Risque de régression.** Faible — le chemin re-login est déjà couvert par la re-planification au prochain background ; le seul piège serait d'annuler le flush-task du cache, explicitement exclu par l'étape 3.

**Dépendances.** sync-04 (canonique de startup-02, fichier 04) — tant que les watermarks ne sont pas réinitialisés, un BGTask qui survit au logout aggrave le scénario delta-partiel · **Backend requis :** non

## Doublons rattachés

| Doublon | Canonique | Ce que le doublon a apporté au canonique |
|---|---|---|
| startup-01 (session anonyme : socket suspendu au background, jamais reconnecté au foreground, P1) | → voir **net-02** (fichier 06) | (a) Le gate app-side `MeeshyApp.swift:868` (`guard authManager.isAuthenticated`) bloque TOUT le `resumeFromBackground()` du coordinator pour un invité — corriger les guards SDK seuls ne suffit pas ; il faut `guard authManager.isAuthenticated \|\| activeGuestSession != nil`. (b) Périmètre resserré : `SocialSocketManager` n'a AUCUN `connectAnonymous` (seul `connect()` existe, guard authToken à `SocialSocketManager.swift:445-448`) — le fix « les deux managers » est trop large, la branche anonyme (bascule vers `connectAnonymous(sessionToken:)` via `APIClient.shared.anonymousSessionToken`) n'a de sens que dans `MessageSocketManager.resumeFromBackground` (:1666-1669). (c) Même famille : `handleNetworkBackOnline` garde aussi sur authToken (`MessageSocketManager.swift:1490-1493`) — invité + perte réseau = même gel. |
| startup-02 (watermarks de sync jamais réinitialisés au logout, P1) | → voir **sync-04** (fichier 04) | (a) Scénario aggravant delta-avant-première-ouverture : `syncSinceLastCheckpoint()` court depuis le foreground resume (`BackgroundTransitionCoordinator.swift:131-133`) et le BGTask (`BackgroundTaskManager.swift:122`) AVANT la première ouverture de la liste — `deltaSyncCore` persiste alors une liste partielle comme fraîche. (b) TROU DE COUVERTURE : un fix limité à `logout()` ne couvre pas `requireReauthentication` (`AuthManager.swift:820-828`), qui ne passe pas par `logout()` mais purge quand même les caches via `MeeshyApp.swift:711` — cache vide + watermark conservé = même bug à la ré-auth du MÊME compte. `resetSyncCheckpoints()` doit être appelé depuis les DEUX chemins (voir aussi le publisher `sessionInvalidated` de startup-03). |
| startup-06 (`flushAll`/`evictUnderMemoryPressure` codent en dur 6 stores sur 27) | → voir **cache-01** (fichier 01) | CORRECTION FACTUELLE : la prémisse « aucune perte active aujourd'hui » du gap d'origine est fausse — `NotificationToastManager.swift:289/300/541` mute le store `notifications` (état lu, suppression, prepend), store ABSENT du filet des 6 : l'exposition est ACTIVE (notification lue + background < 2 s + kill = repart non lue), ce qui valide le P1 du canonique. Détail transmis : la collection `allGRDBStores` du fix doit être itérée AUSSI dans `evictUnderMemoryPressure` (:606-633, flush + evictL1), pas seulement dans `flushAll`, et `dirtyCountForTest` aligné. |
| startup-09 (seconde instance `MessagePersistenceActor` créée au boot pour la purge de rétention, P3) | → voir **grdb-08** (fichier 01) | Preuve que le fix trivial est sûr : `purgeOldMessages` (`MessagePersistenceActor.swift:2068`) écrit directement via `dbWriter.write` sans dépendre d'un état posé par `start()` → remplacer par `dependencies.messagePersistence.purgeOldMessages()` EN SUPPRIMANT le `start()` surnuméraire est sans risque. Confirmation du coût : le guard de `start()` (`processorTask == nil`, :206-207) est PAR INSTANCE — la 2e instance lance bien un 2e processorTask + un 2e GC `purgeExhaustedOlderThan`. |

## Écartés après vérification

Aucun écart de cette dimension n'a été réfuté. Le vérificateur a tenté la réfutation sur chaque écart retenu (notamment : « la purge de startup-03 est un choix délibéré Q3 » — vrai pour l'inconditionnalité, mais rien ne couvre le silence utilisateur ; « la persistance Keychain de startup-05 est voulue » — vrai, mais elle est inaccessible après kill sans décision documentée) ; ces tentatives sont intégrées aux fiches ci-dessus. Un écart a été rétrogradé (startup-04 : P2 → P3, mécanisme exact mais impact spéculatif, correctif réécrit instrumentation-first) et quatre ont été rattachés à leur canonique d'une autre dimension.

## Questions ouvertes

1. **iPad multi-scènes** : `WindowGroup` peut créer plusieurs scènes ; le `.task` de boot et les branches `scenePhase` s'exécutent alors par scène. Les gardes idempotentes (`CacheCoordinator.start`, `isTransitioning` du coordinator) couvrent-elles un entrelacement `.background` (scène A) / `.active` (scène B) ? Non audité.
2. **`emitAppForeground(false)` avant `suspendTransport()`** (`MeeshyApp.swift:591`) : l'émission Socket.IO est asynchrone — a-t-on la garantie que la frame part avant le `socket.disconnect()` du coordinator ? Sinon le gateway peut croire l'app au premier plan et router un appel entrant vers un socket mort au lieu du push VoIP.
3. **Restauration iCloud / appareil neuf** : `me.meeshy.lastSyncTimestamp` (UserDefaults, restauré) peut survivre sans les bases SQLite — même classe de bug que startup-02/sync-04 (delta partiel servi comme frais). À vérifier sur un vrai restore.
4. **Coût réel des migrations au boot** : aucune mesure prod — c'est désormais le cœur du correctif startup-04 (signposts + MetricKit) ; le p99 mesuré tranche la ré-escalade (P3 → P2 si > ~200 ms).
5. **`refreshCurrentUserProfile` à chaque `.active`** : le throttle 60 s suffit-il contre un `.auth` transitoire côté gateway (déploiement, horloge) qui déclencherait la purge de startup-03 ? Un compteur d'échecs consécutifs avant `requireReauthentication` serait plus sûr.
