# Lessons

## 2026-04-17 — iOS background stability

1. **`didReceiveRemoteNotification` must await async work before the completion handler.** Calling `completionHandler(.newData)` synchronously before async subtasks finish lets iOS suspend the process mid-flight. Wrap in `beginBackgroundTask` + a tiny actor that guarantees the handler fires exactly once whether the happy path or the OS expiration wins.

2. **Delivery receipts belong in the push path, not the socket path alone.** Sender-side double-check cursors depend on the recipient calling `markAsReceived`. If the recipient never opens the app, the socket path never fires. The APN pipeline is the correct hook — emit `ack(conversationId:)` from `didReceiveRemoteNotification`.

3. **`fatalError` in singleton init crashes the app on disk-full / permission-change / cold wake from push.** Return a degraded in-memory fallback and expose an `isEphemeral` flag so callers can decide whether to persist. Never `fatalError` on initialisation paths that run during background wakes.

4. **Decryption can return an empty array — `msgArray[0]` is a crash.** When mutating via `decryptMessagesIfNeeded(&:)`, guard `first` before indexing. Force-unwrap on collections that were mutated by background tasks is a guaranteed crash in low-memory scenarios.

5. **`AVAudioSession` interruption / route-change observers must be installed exactly once, centrally.** Four players configuring the session independently with no observer leaves the app in a bad state after a phone call or AirPods disconnect. Centralise in a single actor and fan out events via a `PassthroughSubject`.

6. **`willResignActive` is not enough for cache flushes.** It fires on control-center pulls and transient hand-offs, but NOT reliably on full background → terminate. Also observe `didEnterBackground` and `willTerminate` with a synchronous semaphore wait (≤4s) on terminate.

7. **Timer.scheduledTimer on singletons with `[weak self]` closures never fires `deinit`.** Singletons live forever, so weak captures don't break the retain cycle — but the timer keeps firing in background. Explicitly stop timers in `prepareForBackground()` and rearm in `resumeFromBackground()`.

8. **`MKLocalSearch.start { ... }` strongly retains its closure.** Without `[weak self]`, a dismissed picker leaks, and worse, the completion task may write into a zombie view model. Apple search APIs should always be captured weakly.

9. **Route tasks in `@MainActor { Task { await ... } }` through a small actor state machine when multiple exit points exist.** Otherwise a race between happy-path completion and OS expiration leads to double-call of `completionHandler`.

10. **Backgrounding is a single state transition — orchestrate it.** Multiple `.background` handlers scattered across the app invariably drift out of sync. A single `BackgroundTransitionCoordinator` with explicit ordering (players → cache → push → sockets → BG tasks → widgets) makes the lifecycle auditable.

## 2026-06-01 — Cleanup / suppression de fichiers

11. **"Absent de `project.yml`" ≠ "non utilisé". Avant de supprimer un fichier, lire son en-tête ET vérifier toutes les voies de build.** J'ai supprimé `apps/ios/WebRTCStubs.swift` en concluant "non compilé" parce qu'il n'était ni dans `project.yml`, ni dans le `project.pbxproj` committé, ni dans les workflows `.github`/`ci_scripts`/`fastlane`. Mais son en-tête disait explicitement : *stubs guardés par `#if !canImport(WebRTC)`, compilés UNIQUEMENT quand le package WebRTC n'est pas résolu (CI sans WebRTC)*. C'est un fallback CI volontaire : inerte quand WebRTC est présent (le `#if` le vide), indispensable quand il est absent. Restauré après correction user. **Règle : un fichier dont l'en-tête décrit une compilation conditionnelle (`#if !canImport(...)`, fallback CI, build variant) ne doit JAMAIS être supprimé sur la seule base "pas trouvé dans la config de build par défaut" — le grep ne voit pas les chemins de build alternatifs.**

