# Réalignement des suites de tests iOS — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ramener les suites de tests iOS au vert en alignant app et tests sur la même logique fonctionnelle (19 échecs app + 31 échecs SDK), sans régression.

**Architecture:** Remédiation pilotée par investigation. Pour chaque échec : lire le code de prod ET le test, décider la source de vérité (app correcte → corriger le test ; app régressée → corriger l'app), corriger, vérifier par run ciblé, committer sur `main`. La décision est justifiée dans le message de commit.

**Tech Stack:** Swift 6 / XCTest, `./apps/ios/meeshy.sh test` (app), `xcodebuild test -only-testing:` (SDK), GRDB, Combine.

---

## Conventions de vérification

- **App** : `rm -rf apps/ios/test-results && ./apps/ios/meeshy.sh test 2>&1 | tail -5`
  → ligne `Executed N tests, with … failures`.
- **App, classe ciblée** : ajouter `-only-testing:MeeshyTests/<Classe>` n'est pas
  exposé par `meeshy.sh` ; pour itérer vite, lire le résultat de la classe dans le
  log complet.
- **SDK, classe ciblée** (évite le gel réseau du run complet) :
  ```
  cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
    -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
    -derivedDataPath ./Build-Tests \
    -clonedSourcePackagesDirPath "$HOME/Library/Developer/Xcode/DerivedData/$(ls "$HOME/Library/Developer/Xcode/DerivedData" | grep '^Meeshy-' | head -1)/SourcePackages" \
    -skipPackageUpdates -only-testing:MeeshySDKTests/<Classe>
  ```
- Commits : un par point sur `main`, **P2 scindable par cluster**. Pas de trailer
  `Co-Authored-By`.

---

## Task 1 — P1 : `test_tabCounts_reflectResultArraySizes` hermétique

**Files:**
- Investigate: `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift` (méthode `performSearch`)
- Modify: `apps/ios/MeeshyTests/Unit/ViewModels/GlobalSearchViewModelTests.swift`

- [ ] **Step 1 — Investiguer la source de pollution**

Lire `GlobalSearchViewModel.performSearch`. Identifier toute lecture d'état
process-wide non injectée (candidat principal : `CacheCoordinator.shared` —
`.conversations`, `.messages`). Le test stubbe users=3 et conversations vides
mais un compteur revient à 1 → un store partagé contient une entrée matchant
« test » laissée par un autre test.

Décision attendue : **le test est non hermétique** (l'app est correcte) → corriger le test.
Si `performSearch` lit un singleton qu'il NE devrait PAS lire (fuite de logique), c'est une régression app → corriger l'app à la place.

- [ ] **Step 2 — Écrire l'isolation dans `setUp`**

Dans `GlobalSearchViewModelTests`, étendre le `setUp()` existant (qui nettoie
déjà `UserDefaults`) pour invalider les stores partagés lus par `performSearch`.
Modèle : `PostDetailViewModelTests.setUp` fait
`await CacheCoordinator.shared.feed.invalidate(for:)`. Rendre `setUp` `async`
si besoin et invalider les stores identifiés au Step 1, p. ex. :

```swift
override func setUp() async throws {
    try await super.setUp()
    UserDefaults.standard.removeObject(forKey: defaultsKey)
    await CacheCoordinator.shared.conversations.invalidateAll()
    await CacheCoordinator.shared.messages.invalidateAll()
}
```

Ajuster aux API réelles de `CacheCoordinator` constatées au Step 1 (le nom exact
de la méthode d'invalidation globale est à confirmer ; sinon invalider par clés).

- [ ] **Step 3 — Vérifier**

`rm -rf apps/ios/test-results && ./apps/ios/meeshy.sh test 2>&1 | tail -5`
Attendu : `test_tabCounts_reflectResultArraySizes` passe ; total **17 failures**.

- [ ] **Step 4 — Committer**

```bash
git add apps/ios/MeeshyTests/Unit/ViewModels/GlobalSearchViewModelTests.swift
git commit -m "test(ios): isolate GlobalSearchViewModelTests from shared cache

test_tabCounts polluted by a cache entry left by another test; the
suite reorder after the mock-theater cleanup exposed it. setUp now
invalidates the shared stores performSearch reads."
```

---

## Task 2 — P2 : 17 échecs app, 4 clusters

Chaque cluster = investigation indépendante. Committer cluster par cluster.

### Task 2a — Cluster `ConversationViewModel.markAsRead`

**Files:**
- Investigate: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (`markAsRead`), `apps/ios/MeeshyTests/Mocks/MockConversationService.swift`
- Modify: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` (ou le code app si régression)

- [ ] **Step 1 — Investiguer**

Tests en échec : `test_loadMessages_callsMarkRead`,
`test_markAsRead_callsConversationServiceMarkRead`. Le test attend que
`markAsRead()` appelle `conversationService.markRead`. Lire `markAsRead` dans
`ConversationViewModel` : déterminer le chemin réel (REST direct ? socket ?
`PendingStatusQueue` ? outbox ?).

Critère de décision :
- Si `markAsRead` route délibérément ailleurs (Local-First) → **app correcte**,
  mettre le test à jour pour asserter le vrai chemin.
- Si `markAsRead` devrait appeler le service mais ne le fait plus → **régression
  app**, corriger l'app.

- [ ] **Step 2 — Corriger selon la décision**

Cas test obsolète : remplacer l'assertion sur `markReadCallCount` par une
assertion sur le mécanisme réel (p. ex. spy sur la queue de statuts, ou
notification `.conversationMarkedRead` déjà asserted par
`test_markAsRead_postsNotification`). Si le comportement est entièrement couvert
par le test de notification existant, supprimer le test redondant.
Cas régression : corriger `ConversationViewModel.markAsRead`.

- [ ] **Step 3 — Vérifier**

`./apps/ios/meeshy.sh test` — les 2 tests du cluster passent, pas de nouvelle
régression.

- [ ] **Step 4 — Committer**

```bash
git add apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift
git commit -m "test(ios): align markAsRead tests with <chemin réel constaté>"
```

### Task 2b — Cluster `PostDetailViewModel` like/comment

**Files:**
- Investigate: `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift` (`likePost`, `sendComment`), `apps/ios/MeeshyTests/Mocks/MockPostService.swift`
- Modify: `apps/ios/MeeshyTests/Unit/ViewModels/PostDetailViewModelTests.swift` (ou code app si régression)

- [ ] **Step 1 — Investiguer**

Tests : `test_likePost_togglesLikeState`, `test_likePost_error_rollsBack`,
`test_sendComment_success_insertsAtTop`, `test_sendComment_error_doesNotInsert`.
Symptôme : `mock.addCommentCallCount`/`mock.likeCallCount` = 0, l'item optimiste
porte un id `cmid_…` jamais réconcilié. Lire `likePost`/`sendComment` : si elles
écrivent dans un outbox/persistence et ne touchent plus `postService` injecté
→ contrat Local-First.

Décision : très probablement **app correcte / tests obsolètes** — mais vérifier
que le rollback et la réconciliation serveur fonctionnent vraiment (sinon
régression).

- [ ] **Step 2 — Corriger**

Réécrire les 4 tests sur le contrat réel : asserter l'effet optimiste observable
(`sut.comments`/`sut.post.isLiked`) et l'effet de réconciliation/rollback via le
mécanisme réel (mock du dispatcher d'outbox, ou injection du chemin réseau réel).
Si la réconciliation `cmid_… → id serveur` est cassée dans l'app → corriger l'app.

- [ ] **Step 3 — Vérifier** : `./apps/ios/meeshy.sh test` — 4 tests verts.

- [ ] **Step 4 — Committer**

```bash
git add apps/ios/MeeshyTests/Unit/ViewModels/PostDetailViewModelTests.swift
git commit -m "test(ios): align PostDetailViewModel like/comment tests with outbox contract"
```

### Task 2c — Cluster `StoryRepostFlowTests.test_flux3`

**Files:**
- Investigate: `packages/MeeshySDK/Sources/MeeshyUI/**/UnifiedPostComposer.swift` (`triggerPublishForTests`, `repostSourceForTests`, `onPublishRepost`)
- Modify: `apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift` (ou `UnifiedPostComposer` si régression)

- [ ] **Step 1 — Investiguer**

`test_flux3_kebabEditerEtRepublier_opensComposerPost_publishes` : le callback
`onPublishRepost` reçoit `nil` au lieu du contenu/sourceStory. Lire
`UnifiedPostComposer.triggerPublishForTests` et la façon dont `onPublishRepost`
et `repostSourceForTests` sont câblés. Déterminer si le hook de test est cassé
(`triggerPublishForTests` n'invoque plus le callback) ou si le test l'appelle mal.

- [ ] **Step 2 — Corriger**

Si `triggerPublishForTests`/`repostSourceForTests` ont dérivé (renommage, source
non capturée) → corriger le seam de test dans `UnifiedPostComposer` pour qu'il
reflète le vrai flux de publication. Si le test appelle une API obsolète →
mettre le test à jour.

- [ ] **Step 3 — Vérifier** : `./apps/ios/meeshy.sh test` — `test_flux3` vert.

- [ ] **Step 4 — Committer** (le fichier modifié selon la décision)

```bash
git commit -m "fix(ios): repair UnifiedPostComposer repost publish test seam"
```

### Task 2d — Cluster `WebRTCServiceTests.test_connectionStateChange`

**Files:**
- Investigate: `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift` (mapping d'état de connexion)
- Modify: `apps/ios/MeeshyTests/Unit/Services/WebRTCServiceTests.swift` (ou `WebRTCService` si régression)

- [ ] **Step 1 — Investiguer**

`test_connectionStateChange_updatesConnectionState` : attend `connected`, obtient
`new`. Lire comment `WebRTCService` mappe `RTCPeerConnectionState`/`RTCIceConnectionState`
vers son enum. Déterminer : le test simule-t-il une transition incomplète (il
manque un événement avant l'assertion), ou le mapping app a-t-il régressé ?

- [ ] **Step 2 — Corriger** selon la décision (compléter la simulation dans le
  test, ou corriger le mapping d'état dans `WebRTCService`).

- [ ] **Step 3 — Vérifier** : `./apps/ios/meeshy.sh test` — test vert.

- [ ] **Step 4 — Committer**

```bash
git commit -m "<test|fix>(ios): align WebRTC connection-state <test|mapping>"
```

---

## Task 3 — P6 : couvrir `StoryPublishService`

**Files:**
- Investigate: `apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift`
- Create: `apps/ios/MeeshyTests/Unit/Services/StoryPublishServiceTests.swift`
- Possibly modify: `StoryPublishService.swift` (ajout protocole `StoryPublishServiceProviding` si injectabilité absente)

- [ ] **Step 1 — Investiguer la surface testable**

Lire `StoryPublishService` : lister les méthodes publiques, leurs dépendances
(TUS upload, métadonnées, `TimelineOnlinePublishing` stub → fallback offline
queue). Identifier le comportement **réel** vérifiable sans réseau (orchestration,
fallback offline, construction de payload). Ne pas tester le stub lui-même.

- [ ] **Step 2 — Garantir l'injectabilité (si nécessaire)**

Si le service n'accepte pas ses dépendances par init injection : créer le
protocole `StoryPublishServiceProviding` au-dessus de la classe (règle TDD iOS)
et injecter les collaborateurs avec defaults `.shared`. Sinon, passer.

- [ ] **Step 3 — Écrire les tests de comportement**

Créer `StoryPublishServiceTests.swift` (`@MainActor final class … XCTestCase`),
factory `makeSUT()`, mocks conformes aux protocoles des collaborateurs. Couvrir :
orchestration nominale du publish RAW, fallback vers la file offline quand
`TimelineOnlinePublishing` est indisponible, garde-fou « ne jamais appeler
`prepareExport`/`StoryExporter.export` depuis `runStoryUpload` » (règle Story
Architecture du CLAUDE.md).

- [ ] **Step 4 — Vérifier** : `./apps/ios/meeshy.sh test` — nouveaux tests verts,
  pas de régression.

- [ ] **Step 5 — Mettre à jour le pbxproj**

`StoryPublishServiceTests.swift` est un nouveau fichier de la cible classique
`MeeshyTests` → ajouter ses 4 entrées dans `Meeshy.xcodeproj/project.pbxproj`
(PBXBuildFile, PBXFileReference, PBXGroup children, PBXSourcesBuildPhase) avec 2
UUID uniques. Re-vérifier le build.

- [ ] **Step 6 — Committer**

```bash
git add apps/ios/MeeshyTests/Unit/Services/StoryPublishServiceTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift
git commit -m "test(ios): cover StoryPublishService publish orchestration + offline fallback"
```

---

## Task 4 — P4 : bugs d'infrastructure SDK

### Task 4a — `ReactionServiceTests` ×4 (lookup de stub)

**Files:**
- Investigate: `packages/MeeshySDK/Tests/MeeshySDKTests/Mocks/MockAPIClient.swift`, `packages/MeeshySDK/Sources/MeeshySDK/Services/ReactionService.swift`
- Modify: `MockAPIClient.swift` et/ou `packages/MeeshySDK/Tests/MeeshySDKTests/Services/ReactionServiceTests.swift`

- [ ] **Step 1 — Investiguer**

Erreur : « no stub for '/reactions' — Available stubs: ['/reactions'] » → le
stub est enregistré mais le lookup échoue. Lire `MockAPIClient.stub()` et la
méthode `request`/`requestVoid` : le lookup combine probablement endpoint +
type de réponse (`APIResponse<DiscardedReactionResponse>`). Déterminer si
`ReactionService` a changé de type de retour (le test stubbe l'ancien type) ou
si le mock indexe mal les stubs.

- [ ] **Step 2 — Corriger**

Si type de retour de `ReactionService` a dérivé → mettre à jour le type stubbé
dans `ReactionServiceTests`. Si le `MockAPIClient` confond les types → corriger
sa logique d'indexation/lookup pour matcher par endpoint + méthode.

- [ ] **Step 3 — Vérifier**

Run SDK ciblé : `-only-testing:MeeshySDKTests/ReactionServiceTests` (cf.
conventions). Attendu : 4 tests verts.

- [ ] **Step 4 — Committer**

```bash
git commit -m "<test|fix>(sdk): repair ReactionService stub <type|lookup>"
```

### Task 4b — `AttachmentServiceTests` décodage date ISO8601

**Files:**
- Investigate: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/AttachmentServiceTests.swift:130`, le décodeur de `AttachmentService` / `APIClient`
- Modify: la fixture du test, ou la stratégie de décodage de date

- [ ] **Step 1 — Investiguer**

`test_attachmentStatusUser_decodesGatewayPayload` : `DecodingError` « Expected
date string to be ISO8601-formatted ». Lire la fixture JSON du test et la
`dateDecodingStrategy` du décodeur. Déterminer : la fixture a une date non
ISO8601 (fixture fausse) ou le gateway renvoie réellement ce format et le
décodeur doit l'accepter (régression de tolérance).

- [ ] **Step 2 — Corriger**

Si la fixture est fausse → corriger la date de la fixture en ISO8601. Si le
gateway renvoie ce format en prod → assouplir la `dateDecodingStrategy` du
décodeur d'`AttachmentService` pour l'accepter.

- [ ] **Step 3 — Vérifier**

`-only-testing:MeeshySDKTests/AttachmentServiceTests` — test vert.

- [ ] **Step 4 — Committer**

```bash
git commit -m "<test|fix>(sdk): align AttachmentService date decoding with gateway payload"
```

---

## Task 5 — P3 : `StoryOfflineQueueTests` ×5 (régression suspectée)

**Files:**
- Investigate: `packages/MeeshySDK/Sources/MeeshySDK/**/StoryOfflineQueue*.swift`, `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/StoryOfflineQueueTests.swift`
- Modify: le code de prod de la file (probable) et/ou le test

- [ ] **Step 1 — Investiguer (priorité code de prod)**

5 échecs : `test_enqueue_dequeue_roundTrip` (rend `media-1` au lieu de
`slide-1`), `test_multipleEnqueue_maintainsFIFOOrder` (rend `media-1` répété au
lieu de `first/second/third`), `test_flush_callsHandler_andRemovesOnSuccess`
(handler appelé 0 fois), `test_flush_stopsOnFirstFailure`,
`test_persistence_storedUnderApplicationSupportDirectory` (mauvais dossier).
Le symptôme « tous les items dequeue rendent le même champ » indique une vraie
**régression de sérialisation/dequeue** dans `StoryOfflineQueue`. Lire le code
d'enqueue/dequeue et la sérialisation JSON : chercher un mauvais champ écrit/lu,
ou un identifiant écrasé.

- [ ] **Step 2 — Corriger l'app (attendu)**

Corriger la sérialisation/dequeue pour préserver les identifiants distincts et
l'ordre FIFO ; corriger le chemin de persistance vers `applicationSupportDirectory`.
Si l'investigation montre que ce sont les tests qui sont obsolètes (peu probable
vu le symptôme), mettre les tests à jour à la place.

- [ ] **Step 3 — Vérifier**

`-only-testing:MeeshySDKTests/StoryOfflineQueueTests` — 5 tests verts.

- [ ] **Step 4 — Committer**

```bash
git commit -m "fix(sdk): restore StoryOfflineQueue FIFO order, dequeue identity and storage path"
```

---

## Task 6 — P5 : baselines snapshot

**Files:**
- Investigate: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/AudioClipBarSnapshotTests.swift`, `packages/MeeshySDK/Tests/MeeshyUITests/__Snapshots__/` (absent)
- Modify: baselines (ajout) ou les fichiers `*SnapshotTests` selon décision

- [ ] **Step 1 — Investiguer**

`AudioClipBarSnapshotTests` (3 méthodes × light/dark) échoue « does not match
reference ». Le `Package.swift` exclut `Tests/MeeshyUITests/__Snapshots__` mais
le dossier n'existe pas → aucune baseline committée. Lire le fichier de test :
confirmer qu'il appelle `assertSnapshot` (vraie capture). Vérifier les autres
`*SnapshotTests` (Ruler, TransitionBadge, ClipInspector, VideoClipBar,
ProTimelineView, QuickTimelineView) : lesquels font une vraie capture, lesquels
ont été convertis en tests non-snapshot malgré leur nom.

- [ ] **Step 2 — Décider**

Pour chaque fichier de vraie capture : la régression visuelle a-t-elle une vraie
valeur (composant stable) ? Si oui → enregistrer la baseline (record mode :
exécuter avec `isRecording = true` ou supprimer puis premier run), committer le
dossier `__Snapshots__`. Si la valeur est faible / instable cross-device (cf.
R3 de la spec) → retirer le(s) test(s) snapshot et leurs entrées de scheme.

- [ ] **Step 3 — Appliquer**

Selon la décision : générer et committer `__Snapshots__/` (et retirer
l'`exclude` obsolète du `Package.swift` si on garde les baselines), OU retirer
les fichiers `*SnapshotTests` factices.

- [ ] **Step 4 — Vérifier**

`-only-testing:MeeshyUITests/AudioClipBarSnapshotTests` (et classes voisines
modifiées) — vert.

- [ ] **Step 5 — Committer**

```bash
git commit -m "test(sdk): <record snapshot baselines|remove stale snapshot tests> for timeline views"
```

---

## Vérification finale

- [ ] `rm -rf apps/ios/test-results && ./apps/ios/meeshy.sh test 2>&1 | tail -5`
      → **0 failure** (ou seulement des échecs hors périmètre explicitement notés).
- [ ] Runs SDK ciblés des classes touchées (Tasks 4, 5, 6) → vert.
- [ ] `git log --oneline` sur `main` → un commit par point (P2 scindé par cluster).

## Self-Review (couverture de la spec)

- P1 → Task 1 ✓ · P2 → Tasks 2a-2d ✓ · P6 → Task 3 ✓ · P4 → Tasks 4a-4b ✓ ·
  P3 → Task 5 ✓ · P5 → Task 6 ✓.
- Principe « investiguer puis décider » : présent dans le Step 1 de chaque task.
- Risques spec R1/R2/R3 : R1 (régression élargie) → chaque Step 2 prévoit le
  branchement app ; R2 → Task 5 oriente d'emblée vers le code de prod ; R3 →
  Task 6 Step 2 intègre le critère retirer-vs-régénérer.
