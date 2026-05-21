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

- [ ] **C1** : Foreground notification muting (NSE + `PushNotificationManager` checke `applicationState == .active`)
- [ ] **C2** : Badge unified writer — `NotificationCoordinator` est source unique pour app/widget/NSE
- [ ] **C3** : `presence:snapshot` ré-émission au reconnect (côté client : trigger explicit fetch)
- [ ] **C4** : `typingSafetyTimers` `nonisolated(unsafe)` race fix (sync queue ou actor)

### PHASE D — Auth complétude (~3-5h chacun)

- [ ] **D1** : Multiple-401 refresh race → lock atomique (`AuthManager.swift:86-87,354-377`)
- [ ] **D2** : JWT decode robuste — logger malformed avant logout silencieux
- [ ] **D3** : Cache invalidation au logout (`CacheCoordinator.clear()` + `FriendshipCache.clear()`)
- [ ] **D4** : `savedAccounts` tri stable (clé secondaire `userId`)
- [ ] **D5** : Logout API avec retry (`AuthService.logout()` ne doit pas être fire-and-forget)

### PHASE E — Cache hardening (~3-5h chacun)

- [ ] **E1** : `DiskCacheStore.save()` déclenche `evictOverBudget()` auto si dépassement
- [ ] **E2** : `GRDBCacheStore` L2 encryption fail-mode unifié (read et write log + report)
- [ ] **E3** : Outbox idempotence atomique `.pending → .inflight` (lock GRDB)
- [ ] **E4** : `TusUploadCheckpoint` expiry 24h check au resume

### PHASE F — Performance (effort variable)

- [ ] **F1** : `@Published` reduction `ConversationListViewModel` (16 → 4-5 + state container)
- [ ] **F2** : Audit spring animations (273 → keep only user-interaction)
- [ ] **F3** : `CommentListViewController` O(N²) → O(1) via index map
- [ ] **F4** : `FeedListViewController` pre-layout heights (`FeedPostLayoutEngine`)
- [ ] **F5** : `StoryTrayView` `LazyHStack` + cap stagger à 10

### Travail à finir du PR #280

- [ ] **G1** : P4.1 — Retirer `APIClient.shared` des 11 views restantes (ThreadView, ReplyThreadOverlay, StoryViewer+Canvas/+Sidebar/+Content×3, ConversationView+Header, SharePickerView refactoring complet)

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
