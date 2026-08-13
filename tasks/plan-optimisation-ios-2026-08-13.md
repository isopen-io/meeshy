# Plan d'optimisation iOS — 2026-08-13

> **Périmètre** : `apps/ios/Meeshy` + `packages/MeeshySDK` (cœur du frontend Meeshy). Issu de l'audit `tasks/audit-optimisation-globale-2026-08-13.md` (2 explorations dédiées iOS : UI/rendu et data/réseau/cache/concurrence).
>
> **État des lieux** : la base est déjà perf-mature (`.equatable()` sur bulles/rangées, `ScrollOffsetRelay`, decode JSON off-main, `NSDiffableDataSource`, Equatable O(1) via `changeVersion`, coalescing des téléchargements, débounce 16 ms du groupement). Le plan ci-dessous traite **ce qui reste** — pour l'essentiel des correctifs maison déjà inventés mais non propagés à tous les sites.
>
> **Contexte structurel** : la persistance est mi-migration (2 bases SQLite : `meeshy.sqlite` cache SDK + `meeshy_messages.sqlite` messages app ; chaque message écrit 2× ; `@Published messages` copie RAM de `MessageStore`). Plusieurs items de la Phase 2 sont des symptômes de ce dual-write — l'achèvement du retrait du legacy (`ConversationViewModel.swift:1322`) est le fix de fond.

## Cibles chiffrées (CLAUDE.md apps/ios)
- Launch → interactif : < 1 s · Scroll listes : 0 frame droppée · Mémoire : < 150 MB typique.

## Méthode
- TDD : chaque fix accompagné d'un test (perf test XCTest `measure` quand mesurable, test de comportement sinon). `./apps/ios/meeshy.sh test` vert avant tout commit.
- Un lot = une branche/PR courte, mergeable indépendamment (convention `feat/{area}-{feature}` ou `perf/{area}-{sujet}`).
- Chaque item ci-dessous : **[fichier]** action → gain attendu.

---

## Phase 0 — Mesure (préalable, ~0.5 j)

Baselines Instruments sur device (Time Profiler + SwiftUI + Allocations) : cold start → liste conversations, scroll conversation 60 s, scroll story tray, ouverture DM chiffrée 200+ messages.

Cloner le harnais existant `MeeshyTests/Performance/MessageListPerformanceTests.swift:215` (scroll programmatique en `UIWindow`) pour couvrir les trous identifiés :
- [ ] `ConversationListScrollPerfTests` (valide P1-1)
- [ ] `StoryTrayRenderPerfTests` (valide P1-3/P1-4)
- [ ] `NotificationListPerfTests` (valide P1-1/P2)

## Phase 1 — Main thread & re-render (le plus gros gain UX, ~3 j)

### P1-1 · Propager `ScrollOffsetRelay` aux 8 écrans restants — **P0**
Le bug est documenté dans `ScrollOffsetRelay.swift:5-16` (body complet ré-évalué à ~120 Hz au scroll, risque watchdog `0x8BADF00D`) ; seul `ConversationListView` a été migré. Remplacer `@State scrollOffset` racine par le relay (seul le header observe) dans :
- [ ] `MeeshyUI/Notifications/NotificationListView.swift:142/291`
- [ ] `MeeshyUI/Community/CommunityListView.swift:15/200`
- [ ] `MeeshyUI/Profile/UserProfileSheet.swift:69/206`
- [ ] `Features/Main/Views/ProfileView.swift:43/227`
- [ ] `Features/Main/Views/SettingsView.swift:43/185`
- [ ] `Features/Main/Views/LinksHubView.swift:21/49`
- [ ] `Features/Main/Views/PostDetailView.swift:671`
- [ ] `Features/Contacts/ContactsHubView.swift:20` (+ `ContactsShared.swift:131`)
→ Gain : suppression de la ré-évaluation full-screen par frame de scroll sur 8 écrans.

