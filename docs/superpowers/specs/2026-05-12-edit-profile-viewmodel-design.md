# EditProfileViewModel — extraction VM + pattern optimistic+rollback

**Date :** 2026-05-12
**Statut :** spec
**Suivi Phase 4** : « Extraire `EditProfileViewModel` de `EditProfileView.swift` et appliquer pattern optimistic+rollback (B5 deferred) ». Voir `memory/project_ios_local_first_wave1.md`.

## Contexte

`EditProfileView.swift` (549 lignes) mélange aujourd'hui :

- État SwiftUI (`@State displayName`, `bio`, `selectedPhotoItem`, `selectedImageData`, `avatarPreviewImage`, `isSaving`, `isUploadingAvatar`, `errorMessage`, `showSuccess`)
- Logique métier (`saveProfile()` — upload avatar + enqueue `.updateProfile` + `checkExistingSession`)
- Networking bas niveau (`uploadAvatar(_:)` multipart + JSONDecoder local)
- Image processing (`compressImage(_:maxSizeKB:)`)

Le pattern optimistic+rollback B5 livré pour `UserProfileViewModel.blockUser` et `RequestsViewModel.accept/reject` (commits `150f8983`, Phase 4 Task 4.9) n'a pas été appliqué à l'édition profil — l'écran utilise encore `checkExistingSession()` post-enqueue, ce qui retarde la propagation des changements aux autres surfaces (ProfileView, conversation headers, bubbles, settings) du temps d'un round-trip réseau.

## Objectifs

1. Extraire `EditProfileViewModel` (apps/ios, MVVM, dependency-injected) en cohérence stricte avec `UserProfileViewModel`/`RequestsViewModel`.
2. Appliquer le pattern optimistic+rollback B5 : snapshot pré-mutation → apply local instantané sur `AuthManager.currentUser` → enqueue `.updateProfile` → observer `OfflineQueue.outcomeStream(for: cmid)` → rollback symétrique si `.exhausted`.
3. Propagation live des 3 champs (`displayName`, `bio`, `avatar`) sur TOUTES les surfaces qui observent `currentUserPublisher` sans appel réseau.
4. Rendre l'écran et la logique testables en isolation (factory `makeSUT()` + mocks).
5. Débloquer en passant le test bundle iOS (2 issues compile pré-existantes).

## Hors scope

| Item | Raison |
|------|--------|
| Édition live sans bouton Save | Décision : scope strict, conservation UX actuelle |
| Préférences de traduction dans le VM (translateToSystemLanguage, regionalLanguage, customDestinationLanguage) | Décision : scope strict, autre surface |
| Cleanup serveur des avatars orphelins après `.exhausted` | Concern gateway, déjà documenté Phase 4 |
| `FeedViewModel.createPost` sur path outbox | Follow-up Phase 4 séparé |
| `StoryOfflineQueue` unification | Follow-up Phase 4 séparé |

## Décisions architecturales

| Décision | Justification |
|----------|---------------|
| **Approche A « ViewModel fat autonome »** plutôt que Service séparé | Cohérence 1:1 avec UserProfileViewModel/RequestsViewModel (pattern B5). Évite la sur-architecture pour un seul appelant. |
| **Optimistic total des 3 champs** (displayName + bio + avatarUrl) | Choix utilisateur explicite. UX continue et cohérente vs optimistic partiel ; l'avatar uploadé orphelin est acceptable en cas d'`.exhausted`. |
| **`AuthManager.applyLocalProfileChanges(...) → ProfileSnapshot`** | API minimale, atomique, snapshot-on-write. Un seul call côté VM (vs snapshot + apply). |
| **`SaveState` enum** plutôt que plusieurs `Bool` | Élimine les états impossibles (`isSaving && showSuccess`), pilote l'UI déterministiquement, simple à tester. |
| **`onDismiss` injecté en paramètre à `saveProfile`** | Découple le VM de `@Environment(\.dismiss)`. Permet de tester sans monter de View. |
| **`Clock` injecté** | Tests rapides, pas de `Task.sleep(1.5s)` réel. |
| **`selectedPhotoItem` reste `@State` dans la View** | Type SwiftUI couplé UI ; seul `Data` traverse au VM via `loadSelectedPhoto(_:)`. |
| **`hasChanges` recomputé depuis `authManager.currentUser`** | Pas de snapshot redondant côté VM. |
| **Pré-requis : fix test bundle iOS** dans le scope | Sans ça, on ne peut pas exécuter les nouveaux tests (CLAUDE.md exige TDD). Bloque aussi tous les futurs follow-ups Phase 4. |

