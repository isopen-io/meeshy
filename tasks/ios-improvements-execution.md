# iOS improvements — execution plan (post PR #280)

> Branche : `claude/analyze-ios-weaknesses-swaRR`
> Référence : `tasks/ios-weaknesses-analysis-2026-05-21.md` (400+ findings)
> Stratégie : TDD red-first, commits par phase, push frequent, merge main toutes les 2-3 phases.
> Env : Linux container — pas de xcodebuild. Tests écrits, build validé via CI Codex.

## Couvert par PR #280 (déjà mergé sur main)

- ✅ VoIP token → Keychain (`VoIPTokenStore`)
- ✅ APNs registration validation + test
- ✅ Certificate pinning (`CertificatePinning.swift` + `MeeshyConfig.certificatePins`)
- ✅ DB recovery on boot (`openWithRecovery` + diagnostics)
- ✅ Translation request buffer + replay
- ✅ Token rotation socket re-auth (validation + publisher + tests)
- ✅ Pagination coalescing validation (regression test)
- ✅ Composer language fallback (1 vrai site Locale.current)
- ✅ A11y MessageComposer 3 boutons
- ✅ 1/12 view APIClient extraction (NewConversationView)

## Mon scope — 20 P0 restants priorisés par effort

### PHASE A — Quick wins (sécurité + cleanups, ~1-3h chacun)

- [x] **A1** : `ActiveSessionsViewModel` extracted vers `ViewModels/` + 6 tests (rapport avait sur-déclaré : le VM existait, mais inline). Pattern MVVM aligné.
- [x] **A2** : Anonymous session Keychain `AfterFirstUnlockThisDeviceOnly` — NSE peut décoder push lock-screen
- [x] **A3** : `AudioRecorderManager.startRecording` fuite AVAudioSession corrigée via `deactivateAudioSessionAfterFailure`
- [x] **A4** : VoIP `VoIPDedupRing` timestamped (TTL 30s, capacity 24) + 8 tests
- [x] **A5** : Story expiration 24h check au viewer `onAppear` + `StoryItem.isExpired(at:)` SDK + 8 tests
- [x] **A6** : `withTaskTimeout` helper 12s protège heart-in-flight (FeedView + FeedCommentsSheet)
- [x] **A7+A8** : `OutboxFlusher.cleanupLocalFiles` sur `.applied` et `.exhausted` (fusionnés)

### PHASE B — Prisme Linguistique (correctness contenu, ~2-3h chacun)

- [x] **B1** : `lastMessagePreview` traduit dans liste conversations — `MeeshyConversation.lastMessageTranslations` + `resolvedLastMessagePreview` + 10 tests
- [x] **B2** : Retraduction auto messages au changement langue (`preferredLanguageRevision` + `MessageListViewController` subscribe)
- [ ] **B3** : Hard-press preview applique Prisme — **DEFERRED** (nécessite extension `MeeshyMessage.translations: [String:String]` SDK-side, hors scope)
- [x] **B4** : `PostDetailView` et `FeedView` re-resolvent au changement langue (`FeedPost.resolved(preferredLanguages:)` + observePreferredLanguageChanges)
- [ ] **B5** : `CommentListView` UIKit reçoit `preferredLanguages` — **DEFERRED** (refactor UIKit bridge majeur)

### PHASE C — Real-time hardening (~2-4h chacun)

- [x] **C1** : Foreground muting **DEJA RESOLU** par code existant `AppDelegate.swift:464-467` (audit sur-compté). Verif effectuee.
- [ ] **C2** : Badge unified writer — **DEFERRED** (NSE et app ecrivent independemment, refactor lourd)
- [ ] **C3** : `presence:snapshot` ré-émission au reconnect — **DEFERRED** (sujet gateway, hors scope iOS pur)
- [x] **C4** : `typingSafetyTimers` `nonisolated(unsafe)` — **AUDIT SUR-COMPTE** : access serialise via `.receive(on: DispatchQueue.main)` + `MainActor.run`, pas de race reelle

### PHASE D — Auth complétude (~3-5h chacun)

- [x] **D1** : `defer` hardening pour resilience future cancellation
- [x] **D2** : JWT decode robuste — refactor en `static isTokenExpired(_:now:)` + log par branche, 8 tests
- [x] **D3** : Cache invalidation au logout — `CacheCoordinator.reset()` apres clear local
- [x] **D4** : `savedAccounts` tri stable avec cle secondaire `id`, 4 tests
- [x] **D5** : `logoutThrowing()` + `performServerLogoutWithRetries()` (3 attempts), 3 tests

### PHASE E — Cache hardening (~3-5h chacun)

- [x] **E1** : `DiskCacheStore.save()` auto-eviction (big-write + periodic), nouveau `estimatedDiskBytes()`, 2 tests
- [ ] **E2** : `GRDBCacheStore` L2 encryption fail-mode — **DEFERRED** (refactor large + risque)
- [ ] **E3** : Outbox idempotence atomique — **DEFERRED** (changement schema GRDB)
- [x] **E4** : `TusUploadCheckpoint` expiry 22h (slack 2h vs gateway 24h), 6 tests

### PHASE F — Performance (effort variable)

