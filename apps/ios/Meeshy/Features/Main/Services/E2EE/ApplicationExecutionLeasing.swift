import MeeshyE2EE
import os
import UIKit

/// Le bail E2EE de l'APP (#12668) : `UIApplication.beginBackgroundTask`, que
/// la documentation d'Apple donne comme le remède à 0xdead10cc (« Prevent your
/// app from being terminated while holding a file lock in a shared
/// container ») et qu'elle déclare appelable hors du fil principal.
///
/// - Un bail n'est demandé que si le temps d'arrière-plan restant
///   (`backgroundTimeRemaining`, infini au premier plan) laisse finir une
///   tranche : sous `minimumRemaining`, il est refusé, et l'opération reportée.
/// - Le rappel d'expiration marque le bail expiré ; la tâche se rend à la fin
///   de la prise (une tranche, quelques millisecondes), jamais pendant qu'elle
///   tient le verrou — la rendre là exposerait à la suspension qu'elle évite.
nonisolated struct ApplicationExecutionLeasing: E2EEExecutionLeasing {
    nonisolated struct System: Sendable {
        let begin: @Sendable (_ name: String, _ expiration: @escaping @Sendable () -> Void) -> UIBackgroundTaskIdentifier
        let end: @Sendable (UIBackgroundTaskIdentifier) -> Void
        let remaining: @Sendable () -> TimeInterval
    }

    static let taskName = "me.meeshy.e2ee.process-lock"
    static let minimumRemaining: TimeInterval = 5
    static let live = ApplicationExecutionLeasing(system: .attachedApplication)

    private let system: System

    init(system: System) {
        self.system = system
    }

    func withLease<T>(_ body: (any E2EEExecutionLease) throws -> T) throws -> T {
        guard system.remaining() >= Self.minimumRemaining else { throw E2EEExecutionLeaseError.refused }
        let lease = ApplicationLease(end: system.end)
        let identifier = system.begin(Self.taskName) { lease.expire() }
        guard identifier != .invalid else { throw E2EEExecutionLeaseError.refused }
        lease.hold(identifier)
        defer { lease.release() }
        guard !lease.isExpired else { throw E2EEExecutionLeaseError.expired }
        return try body(lease)
    }

    /// L'app que lit le bail : `UIApplication.shared` ne se lit que sur le fil
    /// principal, et le verrou se prend sur les fils de l'E2EE. Elle s'attache
    /// au lancement (`prepareProcess`) et à chaque ouverture de session E2EE
    /// (`EndToEndSessionBridge.start`) ; tant qu'elle ne l'est pas, tout bail est
    /// refusé, et l'opération reportée.
    @MainActor static func attach(_ application: UIApplication) {
        System.application.withLock { $0 = application }
    }
}

nonisolated extension ApplicationExecutionLeasing.System {
    fileprivate static let application = OSAllocatedUnfairLock<UIApplication?>(initialState: nil)

    static let attachedApplication = Self(
        begin: { name, expiration in
            application.withLock { $0 }?.beginBackgroundTask(withName: name, expirationHandler: expiration) ?? .invalid
        },
        end: { identifier in application.withLock { $0 }?.endBackgroundTask(identifier) },
        remaining: { application.withLock { $0 }?.backgroundTimeRemaining ?? 0 }
    )
}

/// Une tâche d'arrière-plan rendue exactement une fois : à la fin de la prise,
/// que son expiration soit arrivée avant ou pendant.
nonisolated private final class ApplicationLease: E2EEExecutionLease, Sendable {
    private struct State {
        var identifier: UIBackgroundTaskIdentifier = .invalid
        var expired = false
        var released = false
    }

    private let state = OSAllocatedUnfairLock(initialState: State())
    private let end: @Sendable (UIBackgroundTaskIdentifier) -> Void

    init(end: @escaping @Sendable (UIBackgroundTaskIdentifier) -> Void) {
        self.end = end
    }

    var isExpired: Bool { state.withLock { $0.expired } }

    func hold(_ identifier: UIBackgroundTaskIdentifier) {
        state.withLock { $0.identifier = identifier }
    }

    func expire() {
        state.withLock { $0.expired = true }
    }

    func release() {
        let identifier = state.withLock { current -> UIBackgroundTaskIdentifier? in
            guard !current.released, current.identifier != .invalid else { return nil }
            current.released = true
            return current.identifier
        }
        if let identifier { end(identifier) }
    }
}
