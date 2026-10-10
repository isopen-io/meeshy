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
    /// +25 % sur les points tant que le niveau est sous le niveau record.
    public static let tailwindFactor = 1.25
    /// Les missions comptent double pendant l'Heure du Prisme.
    public static let prismHourMultiplier = 2

    private static let prismHourEarliestMinute = 9 * 60
    private static let prismHourLatestEndMinute = 21 * 60
    private static let prismHourLength = 60
    private static let prismHourGranularity = 15

    public static func tailwind(level: Int, levelRecord: Int) -> Double {
        level < levelRecord ? tailwindFactor : 1
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
