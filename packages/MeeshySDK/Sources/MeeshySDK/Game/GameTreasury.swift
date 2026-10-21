import Foundation

// MARK: - Le trésor (#9373)
//
// MIROIR de `packages/shared/utils/game/treasury.ts` — les Meeshes GARDÉES, six
// paliers visibles sur le profil. Il baisse quand on dépense.

public enum TreasuryTierKey: String, CaseIterable, Codable, Sendable, Hashable {
    case bourse
    case escarcelle
    case coffret
    case coffre
    case tresor
    case reserve

    public var minHeld: Int {
        switch self {
        case .bourse: 1
        case .escarcelle: 10
        case .coffret: 50
        case .coffre: 100
        case .tresor: 500
        case .reserve: 1000
        }
    }
}

/// Même forme que le bloc `treasury` de `GET /me/engagement`.
public struct TreasuryStanding: Codable, Sendable, Equatable {
    public struct Next: Codable, Sendable, Equatable {
        public let key: TreasuryTierKey
        public let minHeld: Int
        public let missing: Int

        public init(key: TreasuryTierKey, minHeld: Int, missing: Int) {
            self.key = key
            self.minHeld = minHeld
            self.missing = missing
        }
    }

    /// L'état d'une réserve pour CE compte : fermée ou ouverte par son rang (#10848).
    public struct Access: Codable, Sendable, Equatable {
        public let key: TreasuryTierKey
        public let minHeld: Int
        public let locked: Bool
        /// `nil` : ouverte à tous.
        public let requires: GameRankRequirement?

        public init(key: TreasuryTierKey, minHeld: Int, locked: Bool, requires: GameRankRequirement?) {
            self.key = key
            self.minHeld = minHeld
            self.locked = locked
            self.requires = requires
        }
    }

    public let held: Int
    /// `nil` sans Meesh gardée.
    public let tier: TreasuryTierKey?
    /// Le palier suivant et ce qu'il manque, `nil` à la réserve.
    public let next: Next?
    /// Pour chaque réserve, son état et le rang requis (#10848) — `nil` devant un serveur antérieur. Une entrée
    /// illisible (réserve inconnue) est sautée, jamais la liste entière.
    public let access: [Access]?

    public init(held: Int, tier: TreasuryTierKey?, next: Next?, access: [Access]? = nil) {
        self.held = held
        self.tier = tier
        self.next = next
        self.access = access
    }

    private enum CodingKeys: String, CodingKey { case held, tier, next, access }

    private struct Lenient<T: Decodable>: Decodable {
        let value: T?
        init(from decoder: Decoder) throws { value = try? T(from: decoder) }
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        held = try c.decode(Int.self, forKey: .held)
        tier = try c.decodeIfPresent(TreasuryTierKey.self, forKey: .tier)
        next = try c.decodeIfPresent(Next.self, forKey: .next)
        access = ((try? c.decodeIfPresent([Lenient<Access>].self, forKey: .access)) ?? nil)?.compactMap(\.value)
    }
}

public enum GameTreasury {
    public static func standing(held rawHeld: Int) -> TreasuryStanding {
        let held = max(0, rawHeld)
        let reached = TreasuryTierKey.allCases.last { held >= $0.minHeld }
        let upcoming = TreasuryTierKey.allCases.first { held < $0.minHeld }
        return TreasuryStanding(
            held: held,
            tier: reached,
            next: upcoming.map { .init(key: $0, minHeld: $0.minHeld, missing: $0.minHeld - held) }
        )
    }
}