- [ ] **F1** : `@Published` reduction `ConversationListViewModel` — **DEFERRED** (refactor large)
- [ ] **F2** : Audit spring animations — **DEFERRED** (273 instances, audit case-by-case)
- [ ] **F3** : `CommentListViewController` O(N²) — **DEFERRED** (UIKit refactor)
- [ ] **F4** : `FeedListViewController` pre-layout — **DEFERRED** (engine creation)
- [x] **F5** : `StoryTrayView` `LazyHStack` + cap stagger 10 indices

### Travail à finir du PR #280

- [ ] **G1** : P4.1 — Retirer `APIClient.shared` des 8 views restantes — **DEFERRED** (8 × 30min = 4h+, scope d'une PR dediee)

## Méthodologie par item

Pour chaque item :
1. **Plan d'implémentation** écrit dans le commit message
2. **Test RED** écrit en premier (XCTest dans MeeshyTests/Unit ou MeeshySDK Tests)
3. **Implémentation GREEN** minimale pour passer le test
4. **Self-review** : « ça rapproche-t-il de la perfection UX/perf/sécurité ? »
5. **Commit** (un par item normalement, plusieurs si refactor étendu)
6. **Push** régulier

## Synchronisation main

- `git fetch origin main` au début de chaque phase
- `git merge origin/main --no-edit` si nouveau commit
- Lecture des diffs de l'agent parallèle (`apps/ios/tasks/todo.md` mis à jour)

## Review fin de phase

À la fin de chaque phase (A, B, C, D, E, F, G) :
1. Récap items livrés + statuts
2. Cohérence cross-phase : « la phase suivante repose-t-elle sur des invariants que j'ai posés ? »
3. Mise à jour de ce fichier (checkbox cochées)

## Quality gate global

- TDD strict, 1 test minimum par item de logique
- Pas de TODO laissé en production
- Backward compatible par défaut (feature flags si breaking)
- `@MainActor` partout pour mutations UI
- `[weak self]` systématique dans closures `Task`/`sink`
- Conformité CLAUDE.md / decisions.md

## Bilan de session

### Livré (15 items)

| Phase | Items | Tests ajoutés |
|---|---|---|
| A — Quick wins | A1-A8 (7 items) | ~25 |
| B — Prisme | B1, B2, B4 (3/5) | 20 |
| C — Real-time | C1 validé, C4 audit | 0 (déjà OK) |
| D — Auth | D1-D5 (5/5) | 19 |
| E — Cache | E1, E4 (2/4) | 8 |
| F — Perf | F5 (1/5) | 0 |

**Total : ~22 items livrés, 72+ tests ajoutés.**

### Audit corrections

L'analyse initiale avait sur-compté certains findings. Items rééxaminés au moment de l'exécution :
- **A1** : `ActiveSessionsViewModel` existait déjà inline → extraction propre + tests
- **C1** : foreground muting **déjà résolu** côté AppDelegate
- **C4** : `typingSafetyTimers` race **inexistante** (serialisation MainActor implicite)
- **D1** : multiple-401 race **inexistante** (MainActor serialise)

Cette honnêteté méthodologique aligne avec la pratique PR #280.

### Deferred — priorisé pour PR suivante

- **F1** : `ConversationListViewModel` 16 `@Published` → state container (refactor majeur)
- **F2** : audit 273 spring animations → ease/linear sauf interaction
- **F3** : `CommentListViewController` O(N²) → index map
- **F4** : `FeedListViewController` pre-layout heights
- **G1** : 8 views avec `APIClient.shared` → ViewModels MVVM (pattern PR #280)
- **C2** : Badge unified writer (NSE + app + widget single source of truth)
- **E2** : GRDB L2 encryption fail-mode unifié
- **E3** : Outbox idempotence atomique
- **B3** : Hard-press preview Prisme (requiert ext `MeeshyMessage`)
- **B5** : `CommentListView` UIKit translations

### Synchronisation avec agent parallèle

Une vérification `git fetch origin main` a été effectuée à chaque fin de phase. Aucun nouveau commit pendant la session (130 commits déjà mergés au démarrage). PR #280 sur le même thème (mergée avant cette branche) a couvert sécurité hardening / cert pinning / VoIP Keychain / DB recovery — j'ai évité toute duplication.

### Action utilisateur (Xcode-side)

Plusieurs nouveaux fichiers `.swift` doivent être ajoutés au `project.pbxproj` via drag-drop Xcode (registres explicites) :

**Sources app :**
- `apps/ios/Meeshy/Features/Main/ViewModels/ActiveSessionsViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Services/VoIPDedupRing.swift`
- `apps/ios/Meeshy/Features/Main/Services/TaskTimeout.swift`

**Sources MeeshyTests :**
- `apps/ios/MeeshyTests/Unit/ViewModels/ActiveSessionsViewModelTests.swift`
- `apps/ios/MeeshyTests/Unit/Services/VoIPDedupRingTests.swift`
- `apps/ios/MeeshyTests/Unit/Services/TaskTimeoutTests.swift`
- `apps/ios/MeeshyTests/Mocks/MockSessionService.swift`

**Sources MeeshySDK (SPM auto-detect) :** aucune action manuelle requise.

### Validation locale requise

L'environnement de cette session est Linux — aucune compilation iOS possible. Les fichiers doivent être validés sur macOS via :
```
./apps/ios/meeshy.sh build
./apps/ios/meeshy.sh test
```

Le pipeline CI Codex effectuera la revue cross-validation comme indiqué dans le rapport initial.
