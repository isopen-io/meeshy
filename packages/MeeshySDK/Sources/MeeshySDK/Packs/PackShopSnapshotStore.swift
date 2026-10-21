import Foundation

// MARK: - Le dernier contenu connu de la vitrine (#10710, Cache-First)
//
// La vitrine s'ouvre sur ce qu'elle a lu la dernière fois — jamais sur des rangées fantômes
// quand un contenu existe, même périmé. Frais ⇒ servi tel quel ; périmé ⇒ servi puis
// rafraîchi en silence (SWR) ; absent ou expiré ⇒ rangées fantômes (démarrage à froid seulement).

public protocol PackShopSnapshotStoring: Sendable {
    func read(domains: [PackDomain]?) -> CacheResult<PackShopResponse>
    func write(_ state: PackShopState, domains: [PackDomain]?)
}

public struct PackShopSnapshotStore: PackShopSnapshotStoring, @unchecked Sendable {
    public static let shared = PackShopSnapshotStore()

    /// Frais une minute ; servable (périmé) une semaine, au-delà la lecture repart de zéro.
    public static let policy = CachePolicy(ttl: .days(7), staleTTL: .minutes(1), maxItemCount: nil, storageLocation: .grdb)

    private struct Snapshot: Codable {
        let sections: [PackShopSection]
        let balance: Int?
        let savedAt: Date
    }

    private let defaults: UserDefaults
    private let now: @Sendable () -> Date
    private let policy: CachePolicy

    public init(defaults: UserDefaults = .standard, policy: CachePolicy = PackShopSnapshotStore.policy, now: @escaping @Sendable () -> Date = { Date() }) {
        self.defaults = defaults
        self.policy = policy
        self.now = now
    }

    private static let keyPrefix = "meeshy.pack-shop-snapshot.v1."

    private static func key(_ domains: [PackDomain]?) -> String {
        let names = (domains ?? PackDomain.allCases).filter { $0 != .unknown }.map(\.rawValue).sorted()
        return keyPrefix + names.joined(separator: ",")
    }

    public func read(domains: [PackDomain]?) -> CacheResult<PackShopResponse> {
        guard let data = defaults.data(forKey: Self.key(domains)),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data) else { return .empty }
        let response = PackShopResponse(sections: snapshot.sections, balance: snapshot.balance)
        let age = max(0, now().timeIntervalSince(snapshot.savedAt))
        switch policy.freshness(age: age) {
        case .fresh: return .fresh(response, age: age)
        case .stale: return .stale(response, age: age)
        case .expired: return .expired
        }
    }

    public func write(_ state: PackShopState, domains: [PackDomain]?) {
        guard let sections = state.sections else { return }
        let snapshot = Snapshot(sections: sections, balance: state.balance, savedAt: now())
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: Self.key(domains))
    }

    /// L'instantané porte le solde et les packs POSSÉDÉS du compte qui l'a lu : il part avec sa
    /// session (`AuthManager.leaveActiveSession`), jamais servi au compte suivant.
    public func clearAll() {
        defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(Self.keyPrefix) }
            .forEach(defaults.removeObject(forKey:))
    }
}