### P1-2 · Coalescer le refresh du MessageStore + reconfigurations ciblées — **P0**
- [ ] `MessagePersistenceActor.swift:26-39` : coalescer `postMessageStoreRefresh` (29 call sites) par conversation sur ~50 ms.
- [ ] `MessageStore.swift:258-278` : sortir `fetchMessageWindow` du MainActor (pattern déjà utilisé par `loadOlder` :524) ; plafonner la croissance de fenêtre (:96-103).
- [ ] `MessageListViewController.swift:894-896` : `reconfigureItems` sur les seuls `localId` dont `changeVersion` a changé (aujourd'hui : TOUS les items) ; ajouter au sink `messagesDidChange` (:956) le même coalescing 80 ms que les traductions (:1068).
→ Gain : N events socket = 1 relecture + reconfiguration ciblée au lieu de N × (SELECT 200+ rows + decode + snapshot 75 ms mesurés).

### P1-3 · Cellules stories : sortir IO et observation globale du body — **P0**
- [ ] `StoryTrayView.swift:292/404/717` : retirer `@EnvironmentObject StatusViewModel` des cellules feuilles (`StoryRingCell`, `MyStoryButton`, `PinnedStoryTrailBand`) ; passer `moodEmoji: String?` + callback en `let`. Rendre `StoryRingCell` `Equatable` + `.equatable()` (sites :865, :189).
- [ ] `StoryTrayView.swift:375-386` : résoudre l'URL de cover 1× dans `StoryViewModel` (aujourd'hui : `stat()` syscall par ring par render via `DiskCacheStore.cachedFileURL`).
- [ ] `StoryTrayView.swift:187/773` : matérialiser `visibleStoryGroups` en `@Published` (filter O(groups×stories) inline par body pass) ; :323-324 dédupliquer le double filter adjacent.
→ Gain : le tray (écran d'accueil) ne se ré-évalue plus sur chaque event mood/status global.

### P1-4 · `MyStoryCard` : décodage image hors main thread — **P0**
- [ ] `MyStoryCard.swift:193` : remplacer `UIImage(contentsOfFile:)` en body par `CachedAsyncImage(targetSize:)` (le chemin `CGImageSourceCreateThumbnailAtIndex` existe déjà) ou `.task(id:)`.
- [ ] `MyStoryCard.swift:202/207` + `ConversationListHelpers.swift:276` : passer `targetSize:` aux `CachedAsyncImage` (défaut nil = décode full-res).
→ Gain : plus d'IO + décode plein format sur main thread par cellule de grille.

### P1-5 · `MessageListView` : purger les `@EnvironmentObject` parasites — **P0**
- [ ] `MessageListView.swift:450-453` : les 4 env objects ne sont lus que dans `makeUIViewController` (et `router` jamais) → les passer en `let` depuis `ConversationView` (:252-255). Aujourd'hui chaque `typing:start/stop` global et chaque mood update relance `updateUIViewController` (~25 réassignations de closures) pendant qu'on est en conversation.

### P1-6 · Tuer le double `repeatForever` de `AnimatedLogoView` — **P0 (1 ligne)**
- [ ] `AnimatedLogoView.swift:85` : supprimer le `.animation(.repeatForever, value:)` qui se combine avec le `withAnimation` de :74 — c'est exactement le hog `DefaultCombiningAnimation` ~90 % du thread documenté dans `MeeshyAvatar.swift:461-469`. Utilisé par pull-to-refresh, splash, login.

### P1-7 · Racine et divers re-render — **P1**
- [ ] `RootView.swift:163-207` : étendre le pattern `RootViewCallHost` (déjà appliqué à CallManager) à `notificationManager` et `reelsPresenter` (~10 objets observés à la racine → chaque toast/flap réseau ré-évalue tab bar + containers).
- [ ] `NotificationRowView.swift:5` : `Equatable` + `.equatable()` (mirror `CommentRowView`) ; retirer les `.swipeActions` mortes hors `List` (:43-58).
- [ ] `EmojiPickerSheet.swift:183` : décoder `frequentEmojis` 1× en `.task(id:)` (2 JSONDecoder par frappe).
- [ ] `MyStoriesView.swift:973`, `MyStoryCardPresentation.swift:132/141` : formatters statiques via `RelativeTimeFormatter` existant (alloc `DateFormatter` par render).
- [ ] Reduce Motion : appliquer `.pulse()`/`.skeletonShimmer()` gardés aux 4 sites qui bypassent (`FloatingButtons.swift:713`, `AudioPlayerView.swift:1194`, `LiveLocationBadge.swift:23/68`, `MeeshyPullIndicator.swift:142`).
- [ ] `#unavailable(iOS 18)` autour des `GeometryReader` de tracking scroll morts sur iOS 18+ (6 écrans, cf. `ScrollOffsetTracking.swift:9-11`).

## Phase 2 — Persistance & cache (~3 j)

### P2-1 · Index `cache_entries.itemId` — **P0 (1 migration)**
- [ ] `AppDatabase.swift:208` : `create(index: "idx_cache_entries_itemId", on: "cache_entries", columns: ["itemId"])`. Aujourd'hui `patchEverywhere`/`removeEverywhere` (déclenchés par CHAQUE `post:liked`/`comment:added`…) full-scannent toute la table de cache.

### P2-2 · Écritures cache incrémentales — **P0**
- [ ] `GRDBCacheStore.swift:521-571/787-849` : dans `flushKeyToL2`, skipper les items au payload identique (garde `updatedAt`/hash) au lieu de ré-encoder + **re-chiffrer** les N items.
- [ ] `ConversationViewModel.swift:600` (via `ConversationSocketHandler.swift:436`) : remplacer le `save()` full-list (600 rows chiffrées réécrites après chaque message sortant réconcilié) par `upsertPatch` des seuls ids réconciliés.
- [ ] `ConversationListViewModel.swift:244` : idem pour la liste de conversations (réécriture chiffrée intégrale sur débounce 200 ms).

### P2-3 · Déchiffrement mémoïsé — **P1**
- [ ] `ConversationViewModel.swift:1157-1170/1935-1955` : mémoïser le plaintext par `(messageId, changeVersion)` dans le `DecryptionActor` — aujourd'hui toute la fenêtre (200+) est re-déchiffrée AES à chaque `messagesDidChange` en DM.

### P2-4 · Batching des écritures en boucle — **P1**
- [ ] `ConversationViewModel.swift:1791-1803` : `updateDeliveryCounters` batché (1 transaction + 1 refresh) au lieu de N awaits → N notifications → N relectures de fenêtre.
- [ ] `ConversationStore.swift:643-652` : index trié maintenu + splice au lieu de re-sort complet de la liste par mutation unitaire (cascade : re-sort VM + re-chiffrement full-list P2-2).

### P2-5 · Budget mémoire caches — **P1**
- [ ] `DiskCacheStore.swift:50-53` + `CacheCoordinator.swift:174-179` : exposer les `totalCostLimit` des 4 instances dans `configureImageMemory` ; audio/video ≈ 8 MB (aujourd'hui plafond théorique 400 MB vs cible 150 MB) ; ne pas insérer les payloads video/audio en NSCache dans `save()`.
- [ ] `DiskCacheStore.swift:707-717` : clé `_imageCache` incluant un bucket de `maxPixelSize` (un avatar 40 pt peut pinner un bitmap 1200 px).
- [ ] `CachedAsyncImage.swift:54-68` (+ Avatar/Banner/Progressive) : garder le probe NSCache en `init`, déplacer `stat` + décode disque dans le `.task` existant.

### P2-6 · Fond : achever le retrait du legacy dual-write — **P2 (chantier)**
- [ ] Poursuivre le plan `2026-05-04-ios-persistence-statemachine-design.md` : retirer `@Published messages` (copie RAM) et l'écriture miroir `cache_entries` des messages (`ConversationViewModel.swift:1687-1696`). C'est le fix racine de P2-2/P2-4.

## Phase 3 — Démarrage (~1 j)

- [ ] **P0** `RootView.swift:736-739` : paralléliser les 4 awaits sériels (`async let`, `loadConversations` prioritaire — l'écran visible attend aujourd'hui derrière stories et statuses).
- [ ] **P0** `CacheCoordinator.swift:294-302/717-763` : déplacer `loadTranslationCaches()` (read all rows + GC + decode par row, synchrone sur l'actor) dans le `Task` détaché existant — il bloque le `conversations.load` du splash (`MeeshyApp.swift:490`).
- [ ] **P1** Dédupliquer les appels de boot : `refreshUnreadCount` ×3 (`MeeshyApp.swift:505/671`, `RootView.swift:739`), `CacheCoordinator.start()` ×2 (:219/:645), `conversations.load("list")` ×2.
- [ ] **P2** `MeeshyApp.swift:475/541` : réduire le floor splash 1.0 s (contredit la cible < 1 s interactive) quand tout est déjà en cache.
- [ ] **P1** `MeeshyApp.swift:771-785` : remplacer le poll 100 ms d'attente sockets par un `AsyncStream` sur `$isConnected`.

## Phase 4 — Réseau & média (~2 j)

- [ ] **P0** Sockets : `.forceWebsockets(true)` sur les deux managers (`MessageSocketManager.swift:1754-1795`, `SocialSocketManager.swift:489`) — supprime le handshake polling+upgrade à chaque cold start ET chaque reconnect (login, foreground, rotation token).
- [ ] **P0** `TusUploadManager.swift:69/275-287` : `uploadTask(with:fromFile:)` sur `URLSessionConfiguration.background` (aujourd'hui chunks 10 MB en `httpBody` RAM ≈ 60 MB pic, uploads tués à la suspension).
- [ ] **P0** `ConversationListViewModel.swift:1966` + `DiskCacheStore.swift:335-372` : `prefetchToDisk(url:)` en streaming (`URLSession.download`) — le prefetch stories matérialise aujourd'hui des vidéos entières (~275 MB possible) en `Data` + NSCache.
- [ ] **P1** `APIClient.swift:421-445` : map in-flight `[method+url: Task]` pour coalescer les GET identiques (le pattern existe dans `DiskCacheStore.networkData` et est réinventé ad hoc par call site) ; `waitsForConnectivity = true` ; router `DiskCacheStore`/TUS/`UserService` sur la session configurée du SDK (pinning + URLCache + HTTP/3) au lieu de `URLSession.shared`.
- [ ] **P1** `GlobalSearchViewModel.swift:537-570` : réduire le fan-out search-as-you-type (11 requêtes par frappe débouncée → 3-4, ou endpoint gateway cross-conversation).
- [ ] **P2** `MessageSocketManager.swift:2841-2852` : `handleQueue` dédiée + suppression des doubles casts sur main avant le hop de décodage.
- [ ] **P2** Drafts commentaires : débouncer `CommentDraftStore.save` (`FeedCommentsSheet.swift:1447`, `PostDetailView.swift:2257` — write UserDefaults PAR FRAPPE) sur le modèle du composer conversation (400 ms).

## Phase 5 — Finitions & hygiène (~1 j, opportuniste)

- [ ] `MessageStore.swift:320-381` : ne plus construire les dictionnaires diagnostics complets par publish en release ; `Set<String>` d'ids seulement, classification gatée sur `!droppedIds.isEmpty`.
- [ ] `MessageStore.swift:616-639` : bucket jour entier (`floor(ts/86400)` ajusté tz) caché sur `MessageRecord` — le groupement par jour est calculé 4× (Store, VC ×2, VM) avec `Calendar.dateComponents` par message.
- [ ] `ThumbnailPrefetcher.swift:88-94` : createDirectory 1× en init + memo SHA-256 (pattern `fileKeyCache` existant).
- [ ] `AuthManager.swift:195-199` : préférer `APIClient.shared.authToken` (mémoire) aux 2 `SecItemCopyMatching` par foreground (`BackgroundTransitionCoordinator.swift:85`).
- [ ] `ConversationStoreSocketBridge.swift:98-169` : 1 `AsyncStream` consommé par une task longue au lieu de `Task {}` par event ×11 sinks.
- [ ] `ConversationView+Composer.swift:127-136` : éliminer les 3 `AnyView` par frappe.
- [ ] Supprimer `GRDB_Migration_Script_Notes.md` (note périmée, `LocalStore` n'existe plus).

---

## Dépendances hors-iOS qui amplifient le mobile (à traiter côté gateway/infra, cf. audit global)
1. `SOCKET_LANG_FILTER=true` par défaut (gateway) — chaque client iOS reçoit aujourd'hui TOUTES les traductions de chaque message.
2. HTTP/3 Traefik — gain direct 0-RTT/QUIC sur réseaux mobiles.
3. Endpoint search cross-conversation (réduit le fan-out P4).
4. Compression `ml.`/`agent.` + ETag simplifié.

## Ordre d'exécution et jalons

| Lot | Contenu | Effort | Validation |
|---|---|---|---|
| 1 | P1-6 (1 ligne) + P2-1 (1 migration) + P3 parallélisation boot | 0.5 j | Time Profiler avant/après ; cold start chrono |
| 2 | P1-1 ScrollOffsetRelay ×8 | 1 j | Perf tests Phase 0 + SwiftUI Instruments (body counts) |
| 3 | P1-2 coalescing store + reconfigure ciblé | 1 j | `MessageListPerformanceTests` + burst socket simulé |
| 4 | P1-3/P1-4/P1-5 stories + message list | 1 j | StoryTrayRenderPerfTests ; scroll device |
| 5 | P2-2/P2-3/P2-4 écritures incrémentales + decrypt memo | 2 j | Allocations + tests comportement cache |
| 6 | P4 réseau/média (sockets, TUS, prefetch) | 2 j | Reconnect chrono ; RSS pendant upload/prefetch |
| 7 | P1-7 + P2-5 + P5 finitions | 2 j | ReduceMotionComplianceTests étendus ; budget mémoire |

Chaque lot : `./apps/ios/meeshy.sh test` complet (phases 0–3) + capture Instruments comparée à la baseline Phase 0 + entrée `decisions.md` si un choix architectural est fait (ex. coalescing fenêtre 50 ms, clé de cache par pixel-size).
