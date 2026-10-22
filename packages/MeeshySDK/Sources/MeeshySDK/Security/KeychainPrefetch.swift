import Foundation

/// Ce que le trousseau a répondu pour une clé. `unavailable` n'est PAS `absent` :
/// avant le premier déverrouillage, `securityd` refuse de lire
/// (`errSecInteractionNotAllowed`), et prendre ce refus pour un vide ouvrirait
/// une base sans sa clé, ou la session d'aucun compte.
enum KeychainRead: Sendable, Equatable {
    case value(String)
    case absent
    case unavailable
}

/// Les clés lues ensemble au démarrage, et celles qui dépendent de leur réponse
/// (la session du compte actif ne se nomme qu'une fois le compte actif lu).
struct KeychainPrefetchPlan: Sendable {
    let keys: [String]
    let followUp: @Sendable ([String: KeychainRead]) -> [String]
}

/// **Les lectures du trousseau du premier écran, faites AVANT qu'il ne les demande** (#11587).
///
/// Chaque lecture du trousseau est un aller-retour XPC synchrone vers `securityd`.
/// Le premier écran en a besoin de quelques-unes — la clé de la base, le compte
/// actif, la liste des comptes, la session — et les faisait sur le fil
/// principal. Elles partent désormais sur une file à part dès le lancement du
/// processus ; le lecteur RAMASSE la réponse, et n'attend que si elle n'est pas
/// encore arrivée — jamais plus longtemps que la lecture elle-même.
///
/// Ce qui rend ce ramassage sûr :
/// - une réponse ne sert qu'UNE fois : la lecture suivante va au trousseau ;
/// - une écriture du processus la retire, même arrivée pendant la lecture ;
/// - un trousseau indisponible n'est jamais servi : la lecture directe décide ;
/// - ce que personne n'a pris disparaît de la mémoire après `lifetime` : la
///   lecture suivante, la constatant expirée, purge tout — sans minuterie.
final class KeychainPrefetch: Sendable {
    private enum Phase: Sendable { case idle, inFlight, settled }

    private struct State: Sendable {
        var phase: Phase = .idle
        var entries: [String: KeychainRead] = [:]
        var touchedInFlight: Set<String> = []
        var discardOnLanding = false
        var expiresAt: Date?
    }

    private let state = Locked(State())
    private let landing = DispatchGroup()
    private let waitLimit: DispatchTimeInterval
    private let now: @Sendable () -> Date

    init(waitLimit: DispatchTimeInterval = .seconds(2), now: @escaping @Sendable () -> Date = Date.init) {
        self.waitLimit = waitLimit
        self.now = now
    }

    func start(_ plan: KeychainPrefetchPlan, on queue: DispatchQueue, lifetime: DispatchTimeInterval,
               read: @escaping @Sendable (String) -> KeychainRead) {
        let begins = state.mutate { state -> Bool in
            guard state.phase == .idle else { return false }
            state.phase = .inFlight
            return true
        }
        guard begins else { return }
        landing.enter()
        queue.async { [self] in
            let first = Dictionary(plan.keys.map { ($0, read($0)) }, uniquingKeysWith: { a, _ in a })
            let following = plan.followUp(first).filter { first[$0] == nil }
            let found = first.merging(following.map { ($0, read($0)) }, uniquingKeysWith: { a, _ in a })
            land(found, lifetime: Self.seconds(lifetime))
            landing.leave()
        }
    }

    /// La réponse lue d'avance pour `key`, UNE fois. `nil` : lire le trousseau.
    func take(_ key: String) -> KeychainRead? {
        settle()
        let instant = now()
        return state.mutate { state -> KeychainRead? in
            guard state.phase == .settled else {
                state.touchedInFlight.insert(key)
                return nil
            }
            if let expiresAt = state.expiresAt, instant >= expiresAt { state.entries = [:] }
            return state.entries.removeValue(forKey: key)
        }
    }

    /// Une écriture du processus : la réponse lue d'avance est périmée.
    func invalidate(_ key: String) {
        settle()
        state.mutate { state in
            if state.phase == .inFlight { state.touchedInFlight.insert(key) }
            state.entries[key] = nil
        }
    }

    func invalidateAll() {
        settle()
        state.mutate { state in
            if state.phase == .inFlight { state.discardOnLanding = true }
            state.entries = [:]
        }
    }

    private func land(_ found: [String: KeychainRead], lifetime: TimeInterval) {
        let landedAt = now()
        state.mutate { state in
            state.entries = state.discardOnLanding ? [:] : found.filter {
                $0.value != .unavailable && !state.touchedInFlight.contains($0.key)
            }
            state.touchedInFlight = []
            state.discardOnLanding = false
            state.expiresAt = landedAt.addingTimeInterval(lifetime)
            state.phase = .settled
        }
    }

    private static func seconds(_ interval: DispatchTimeInterval) -> TimeInterval {
        switch interval {
        case .seconds(let value): TimeInterval(value)
        case .milliseconds(let value): TimeInterval(value) / 1_000
        case .microseconds(let value): TimeInterval(value) / 1_000_000
        case .nanoseconds(let value): TimeInterval(value) / 1_000_000_000
        case .never: .infinity
        @unknown default: 0
        }
    }

    private func settle() {
        guard state.read({ $0.phase == .inFlight }) else { return }
        _ = landing.wait(timeout: .now() + waitLimit)
    }
}
