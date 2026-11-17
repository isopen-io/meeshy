import Combine
import Foundation

/// Où l'état de la batterie des autres survit à un démarrage à froid. Isolé pour être remplacé en test.
public protocol BatteryStatePersisting: Sendable {
    func load() -> [BatteryReaderState]
    func save(_ states: [BatteryReaderState])
}

/// L'état de la batterie des autres, cache d'abord (#14147) : ce qui a été servi se montre tout de suite, la socket
/// et l'instantané REST le corrigent ensuite. Hors épisode — `battery:cleared`, absence de l'instantané ou relevé
/// plus vieux que `BatteryContract.stateTtl` — la personne n'a plus d'état, donc plus d'icône.
@MainActor
public final class BatteryStateStore: ObservableObject {

    public static let shared = BatteryStateStore(persistence: UserDefaultsBatteryStatePersistence())

    @Published public private(set) var states: [String: BatteryReaderState]

    private let persistence: BatteryStatePersisting
    private let now: () -> Date

    nonisolated deinit {}

    public init(persistence: BatteryStatePersisting, now: @escaping () -> Date = { Date() }) {
        self.persistence = persistence
        self.now = now
        let at = now()
        self.states = Dictionary(
            persistence.load().filter { !$0.isExpired(at: at) }.map { ($0.userId, $0) },
            uniquingKeysWith: { lhs, rhs in lhs.measuredAt >= rhs.measuredAt ? lhs : rhs }
        )
    }

    /// L'état servi pour une personne, `nil` hors épisode.
    public func state(for userId: String) -> BatteryReaderState? {
        guard let state = states[userId], !state.isExpired(at: now()) else { return nil }
        return state
    }

    /// `battery:changed` : un relevé plus ancien que celui qu'on tient ne le remplace pas.
    public func apply(_ event: BatteryChanged) {
        if let held = states[event.userId], held.measuredAt > event.state.measuredAt { return }
        commit { $0[event.userId] = event.state }
    }

    /// `battery:cleared` : l'épisode est clos, l'état s'efface.
    public func apply(_ event: BatteryCleared) {
        guard states[event.userId] != nil else { return }
        commit { $0[event.userId] = nil }
    }

    /// L'instantané REST fait foi : ce qu'il ne porte plus n'est plus en épisode.
    public func reconcile(with snapshot: [BatteryReaderState]) {
        let at = now()
        let fresh = Dictionary(
            snapshot.filter { !$0.isExpired(at: at) }.map { ($0.userId, $0) },
            uniquingKeysWith: { lhs, rhs in lhs.measuredAt >= rhs.measuredAt ? lhs : rhs }
        )
        guard fresh != states else { return }
        commit { $0 = fresh }
    }

    /// Le relevé d'UNE personne, relu par REST (`nil` = hors épisode).
    public func replace(userId: String, with state: BatteryReaderState?) {
        guard states[userId] != state else { return }
        commit { $0[userId] = state }
    }

    /// À la déconnexion : rien ne survit au compte.
    public func reset() {
        guard !states.isEmpty else { return }
        commit { $0 = [:] }
    }

    private func commit(_ change: (inout [String: BatteryReaderState]) -> Void) {
        var next = states
        change(&next)
        states = next
        persistence.save(Array(next.values))
    }
}

/// La persistance par défaut : un JSON dans `UserDefaults` (aucune donnée sensible au sens du Keychain — un
/// niveau de batterie servi, borné à 24 h).
public struct UserDefaultsBatteryStatePersistence: BatteryStatePersisting {
    private let key: String
    private let suiteName: String?

    public init(key: String = "me.meeshy.battery.states", suiteName: String? = nil) {
        self.key = key
        self.suiteName = suiteName
    }

    private var defaults: UserDefaults { suiteName.flatMap(UserDefaults.init(suiteName:)) ?? .standard }

    public func load() -> [BatteryReaderState] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([BatteryReaderState].self, from: data)) ?? []
    }

    public func save(_ states: [BatteryReaderState]) {
        guard let data = try? JSONEncoder().encode(states) else { return }
        defaults.set(data, forKey: key)
    }
}
