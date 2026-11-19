import Combine
import Foundation

/// Où la chute détectée des autres survit à un démarrage à froid. Isolé pour être remplacé en test.
public protocol FallStatePersisting: Sendable {
    func load() -> [FallState]
    func save(_ states: [FallState])
}

/// La chute détectée des autres, cache d'abord (#18748) : ce qui a été servi se montre tout de suite, la socket et
/// l'instantané REST le corrigent ensuite. Une chute plus ANCIENNE que celle tenue ne la remplace pas, `fall:cleared`
/// (ou la levée poussée) l'efface, l'instantané fait foi, et un état dont `expiresAt` est passé ne s'affiche plus — ni au
/// rechargement du cache. La dernière POSITION n'est JAMAIS rangée au repos.
@MainActor
public final class FallStateStore: ObservableObject {

    public static let shared = FallStateStore(persistence: UserDefaultsFallStatePersistence())

    @Published public private(set) var states: [String: FallState]

    private let persistence: FallStatePersisting
    private let now: () -> Date

    nonisolated deinit {}

    public init(persistence: FallStatePersisting, now: @escaping () -> Date = { Date() }) {
        self.persistence = persistence
        self.now = now
        let loaded = persistence.load()
        let live = Self.live(loaded, at: now())
        self.states = live
        if live.count != loaded.count { persistence.save(live.values.map(\.withoutPosition)) }
    }

    /// L'épisode servi pour une personne, `nil` hors épisode, passé `expiresAt`, ou quand elle ne me le partage pas.
    public func state(for userId: String) -> FallState? {
        guard let state = states[userId], !state.isExpired(at: now()) else { return nil }
        return state
    }

    /// `fall:detected` : une chute plus ancienne que celle tenue ne la remplace pas ; un état déjà expiré ne s'affiche pas.
    public func apply(_ event: FallDetected) {
        if let held = states[event.userId], held.detectedAt > event.state.detectedAt { return }
        let next = event.state.isExpired(at: now()) ? nil : event.state
        guard states[event.userId] != next else { return }
        commit { $0[event.userId] = next }
    }

    /// `fall:cleared`, ou la levée poussée (`safety_alert_cleared`) : l'état s'efface.
    public func clear(userId: String) {
        guard states[userId] != nil else { return }
        commit { $0[userId] = nil }
    }

    /// L'instantané REST fait foi : ce qu'il ne porte plus n'est plus en cours.
    public func reconcile(with snapshot: [FallState]) {
        let fresh = Self.live(snapshot, at: now())
        guard fresh != states else { return }
        commit { $0 = fresh }
    }

    /// Au changement de compte : rien ne survit au compte.
    public func reset() {
        guard !states.isEmpty else { return }
        commit { $0 = [:] }
    }

    private nonisolated static func live(_ states: [FallState], at instant: Date) -> [String: FallState] {
        Dictionary(
            states.filter { !$0.isExpired(at: instant) }.map { ($0.userId, $0) },
            uniquingKeysWith: { lhs, rhs in lhs.detectedAt >= rhs.detectedAt ? lhs : rhs }
        )
    }

    private func commit(_ change: (inout [String: FallState]) -> Void) {
        var next = states
        change(&next)
        states = next
        persistence.save(next.values.map(\.withoutPosition))
    }
}

/// La persistance par défaut : un JSON dans `UserDefaults`. La dernière POSITION n'y entre jamais : le store ne lui
/// remet que `withoutPosition`, et le rattrapage de la connexion la rend.
public struct UserDefaultsFallStatePersistence: FallStatePersisting {
    private let key: String
    private let suiteName: String?

    public init(key: String = "me.meeshy.fall.states", suiteName: String? = nil) {
        self.key = key
        self.suiteName = suiteName
    }

    private var defaults: UserDefaults { suiteName.flatMap(UserDefaults.init(suiteName:)) ?? .standard }

    public func load() -> [FallState] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([FallState].self, from: data)) ?? []
    }

    public func save(_ states: [FallState]) {
        guard let data = try? JSONEncoder().encode(states.map(\.withoutPosition)) else { return }
        defaults.set(data, forKey: key)
    }
}
