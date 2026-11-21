import Combine
import Foundation

/// Où « en appel » des autres survit à un démarrage à froid. Isolé pour être remplacé en test.
public protocol PhoneCallStatePersisting: Sendable {
    func load() -> [PhoneCallState]
    func save(_ states: [PhoneCallState])
}

/// « En appel » des autres, cache d'abord (#18753) : ce qui a été servi se montre tout de suite, la socket et
/// l'instantané REST le corrigent ensuite. Un `phone-call:started` REMPLACE l'état tenu (jamais de fusion),
/// `phone-call:ended` l'efface, l'instantané fait foi, et un état dont `expiresAt` est passé ne s'affiche plus — ni au
/// rechargement du cache, qui l'écarte aussi au repos.
@MainActor
public final class PhoneCallStateStore: ObservableObject {

    public static let shared = PhoneCallStateStore(persistence: UserDefaultsPhoneCallStatePersistence())

    @Published public private(set) var states: [String: PhoneCallState]

    private let persistence: PhoneCallStatePersisting
    private let now: () -> Date

    nonisolated deinit {}

    public init(persistence: PhoneCallStatePersisting, now: @escaping () -> Date = { Date() }) {
        self.persistence = persistence
        self.now = now
        let loaded = persistence.load()
        let live = Self.live(loaded, at: now())
        self.states = live
        if live.count != loaded.count { persistence.save(Array(live.values)) }
    }

    /// L'état servi pour une personne, `nil` hors appel, passé `expiresAt`, ou quand elle ne me le partage pas.
    public func state(for userId: String) -> PhoneCallState? {
        guard let state = states[userId], !state.isExpired(at: now()) else { return nil }
        return state
    }

    /// `phone-call:started` : l'état reçu remplace celui qu'on tient.
    public func apply(_ event: PhoneCallStarted) {
        let next = event.state.isExpired(at: now()) ? nil : event.state
        guard states[event.userId] != next else { return }
        commit { $0[event.userId] = next }
    }

    /// `phone-call:ended` : l'état s'efface.
    public func apply(_ event: PhoneCallEnded) {
        guard states[event.userId] != nil else { return }
        commit { $0[event.userId] = nil }
    }

    /// L'instantané REST fait foi : ce qu'il ne porte plus n'est plus en appel.
    public func reconcile(with snapshot: [PhoneCallState]) {
        let fresh = Self.live(snapshot, at: now())
        guard fresh != states else { return }
        commit { $0 = fresh }
    }

    /// Au changement de compte : rien ne survit au compte.
    public func reset() {
        guard !states.isEmpty else { return }
        commit { $0 = [:] }
    }

    private nonisolated static func live(_ states: [PhoneCallState], at instant: Date) -> [String: PhoneCallState] {
        Dictionary(
            states.filter { !$0.isExpired(at: instant) }.map { ($0.userId, $0) },
            uniquingKeysWith: { lhs, rhs in lhs.expiresAt >= rhs.expiresAt ? lhs : rhs }
        )
    }

    private func commit(_ change: (inout [String: PhoneCallState]) -> Void) {
        var next = states
        change(&next)
        states = next
        persistence.save(Array(next.values))
    }
}

/// La persistance par défaut : un JSON dans `UserDefaults`. Seuls les états voyagent au repos — qui, depuis quand,
/// jusqu'à quand — et l'expiré en sort au chargement.
public struct UserDefaultsPhoneCallStatePersistence: PhoneCallStatePersisting {
    private let key: String
    private let suiteName: String?

    public init(key: String = "me.meeshy.phoneCall.states", suiteName: String? = nil) {
        self.key = key
        self.suiteName = suiteName
    }

    private var defaults: UserDefaults { suiteName.flatMap(UserDefaults.init(suiteName:)) ?? .standard }

    public func load() -> [PhoneCallState] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([PhoneCallState].self, from: data)) ?? []
    }

    public func save(_ states: [PhoneCallState]) {
        guard let data = try? JSONEncoder().encode(states) else { return }
        defaults.set(data, forKey: key)
    }
}
