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

    public let held: Int
    /// `nil` sans Meesh gardée.
    public let tier: TreasuryTierKey?
    /// Le palier suivant et ce qu'il manque, `nil` à la réserve.
    public let next: Next?

    public init(held: Int, tier: TreasuryTierKey?, next: Next?) {
        self.held = held
        self.tier = tier
        self.next = next
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
