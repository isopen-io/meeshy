import Combine
import Foundation

/// Où l'alerte d'inactivité des autres survit à un démarrage à froid. Isolé pour être remplacé en test.
public protocol InactivityAlertStatePersisting: Sendable {
    func load() -> [InactivityAlertState]
    func save(_ states: [InactivityAlertState])
}

/// L'alerte d'inactivité des autres, cache d'abord (#18738) : ce qui a été servi se montre tout de suite, la socket et
/// l'instantané REST le corrigent ensuite. `inactivity:cleared`, l'absence de l'instantané ou un état plus vieux que
/// `InactivityCheckContract.stateTtl` : la personne n'a plus d'alerte.
@MainActor
public final class InactivityAlertStateStore: ObservableObject {

    public static let shared = InactivityAlertStateStore(persistence: UserDefaultsInactivityAlertStatePersistence())

    @Published public private(set) var states: [String: InactivityAlertState]

    private let persistence: InactivityAlertStatePersisting
    private let now: () -> Date

    nonisolated deinit {}

    public init(persistence: InactivityAlertStatePersisting, now: @escaping () -> Date = { Date() }) {
        self.persistence = persistence
        self.now = now
        let at = now()
        self.states = Dictionary(
            persistence.load().filter { !$0.isExpired(at: at) }.map { ($0.userId, $0) },
            uniquingKeysWith: Self.latest
        )
    }

    /// L'alerte servie pour une personne, `nil` quand elle va bien ou ne me la partage pas.
    public func state(for userId: String) -> InactivityAlertState? {
        guard let state = states[userId], !state.isExpired(at: now()) else { return nil }
        return state
    }

    /// `inactivity:alert` : une alerte plus ancienne que celle qu'on tient ne la remplace pas.
    public func apply(_ event: InactivityAlertRaised) {
        if let held = states[event.userId], held.alertedAt > event.state.alertedAt { return }
        guard states[event.userId] != event.state else { return }
        commit { $0[event.userId] = event.state }
    }

    /// `inactivity:cleared` : l'alerte s'efface.
    public func apply(_ event: InactivityAlertCleared) {
        guard states[event.userId] != nil else { return }
        commit { $0[event.userId] = nil }
    }

    /// L'instantané REST fait foi : ce qu'il ne porte plus n'est plus en alerte.
    public func reconcile(with snapshot: [InactivityAlertState]) {
        let at = now()
        let fresh = Dictionary(
            snapshot.filter { !$0.isExpired(at: at) }.map { ($0.userId, $0) },
            uniquingKeysWith: Self.latest
        )
        guard fresh != states else { return }
        commit { $0 = fresh }
    }

    /// À la déconnexion : rien ne survit au compte.
    public func reset() {
        guard !states.isEmpty else { return }
        commit { $0 = [:] }
    }

    private nonisolated static func latest(_ lhs: InactivityAlertState, _ rhs: InactivityAlertState) -> InactivityAlertState {
        lhs.alertedAt >= rhs.alertedAt ? lhs : rhs
    }

    private func commit(_ change: (inout [String: InactivityAlertState]) -> Void) {
        var next = states
        change(&next)
        states = next
        persistence.save(next.values.map(\.withoutPosition))
    }
}

/// La persistance par défaut : un JSON dans `UserDefaults`, borné à trois jours. La dernière POSITION n'y entre
/// jamais (#16984) : elle vit en mémoire, et le rattrapage de la connexion la rend.
public struct UserDefaultsInactivityAlertStatePersistence: InactivityAlertStatePersisting {
    private let key: String
    private let suiteName: String?

    public init(key: String = "me.meeshy.inactivity.alerts", suiteName: String? = nil) {
        self.key = key
        self.suiteName = suiteName
    }

    private var defaults: UserDefaults { suiteName.flatMap(UserDefaults.init(suiteName:)) ?? .standard }

    public func load() -> [InactivityAlertState] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([InactivityAlertState].self, from: data)) ?? []
    }

    public func save(_ states: [InactivityAlertState]) {
        guard let data = try? JSONEncoder().encode(states) else { return }
        defaults.set(data, forKey: key)
    }
}
