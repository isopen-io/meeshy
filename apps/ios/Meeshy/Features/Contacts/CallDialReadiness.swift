import Foundation
import MeeshySDK

// MARK: - Ce qu'un rappel attend avant de partir (#8199)

/// Un rappel lancé depuis l'app FERMÉE (Récents, Siri, la notification d'appel
/// manqué) arrive avant que la session soit relue et que le socket soit monté :
/// `call:initiate` partirait dans le vide et l'autre ne sonnerait jamais. Ce qui
/// doit être vrai avant de composer tient dans trois faits.
nonisolated struct CallDialReadinessSnapshot: Equatable, Sendable {
    let sessionResolved: Bool
    let authenticated: Bool
    let socketConnected: Bool

    /// `nil` : il faut encore attendre.
    var verdict: CallDialReadinessOutcome? {
        if authenticated && socketConnected { return .ready }
        if sessionResolved && !authenticated { return .signedOut }
        return nil
    }

    /// Un point d'entrée garde la demande tant que la session n'a pas été
    /// relue : au démarrage à froid, « non connecté » veut d'abord dire
    /// « personne n'a encore regardé ».
    static func mayQueueDial(sessionResolved: Bool, authenticated: Bool) -> Bool {
        authenticated || !sessionResolved
    }
}

nonisolated enum CallDialReadinessOutcome: Equatable, Sendable {
    case ready
    case signedOut
    case timedOut
}

@MainActor
protocol CallDialReadinessProviding: AnyObject {
    var isReady: Bool { get }
    func waitUntilReady() async -> CallDialReadinessOutcome
}

@MainActor
final class CallDialReadiness: CallDialReadinessProviding {
    nonisolated deinit {}

    static let shared = CallDialReadiness()

    private let snapshot: @MainActor () -> CallDialReadinessSnapshot
    private let connect: @MainActor () -> Void
    private let timeout: Duration
    private let pollInterval: Duration

    init(
        snapshot: @escaping @MainActor () -> CallDialReadinessSnapshot = {
            CallDialReadinessSnapshot(
                sessionResolved: AuthManager.shared.hasResolvedStoredSession,
                authenticated: AuthManager.shared.isAuthenticated,
                socketConnected: MessageSocketManager.shared.isConnected
            )
        },
        connect: @escaping @MainActor () -> Void = { MessageSocketManager.shared.connect() },
        timeout: Duration = .seconds(15),
        pollInterval: Duration = .milliseconds(200)
    ) {
        self.snapshot = snapshot
        self.connect = connect
        self.timeout = timeout
        self.pollInterval = pollInterval
    }

    var isReady: Bool {
        snapshot().verdict == .ready
    }

    /// Relit l'état toutes les `pollInterval` jusqu'à un verdict ou au délai.
    /// Une session présente sans socket demande UNE connexion — la même que
    /// `CallManager.joinCallRoomReliably` pour un appel ENTRANT à froid : la
    /// vue racine qui la déclenche d'ordinaire n'est peut-être pas encore là.
    func waitUntilReady() async -> CallDialReadinessOutcome {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: timeout)
        var connectRequested = false
        while true {
            let current = snapshot()
            if let verdict = current.verdict { return verdict }
            if current.authenticated && !connectRequested {
                connectRequested = true
                connect()
            }
            guard clock.now < deadline, !Task.isCancelled else { return .timedOut }
            try? await Task.sleep(for: pollInterval)
        }
    }
}