## Topologie

### Nouveaux fichiers (4)

| Fichier | Rôle |
|---------|------|
| `apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift` | VM ~250 lignes, `@MainActor` `ObservableObject`. |
| `apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift` | Wrapper du flow multipart, protocole `AttachmentUploading`. Extrait verbatim de `EditProfileView.uploadAvatar` + `compressImage`. |
| `apps/ios/MeeshyTests/Unit/ViewModels/EditProfileViewModelTests.swift` | 16 tests `XCTestCase`, factory `makeSUT()`. |
| `apps/ios/MeeshyTests/Mocks/MockAttachmentUploader.swift` | Mock `AttachmentUploading`. |

### Fichiers modifiés (4)

| Fichier | Modification |
|---------|--------------|
| `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift` | Refactor 549 → ~280 lignes, View pure, `@StateObject var viewModel`. |
| `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift` | + protocole `applyLocalProfileChanges(displayName:bio:avatarUrl:) → ProfileSnapshot` + `restoreLocalProfileSnapshot(_:)` + impl + struct `ProfileSnapshot`. |
| `apps/ios/MeeshyTests/Mocks/MockAuthManager.swift` | + impl `applyLocalProfileChanges` + `restoreLocalProfileSnapshot` + tracking `lastApplyLocalProfileChanges` + `appliedSnapshots` array. |
| `apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift` | Fix L144 : `.content` → `.text` sur `StoryTextObject` (test bundle fix). |

### Adapters thin (à introduire si manquants)

Le VM dépend de 5 protocoles. Tous existants sont réutilisés ; ceux manquants reçoivent un adapter trivial (extension qui rend `.shared` conforme).

| Protocole | Membres | Conformance prod |
|-----------|---------|------------------|
| `AuthManaging` | (existe déjà) + `applyLocalProfileChanges`, `restoreLocalProfileSnapshot` | `AuthManager.shared` |
| `OfflineQueueing` | `enqueue<P: OutboxPayload>(_ kind:, payload:) async throws`, `outcomeStream(for: String) async -> AsyncStream<OutboxOutcome>` | `OfflineQueue.shared` (vérifier si protocole déjà extrait sinon créer) |
| `AttachmentUploading` | `uploadAvatar(_ data: Data) async throws -> URL` | `AttachmentUploader.shared` |
| `CacheCoordinating` | `invalidateProfile(for userId: String) async` | `CacheCoordinator.shared` |
| `Clock` | `sleep(for: Duration) async` | `SystemClock` (wrappe `Task.sleep`) |
| `ToastSurfacing` | `showSuccess(_:)`, `showError(_:)` | `ToastManager.shared` |
| `HapticSurfacing` | `success()`, `error()` | `HapticFeedbackBridge.shared` (wrappe `HapticFeedback`) |

## API publique

### `ProfileSnapshot` (MeeshySDK/Auth/)

```swift
public struct ProfileSnapshot: Sendable, Equatable {
    public let displayName: String?
    public let bio: String?
    public let avatarUrl: String?
}
```

Sendable car composé uniquement de `String?` (Sendable natif).

### `AuthManaging` (extension protocole)

```swift
@MainActor
public protocol AuthManaging: AnyObject {
    // ... membres existants ...

    @discardableResult
    func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot

    func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot)
}
```

`nil` = champ inchangé. Le snapshot retourné capture l'état pré-mutation des 3 champs. La mutation publie via `@Published currentUser`, donc `currentUserPublisher` notifie toutes les surfaces (ProfileView, conversation headers, MeBubble, settings) dans le même run-loop tick.

### `AttachmentUploading`

```swift
protocol AttachmentUploading: Sendable {
    func uploadAvatar(_ data: Data) async throws -> URL
}
```

Compression à 500 KB max appliquée en interne. Throws `MeeshyError` ou `APIError`.

### `EditProfileViewModel`

