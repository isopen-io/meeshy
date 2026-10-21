import Foundation

// MARK: - Les boosts : Vent arrière et Heure du Prisme (#9373)
//
// MIROIR de `packages/shared/utils/game/boosts.ts`.

/// L'Heure du Prisme : [début, fin[ en minutes de la journée locale.
public struct PrismHourWindow: Codable, Sendable, Equatable {
    public let startMinute: Int
    public let endMinute: Int

    public init(startMinute: Int, endMinute: Int) {
        self.startMinute = startMinute
        self.endMinute = endMinute
    }

    public func contains(minuteOfDay: Int) -> Bool {
        minuteOfDay >= startMinute && minuteOfDay < endMinute
    }
}

public enum GameBoosts {
    /// Le Vent arrière : ×1,25 sur les étincelles des gestes.
    public static let tailwindFactor = 1.25
    /// L'écart au record de niveau à partir duquel le Vent arrière souffle (porteur 2026-10-17, #10896).
    public static let tailwindLevelGap = 7
    /// Les missions comptent double pendant l'Heure du Prisme.
    public static let prismHourMultiplier = 2

    private static let prismHourEarliestMinute = 9 * 60
    private static let prismHourLatestEndMinute = 21 * 60
    private static let prismHourLength = 60
    private static let prismHourGranularity = 15

    /// La loi d'AVANT les étincelles (#9377) : le Vent arrière soufflait dès que le niveau passait sous le record. Gardée
    /// pour le bloc d'un compte sans étincelles.
    public static func tailwind(level: Int, levelRecord: Int) -> Double {
        level < levelRecord ? tailwindFactor : 1
    }

    /// LE VENT ARRIÈRE DES ÉTINCELLES (#10896) — miroir de `sparksTailwindFactor`. Il souffle tant que le niveau est
    /// `tailwindLevelGap` niveaux ou plus sous le record de niveau du cycle, et s'arrête dès que l'écart retombe en
    /// dessous — sans état. Le record du cycle repart à 1 au Prestige : un Prestige ne l'allume pas.
    public static func sparksTailwind(level: Int, levelRecord: Int) -> Double {
        levelRecord - level >= tailwindLevelGap ? tailwindFactor : 1
    }

    /// Une heure par jour, tirée par la graine (utilisateur, jour), sur un quart
    /// d'heure, entre 9 h et 21 h locales — jamais d'Heure du Prisme après 21 h.
    public static func prismHour(userId: String, dayKey: String) -> PrismHourWindow {
        let slots = (prismHourLatestEndMinute - prismHourLength - prismHourEarliestMinute) / prismHourGranularity + 1
        var rng = GameRandom(parts: GameSeedParts(userId: userId, dayKey: dayKey, salt: "prism-hour"))
        let slot = Int((rng.next() * Double(slots)).rounded(.down))
        let start = prismHourEarliestMinute + slot * prismHourGranularity
        return PrismHourWindow(startMinute: start, endMinute: start + prismHourLength)
    }
}
