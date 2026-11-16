import Combine
import Foundation

/// Où l'état d'injoignabilité des autres survit à un démarrage à froid. Isolé pour être remplacé en test.
public protocol PhoneReachabilityStatePersisting: Sendable {
    func load() -> [PhoneReachabilityState]
    func save(_ states: [PhoneReachabilityState])
}

/// Le téléphone injoignable des autres, cache d'abord (#18737) : ce qui a été servi se montre tout de suite, la socket
/// et l'instantané REST le corrigent ensuite. `phone:reachable`, l'absence de l'instantané ou un état plus vieux que
/// `PhoneReachabilityContract.stateTtl` : la personne n'a plus d'état, donc plus de glyphe.
@MainActor
public final class PhoneReachabilityStateStore: ObservableObject {

    public static let shared = PhoneReachabilityStateStore(persistence: UserDefaultsPhoneReachabilityStatePersistence())

    @Published public private(set) var states: [String: PhoneReachabilityState]

    private let persistence: PhoneReachabilityStatePersisting
    private let now: () -> Date

    nonisolated deinit {}

    public init(persistence: PhoneReachabilityStatePersisting, now: @escaping () -> Date = { Date() }) {
        self.persistence = persistence
        self.now = now
        let at = now()
        self.states = Dictionary(
            persistence.load().filter { !$0.isExpired(at: at) }.map { ($0.userId, $0) },
            uniquingKeysWith: Self.latest
        )
    }

    /// L'état servi pour une personne, `nil` quand son téléphone répond.
    public func state(for userId: String) -> PhoneReachabilityState? {
        guard let state = states[userId], !state.isExpired(at: now()) else { return nil }
        return state
    }

    /// `phone:unreachable` : un épisode plus ancien que celui qu'on tient ne le remplace pas.
    public func apply(_ event: PhoneReachabilityChanged) {
        if let held = states[event.userId], held.unreachableSince > event.state.unreachableSince { return }
        guard states[event.userId] != event.state else { return }
        commit { $0[event.userId] = event.state }
    }

    /// `phone:reachable` : le téléphone répond de nouveau, l'état s'efface.
    public func apply(_ event: PhoneReachabilityCleared) {
        guard states[event.userId] != nil else { return }
        commit { $0[event.userId] = nil }
    }

    /// L'instantané REST fait foi : ce qu'il ne porte plus répond de nouveau.
    public func reconcile(with snapshot: [PhoneReachabilityState]) {
        let at = now()
        let fresh = Dictionary(
            snapshot.filter { !$0.isExpired(at: at) }.map { ($0.userId, $0) },
            uniquingKeysWith: Self.latest
        )
        guard fresh != states else { return }
        commit { $0 = fresh }
    }

    /// L'état d'UNE personne, relu par REST (`nil` = son téléphone répond).
    public func replace(userId: String, with state: PhoneReachabilityState?) {
        guard states[userId] != state else { return }
        commit { $0[userId] = state }
    }

    /// À la déconnexion : rien ne survit au compte.
    public func reset() {
        guard !states.isEmpty else { return }
        commit { $0 = [:] }
    }

    private nonisolated static func latest(_ lhs: PhoneReachabilityState, _ rhs: PhoneReachabilityState) -> PhoneReachabilityState {
        lhs.unreachableSince >= rhs.unreachableSince ? lhs : rhs
    }

    private func commit(_ change: (inout [String: PhoneReachabilityState]) -> Void) {
        var next = states
        change(&next)
        states = next
        persistence.save(Array(next.values))
    }
}

/// La persistance par défaut : un JSON dans `UserDefaults` (aucune donnée sensible au sens du Keychain — un instant et
/// une cause probable, bornés à trois jours).
public struct UserDefaultsPhoneReachabilityStatePersistence: PhoneReachabilityStatePersisting {
    private let key: String
    private let suiteName: String?

    public init(key: String = "me.meeshy.phoneReachability.states", suiteName: String? = nil) {
        self.key = key
        self.suiteName = suiteName
    }

    private var defaults: UserDefaults { suiteName.flatMap(UserDefaults.init(suiteName:)) ?? .standard }

    public func load() -> [PhoneReachabilityState] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([PhoneReachabilityState].self, from: data)) ?? []
    }

    public func save(_ states: [PhoneReachabilityState]) {
        guard let data = try? JSONEncoder().encode(states) else { return }
        defaults.set(data, forKey: key)
    }
}