```swift
@MainActor
final class EditProfileViewModel: ObservableObject {
    // Bindings (inputs)
    @Published var displayName: String
    @Published var bio: String
    @Published var selectedImageData: Data?
    @Published var avatarPreviewImage: Image?

    // State machine (outputs)
    @Published private(set) var saveState: SaveState
    @Published private(set) var errorMessage: String?
    @Published private(set) var showSuccess: Bool

    enum SaveState: Equatable {
        case idle, uploadingAvatar, enqueueing, success, failed
    }

    init(
        authManager: AuthManaging = AuthManager.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        attachmentUploader: AttachmentUploading = AttachmentUploader.shared,
        cacheCoordinator: CacheCoordinating = CacheCoordinator.shared,
        clock: Clock = SystemClock(),
        toast: ToastSurfacing = ToastManager.shared,
        haptics: HapticSurfacing = HapticFeedbackBridge.shared
    )

    var hasChanges: Bool
    var isSaving: Bool        // saveState == .uploadingAvatar || .enqueueing
    var isUploadingAvatar: Bool
    var bioMaxLength: Int { 300 }

    func loadSelectedPhoto(_ item: PhotosPickerItem?) async
    func saveProfile(onDismiss: @escaping @MainActor () -> Void) async
}
```

## Flow `saveProfile` détaillé

```
hasChanges? ──no──> return (no-op)
   │ yes
   ▼
errorMessage = nil
   │
   ▼
selectedImageData? ──no──┐
   │ yes                  │
   ▼                      │
saveState = .uploadingAvatar
attachmentUploader.uploadAvatar(data) async throws
   ├─ throws ──> fail(.upload) [saveState=.failed, return, AUCUNE mutation locale, pas de rollback]
   ▼ success → uploadedAvatarUrl                │
   ┌──────────────────────────────────────────┘
   ▼
cmid = ClientMutationId.generate()
payload = UpdateProfilePayload(cmid, displayName?, bio?, avatarUrl?)
   ▼
snapshot = authManager.applyLocalProfileChanges(payload.displayName, .bio, .avatarUrl)
            ↳ currentUser publie → ProfileView/Conversation headers/MeBubble se rafraîchissent instantanément
   ▼
observeOutcome(cmid: cmid, snapshot: snapshot)   // fire-and-forget Task @MainActor [weak self]
   ▼
saveState = .enqueueing
offlineQueue.enqueue(.updateProfile, payload: payload) async throws
   ├─ throws ──> authManager.restoreLocalProfileSnapshot(snapshot)
   │             fail(.enqueue) [saveState=.failed, return]
   ▼ success
cacheCoordinator.invalidateProfile(for: currentUser.id)
   ▼
haptics.success()
toast.showSuccess("Profil mis a jour")
saveState = .success
showSuccess = true
try? await clock.sleep(for: .milliseconds(1_500))
onDismiss()

(en parallèle, OutboxFlusher → REST PATCH /users/me)
  ├─ .applied   → observeOutcome no-op (l'état optimistic est déjà l'état serveur)
  └─ .exhausted → authManager.restoreLocalProfileSnapshot(snapshot)
                  + toast.showError("Mise a jour du profil echouee")
                  + haptics.error()
                  (Toast post-dismiss, l'écran d'édition est déjà fermé)
```

### Points critiques

1. **`observeOutcome` est attaché AVANT `enqueue`** — sinon race : l'OutboxFlusher peut émettre l'outcome avant que le `for await` soit listé. Conforme à l'ordre établi par `UserProfileViewModel.blockUser`.
2. **Rollback déclenché par 2 chemins distincts** : (a) enqueue local fail → rollback synchrone immédiat ; (b) outcomeStream `.exhausted` → rollback asynchrone. Les deux appellent `restoreLocalProfileSnapshot(snapshot)` — symétriques.
3. **`showSuccess = true` ne ment pas** — il indique que l'enqueue local a réussi (mutation persistée GRDB, sera retryée jusqu'à `maxAttempts`). Si plus tard `.exhausted`, le toast d'erreur surfaces APRÈS le dismiss — cohérent avec local-first et avec B5 sur les messages.
4. **Pas d'optimistic sur les bytes de l'avatar** — l'upload doit réussir avant l'enqueue (online-only par design). Une fois l'URL serveur obtenue, les 3 champs sont appliqués atomiquement.
5. **Avatar orphelin** — si `.exhausted` après upload réussi, le binaire reste sur le serveur. Acceptable, à nettoyer côté gateway dans une session future.

## `EditProfileView` après refactor

### Avant / Après
- **Avant** : 549 lignes, 11 `@State`, 2 méthodes async métier, 1 helper compression
- **Après** : ~280 lignes, 2 `@State` purement UI, 0 métier, délégation pure au VM

