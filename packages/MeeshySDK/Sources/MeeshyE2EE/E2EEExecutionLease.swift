import Foundation
import os

/// Une fenêtre d'exécution que le SYSTÈME a accordée au processus : tant
/// qu'elle est ouverte, iOS ne le suspend pas (#12668). Un processus suspendu
/// qui tient un verrou de fichier dans un conteneur partagé est terminé
/// (0xdead10cc, « Understanding the exception types in a crash report ») : le
/// verrou E2EE ne se prend donc que sous un bail, et la tenue reste courte.
public protocol E2EEExecutionLease: Sendable {
    /// Le système a demandé la fin de la fenêtre : aucune étape ne démarre plus.
    var isExpired: Bool { get }
}

/// Ce qui ouvre un bail : `UIApplication.beginBackgroundTask` dans l'app,
/// `ProcessInfo.performExpiringActivity` dans une extension. `body` s'exécute
/// sur le fil appelant, le bail ouvert, et le bail se referme à son retour.
/// Un bail refusé lève `E2EEExecutionLeaseError.refused` SANS exécuter `body`.
public protocol E2EEExecutionLeasing: Sendable {
    func withLease<T>(_ body: (any E2EEExecutionLease) throws -> T) throws -> T
}

public enum E2EEExecutionLeaseError: Error, Equatable {
    /// Le système n'accorde pas de fenêtre : l'opération est reportée.
    case refused
    /// La fenêtre a expiré avant que l'étape ne démarre : elle ne démarre pas.
    case expired
}

/// Aucun bail : les témoins, et les outils qui ne tournent pas sous iOS. Hors
/// de la SPI de test, l'app et ses extensions ne peuvent pas le choisir.
@_spi(Testing) public struct E2EEUnguardedExecutionLeasing: E2EEExecutionLeasing {
    public init() {}

    public func withLease<T>(_ body: (any E2EEExecutionLease) throws -> T) throws -> T {
        try body(OpenLease())
    }
}

private struct OpenLease: E2EEExecutionLease {
    var isExpired: Bool { false }
}

/// L'état d'un bail, partagé entre le fil qui travaille et le rappel
/// d'expiration du système, qui arrive sur un autre fil.
final class E2EELeaseState: E2EEExecutionLease, Sendable {
    private enum Phase { case pending, granted, refused }
    private let state = OSAllocatedUnfairLock(initialState: (phase: Phase.pending, expired: false))

    var isExpired: Bool { state.withLock { $0.expired } }
    var isGranted: Bool { state.withLock { $0.phase == .granted } }

    /// `true` si c'est ce rappel qui accorde le bail.
    func grant() -> Bool {
        state.withLock { current in
            guard current.phase == .pending else { return false }
            current.phase = .granted
            return true
        }
    }

    /// `true` si le bail n'était pas encore accordé : il ne le sera plus.
    @discardableResult
    func expire() -> Bool {
        state.withLock { current in
            current.expired = true
            guard current.phase == .pending else { return false }
            current.phase = .refused
            return true
        }
    }

    /// Ferme un bail resté en attente (le système n'a jamais répondu).
    func abandon() {
        state.withLock { current in
            if current.phase == .pending { current.phase = .refused }
        }
    }
}

/// Le bail d'une EXTENSION (la NSE) : `ProcessInfo.performExpiringActivity`,
/// le seul mécanisme qu'Apple ouvre aux extensions (« Extending your app's
/// background execution time », Quinn « UIApplication Background Task Notes »).
/// Le système appelle le bloc sur un fil à lui, et l'assertion tient tant que
/// ce bloc n'est pas revenu : il attend donc que `body`, exécuté sur le fil
/// appelant, ait fini. Un premier appel avec `expired == true` est un refus ;
/// un second, pendant `body`, marque le bail expiré — `body` (une seule
/// transaction, quelques millisecondes) finit, et la prise suivante est
/// refusée.
public struct E2EEExpiringActivityLeasing: E2EEExecutionLeasing {
    public typealias Perform = @Sendable (_ reason: String, _ block: @escaping @Sendable (Bool) -> Void) -> Void

    private let reason: String
    private let grantTimeout: DispatchTimeInterval
    private let perform: Perform

    public init(reason: String = "me.meeshy.e2ee.process-lock") {
        self.init(reason: reason, grantTimeout: .seconds(5)) { reason, block in
            ProcessInfo.processInfo.performExpiringActivity(withReason: reason, using: block)
        }
    }

    init(reason: String, grantTimeout: DispatchTimeInterval, perform: @escaping Perform) {
        self.reason = reason
        self.grantTimeout = grantTimeout
        self.perform = perform
    }

    public func withLease<T>(_ body: (any E2EEExecutionLease) throws -> T) throws -> T {
        let lease = E2EELeaseState()
        let decided = DispatchSemaphore(value: 0)
        let finished = DispatchSemaphore(value: 0)
        perform(reason) { expired in
            if expired {
                if lease.expire() { decided.signal() }
                return
            }
            guard lease.grant() else { return }
            decided.signal()
            finished.wait()
        }
        if decided.wait(timeout: .now() + grantTimeout) == .timedOut { lease.abandon() }
        guard lease.isGranted else { throw E2EEExecutionLeaseError.refused }
        defer { finished.signal() }
        guard !lease.isExpired else { throw E2EEExecutionLeaseError.expired }
        return try body(lease)
    }
}
