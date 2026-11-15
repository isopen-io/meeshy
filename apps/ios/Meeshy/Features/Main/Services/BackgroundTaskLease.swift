import UIKit

/// Background-task envelope around the whole action flow — iOS suspends the
/// process the instant the delegate callback returns unless the work is
/// covered by `beginBackgroundTask` (same hazard as the silent-push path,
/// see `SilentPushState`).
@MainActor
protocol BackgroundTaskScheduling {
    func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier
    func endTask(_ identifier: UIBackgroundTaskIdentifier)
}

@MainActor
struct UIApplicationBackgroundTaskScheduler: BackgroundTaskScheduling {
    func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier {
        UIApplication.shared.beginBackgroundTask(withName: name, expirationHandler: expirationHandler)
    }

    func endTask(_ identifier: UIBackgroundTaskIdentifier) {
        guard identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier)
    }
}

/// Ends the wrapped background task exactly once, from whichever fires first:
/// the normal completion path (`defer` in `handle()`) or iOS's expiration
/// callback when the awaited flow outlives the background window (~30 s — the
/// action flow chains up to two 60 s-timeout REST calls, so a stalled network
/// mechanically exceeds it). Apple: failing to end an expired task terminates
/// the process (0x8BADF00D family) — same hazard the silent-push path guards
/// via `SilentPushState`.
@MainActor
final class BackgroundTaskLease {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private let scheduler: BackgroundTaskScheduling
    private var identifier: UIBackgroundTaskIdentifier = .invalid

    init(scheduler: BackgroundTaskScheduling, name: String) {
        self.scheduler = scheduler
        self.identifier = scheduler.beginTask(name: name) { [weak self] in
            Task { @MainActor in self?.end() }
        }
    }

    func end() {
        guard identifier != .invalid else { return }
        scheduler.endTask(identifier)
        identifier = .invalid
    }
}