### Disparu de la View
- `displayName`, `bio`, `selectedImageData`, `avatarPreviewImage`, `isSaving`, `isUploadingAvatar`, `errorMessage`, `showSuccess` → VM
- computed `hasChanges` → `viewModel.hasChanges`
- `saveProfile()` → `viewModel.saveProfile { dismiss() }`
- `uploadAvatar(_:)`, `compressImage(_:maxSizeKB:)` → `AttachmentUploader`
- `loadSelectedPhoto(_:)` → `viewModel.loadSelectedPhoto(item)`
- constante `bioMaxLength` → `viewModel.bioMaxLength`

### Conservé
- Structure visuelle 100% identique : header, avatarSection, fieldsSection, readOnlySection, saveButton, successOverlay
- Toutes les chaînes localisées
- Animations, haptics au tap des boutons (le tap reste dans la View, la logique métier appelée passe par le VM)
- `selectedPhotoItem` (PhotosPickerItem, couplé SwiftUI) reste dans la View

### Init pattern

```swift
init(viewModel: EditProfileViewModel = EditProfileViewModel()) {
    _viewModel = StateObject(wrappedValue: viewModel)
}
```

`AuthManager.shared` capté par défaut dans `EditProfileViewModel.init` plutôt qu'`@EnvironmentObject` car ce dernier n'est pas lisible depuis `init`. Aucun problème — la même instance singleton est référencée. L'`@EnvironmentObject authManager` reste dans la View pour le `readOnlySection` (email/phone/username) qui lit `currentUser` directement.

## Plan de tests

### `EditProfileViewModelTests` (16 tests, factory `makeSUT()`)

| Groupe | Tests |
|--------|-------|
| **Initial state** | `test_init_seedsDisplayName_fromCurrentUser` · `test_init_seedsBio_fromCurrentUser` · `test_init_hasChangesFalse_whenNoEdits` |
| **hasChanges** | `test_hasChanges_trueAfterDisplayNameEdit` · `test_hasChanges_trueAfterBioEdit` · `test_hasChanges_trueAfterImageSelection` |
| **saveProfile happy path (no avatar)** | `test_save_appliesOptimisticLocally_beforeEnqueue` · `test_save_enqueuesUpdateProfilePayload_withCmid` · `test_save_invalidatesProfileCache_afterEnqueue` · `test_save_callsDismissCallback_afterSuccessDelay` |
| **saveProfile happy path (with avatar)** | `test_save_uploadsAvatarBeforeEnqueue_whenImageSelected` · `test_save_enqueuesPayloadWithUploadedUrl` |
| **Failure paths** | `test_save_setsFailedState_whenAvatarUploadThrows_noLocalMutation` · `test_save_rollsBackSnapshot_whenEnqueueThrows` |
| **Outcome observer** | `test_save_rollsBackSnapshot_whenOutcomeStreamEmitsExhausted` · `test_save_doesNotRollback_whenOutcomeStreamEmitsApplied` |

### `AuthManagerTests` additionnels (3 tests, côté SDK)

| Test |
|------|
| `test_applyLocalProfileChanges_updatesAllThreeFields_publishesCurrentUser` |
| `test_applyLocalProfileChanges_returnsSnapshotOfPreMutationState` |
| `test_restoreLocalProfileSnapshot_restoresExactPreMutationState` |

### `AttachmentUploaderTests` (1 test)

| Test |
|------|
| `test_compress_reducesImageBelow500KB_whenLargerInput` |

L'upload réseau n'est pas couvert en test unitaire (rôle des integration tests).

## Ordre d'implémentation TDD (15 steps)

### Pré-requis test bundle (steps 1-2)

