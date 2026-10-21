import Foundation
import MeeshySDK

/// **Quand l'application vérifie l'espace libre du volume (IL8, #11286).**
///
/// `DiskCacheStore.evictUnderDiskPressure()` sait QUOI évincer ; il ne le
/// faisait qu'au fil des écritures du cache. Une session qui ne fait que lire
/// — un lancement, un retour au premier plan après qu'une autre application a
/// rempli le volume — ne relâchait rien. Ce déclencheur est la politique
/// côté application : une passe au lancement et à chaque retour au premier
/// plan, au plus une par `minimumInterval`, jamais deux à la fois, et jamais
/// sur le fil principal (la passe énumère le répertoire du cache).
@MainActor
final class DiskPressureSweeper {
    // iOS 26.1 : deinit synthétisée isolée → double-free au démontage hors tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = DiskPressureSweeper(minimumInterval: 10 * 60, sweep: sweepAllCaches)

    nonisolated private static func sweepAllCaches() async {
        let coordinator = CacheCoordinator.shared
        await coordinator.video.evictUnderDiskPressure(availableBytes: nil)
        await coordinator.audio.evictUnderDiskPressure(availableBytes: nil)
        await coordinator.images.evictUnderDiskPressure(availableBytes: nil)
        await coordinator.thumbnails.evictUnderDiskPressure(availableBytes: nil)
    }

    private let minimumInterval: TimeInterval
    private let sweep: @Sendable () async -> Void
    private var lastSweepAt: Date?
    private var inFlight: Task<Void, Never>?

    init(minimumInterval: TimeInterval, sweep: @escaping @Sendable () async -> Void) {
        self.minimumInterval = minimumInterval
        self.sweep = sweep
    }

    /// Rend la passe lancée, ou `nil` quand une passe tourne déjà ou que la
    /// précédente date de moins de `minimumInterval`.
    @discardableResult
    func requestSweep(now: Date = Date()) -> Task<Void, Never>? {
        guard inFlight == nil, isDue(now: now) else { return nil }
        lastSweepAt = now
        let sweep = self.sweep
        let task = Task.detached(priority: .utility) { [weak self] in
            await sweep()
            await self?.sweepFinished()
        }
        inFlight = task
        return task
    }

    private func isDue(now: Date) -> Bool {
        guard let lastSweepAt else { return true }
        return now.timeIntervalSince(lastSweepAt) >= minimumInterval
    }

    private func sweepFinished() {
        inFlight = nil
    }
}
