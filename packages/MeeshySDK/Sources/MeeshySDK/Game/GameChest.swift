import Foundation

// MARK: - Le coffre du jour (#9373)
//
// MIROIR de `packages/shared/utils/game/chest.ts` — déterministe par utilisateur
// et par jour. 60 à 200 points, un fragment de cosmétique (1 chance sur 6), un
// gel de Flamme (1 sur 20). Les probabilités s'affichent AVANT l'ouverture ;
// jamais de Meesh, aucune valeur monétaire.

/// Ce que le coffre peut contenir — affiché avant l'ouverture.
public struct ChestOdds: Codable, Sendable, Equatable {
    public let minPoints: Int
    public let maxPoints: Int
    public let fragment: Double
    public let freeze: Double

    public init(minPoints: Int, maxPoints: Int, fragment: Double, freeze: Double) {
        self.minPoints = minPoints
        self.maxPoints = maxPoints
        self.fragment = fragment
        self.freeze = freeze
    }
}

public struct DailyChest: Codable, Sendable, Equatable {
    public let points: Int
    public let fragment: Bool
    public let freeze: Bool

    public init(points: Int, fragment: Bool, freeze: Bool) {
        self.points = points
        self.fragment = fragment
        self.freeze = freeze
    }
}

public enum GameChest {
    public static let odds = ChestOdds(minPoints: 60, maxPoints: 200, fragment: 1.0 / 6.0, freeze: 1.0 / 20.0)

    public static func daily(userId: String, dayKey: String) -> DailyChest {
        var rng = GameRandom(parts: GameSeedParts(userId: userId, dayKey: dayKey, salt: "chest"))
        let span = odds.maxPoints - odds.minPoints + 1
        let points = odds.minPoints + Int((rng.next() * Double(span)).rounded(.down))
        let fragment = rng.next() < odds.fragment
        let freeze = rng.next() < odds.freeze
        return DailyChest(points: points, fragment: fragment, freeze: freeze)
    }
}