| # | Step |
|---|------|
| 1 | Fix `StoryRepostFlowTests.swift:144` : `.content` → `.text`. Build verif : `meeshy.sh test` compile. |
| 2 | Grep + fix `*ViewModelTests` `async save()` sans `try?`. À localiser via `meeshy.sh test` au step 1 (lire l'erreur compile suivante). Build verif : `meeshy.sh test` exécute les tests existants. |

### SDK foundation (steps 3-4)

| # | Step | Tests créés |
|---|------|-------------|
| 3 | Ajouter `ProfileSnapshot` + 2 méthodes au protocole `AuthManaging` + impl `AuthManager` | 3 `AuthManagerTests.test_applyLocalProfileChanges_*` |
| 4 | Ajouter les 2 méthodes au `MockAuthManager` | compile-only |

### App scaffolding (steps 5-7)

| # | Step |
|---|------|
| 5 | Créer `AttachmentUploader` + `AttachmentUploading` protocol. 1 test compression. |
| 6 | Créer `MockAttachmentUploader` + adapters mocks (`MockOfflineQueue`, `MockCacheCoordinator`, `TestClock`, `MockToastSurface`, `MockHapticSurface`). |
| 7 | Créer fixtures : `MeeshyUser.fixture(displayName:bio:avatar:)` si absent. |

### ViewModel TDD (steps 8-12)

| # | Group | Code écrit en GREEN |
|---|-------|---------------------|
| 8 | Initial state (3 tests) | `init(...)` + seeding `displayName/bio` |
| 9 | hasChanges (3 tests) | computed `hasChanges` |
| 10 | saveProfile happy path no-avatar (4 tests) | enqueue + applyLocalProfileChanges + cache invalidate + dismiss callback |
| 11 | saveProfile with avatar (2 tests) | branch upload avant enqueue |
| 12 | Failure paths + outcome observer (4 tests) | rollback enqueue throw + rollback `.exhausted` + no-op `.applied` |

### View refactor (steps 13-15)

| # | Step | Verif |
|---|------|-------|
| 13 | Refactor `EditProfileView` : extract tout vers VM, structure visuelle identique | `meeshy.sh build` vert |
| 14 | Smoke manuel sim : modifier displayName seul, bio seul, avatar seul, les 3 ensemble, retour sans save | UI fonctionne identiquement |
| 15 | Smoke offline : couper réseau, save, vérifier optimistic visible PARTOUT (ProfileView + bubble user dans conversation), reconnecter, vérifier ACK serveur sans rollback | OutboxFlusher fait son job |

## Definition of Done

- ✅ Steps 1-15 verts
- ✅ `meeshy.sh build` 0 errors (warnings pré-existants tolérés, pas de nouveaux warnings)
- ✅ `meeshy.sh test` exécute la suite app-side (test bundle réparé)
- ✅ 16 nouveaux tests `EditProfileViewModelTests` verts
- ✅ 3 nouveaux tests `AuthManagerTests.applyLocalProfileChanges_*` verts (SDK)
- ✅ 1 test `AttachmentUploaderTests.test_compress_*` vert
- ✅ Refactor visuel zéro régression (sub-views identiques)
- ✅ Smoke offline démontre la propagation live + rollback
- ✅ SwiftLint 0 violation sur les nouveaux fichiers

## Risques identifiés + mitigations

| Risque | Mitigation |
|--------|------------|
| `MeeshyUser` est une class ou ses champs sont `let` | Vérifier au step 3 ; si class, basculer `applyLocalProfileChanges` sur reconstruction d'un nouvel objet via initializer complet (memberwise) |
| `OfflineQueueing` protocol n'existe pas | Adapter thin : créer le protocole avec les 2 méthodes consommées, `OfflineQueue.shared` y conforme par extension. Idem `CacheCoordinating`, `ToastSurfacing`, `HapticSurfacing` |
| `Clock` protocol absent du codebase | Créer minimal : `protocol Clock { func sleep(for: Duration) async }`. `SystemClock` wrappe `Task.sleep`, `TestClock` no-op |
| Le 2e bug test bundle (`*ViewModelTests async save()`) introuvable au grep | Exécuter `meeshy.sh test` après step 1 et lire l'erreur compile exacte avant de proposer le fix |
| `@StateObject` + init custom + `@EnvironmentObject authManager` collision Swift 6 | Pattern déjà utilisé dans le projet (vérifier sur `ConversationListViewModel`/`StatusViewModel`). Si problème, `StateObject(wrappedValue: EditProfileViewModel())` capte `AuthManager.shared` directement sans environment |

## Estimation

- Pré-requis test bundle (1-2) : ~20 min
- SDK foundation (3-4) : ~30 min
- App scaffolding (5-7) : ~40 min
- ViewModel TDD (8-12) : ~90 min (16 tests + impl)
- View refactor (13-15) : ~30 min
- **Total : ~3h30 sur worktree dédié `.claude/worktrees/feat+edit-profile-vm/`**

## Prochaine étape

Génération du plan d'implémentation détaillé via `superpowers:writing-plans`.
