import Foundation

// MARK: - Le coffre du jour (#9373, #10011)
//
// MIROIR de `packages/shared/utils/game/chest.ts` — déterministe par utilisateur, par jour et par EFFORT des
// missions du jour. Des points (100 à 10 000 selon l'effort), de la Gloire (un point pour dix points), des
// fragments de Meesh (1, 2 dès 2 500 points, 3 dès 7 500, plus un en prime une fois sur six — cinq paient une
// frappe gratuite, `GameMint.previewWithFragments`) et un gel de Flamme une fois sur vingt. Gratuit ; contenu certain et probabilités affichés AVANT
// l'ouverture ; rien ne se transfère ni ne se convertit en argent.
//
// L'EFFORT se calcule sur le catalogue, côté passerelle (`dayEffort`) : le client lit le contenu du jour servi
// (`GameBlock.Chest.today`) et ne rejoue que la loi qui part de l'effort.

/// Ce que le coffre peut contenir — affiché avant l'ouverture. Les bornes de Gloire et de fragments manquent
/// devant un serveur d'avant #10011.
public struct ChestOdds: Codable, Sendable, Equatable {
    public let minPoints: Int
    public let maxPoints: Int
    /// La chance d'UN fragment de Meesh en prime.
    public let fragment: Double
    public let freeze: Double
    public let minGlory: Int?
    public let maxGlory: Int?
    public let minMeeshFragments: Int?
    public let maxMeeshFragments: Int?
    public let meeshFragmentsPerMeesh: Int?

    public init(minPoints: Int, maxPoints: Int, fragment: Double, freeze: Double,
                minGlory: Int? = nil, maxGlory: Int? = nil, minMeeshFragments: Int? = nil,
                maxMeeshFragments: Int? = nil, meeshFragmentsPerMeesh: Int? = nil) {
        self.minPoints = minPoints
        self.maxPoints = maxPoints
        self.fragment = fragment
        self.freeze = freeze
        self.minGlory = minGlory
        self.maxGlory = maxGlory
        self.minMeeshFragments = minMeeshFragments
        self.maxMeeshFragments = maxMeeshFragments
        self.meeshFragmentsPerMeesh = meeshFragmentsPerMeesh
    }
}

/// Le contenu du coffre ouvert. `glory` et `meeshFragments` valent 0 devant un coffre ouvert avant #10011
/// (ou un serveur antérieur) : un ancien coffre se lit encore.
public struct DailyChest: Codable, Sendable, Equatable {
    public let points: Int
    /// Le fragment de Meesh EN PRIME — le seul que connaissaient les clients d'avant #10011.
    public let fragment: Bool
    public let freeze: Bool
    public let glory: Int
    /// Tous les fragments de Meesh du coffre, prime comprise.
    public let meeshFragments: Int

    public init(points: Int, fragment: Bool, freeze: Bool, glory: Int = 0, meeshFragments: Int = 0) {
        self.points = points
        self.fragment = fragment
        self.freeze = freeze
        self.glory = glory
        self.meeshFragments = meeshFragments
    }

    private enum CodingKeys: String, CodingKey {
        case points, fragment, freeze, glory, meeshFragments
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        points = try container.decode(Int.self, forKey: .points)
        fragment = try container.decode(Bool.self, forKey: .fragment)
        freeze = try container.decode(Bool.self, forKey: .freeze)
        glory = (try? container.decodeIfPresent(Int.self, forKey: .glory)) ?? 0
        meeshFragments = (try? container.decodeIfPresent(Int.self, forKey: .meeshFragments)) ?? 0
    }
}

/// Le contenu CERTAIN du coffre du jour, servi avant l'ouverture.
public struct ChestContent: Codable, Sendable, Equatable {
    public let points: Int
    public let glory: Int
    /// Les fragments certains, sans celui de la prime.
    public let meeshFragments: Int

    public init(points: Int, glory: Int, meeshFragments: Int) {
        self.points = points
        self.glory = glory
        self.meeshFragments = meeshFragments
    }
}

/// Les fragments de Meesh en poche : `held`, sur les `perMeesh` (cinq) d'une frappe gratuite.
public struct MeeshFragmentProgress: Codable, Sendable, Equatable {
    public let held: Int
    public let perMeesh: Int

    public init(held: Int, perMeesh: Int) {
        self.held = held
        self.perMeesh = perMeesh
    }
}

public enum GameChest {
    public static let pointsMin = 100
    public static let pointsMax = 10_000
    public static let effortFloor = 300
    public static let effortCeiling = 4500
    /// Un point de Gloire pour dix points — miroir de `gloryForChest` (`glory.ts`).
    public static let gloryDivisor = 10
    /// Cinq fragments paient une frappe gratuite (#10011).
    public static let fragmentsPerMeesh = 5
    public static let fragmentStepPoints = 5000
    public static let fragmentsMax = 3

    public static let odds = ChestOdds(
        minPoints: pointsMin, maxPoints: pointsMax, fragment: 1.0 / 6.0, freeze: 1.0 / 20.0,
        minGlory: pointsMin / gloryDivisor, maxGlory: pointsMax / gloryDivisor,
        minMeeshFragments: 1, maxMeeshFragments: fragmentsMax + 1, meeshFragmentsPerMeesh: fragmentsPerMeesh
    )

    /// Les points pour cet effort : une droite de 100 (300 d'effort) à 10 000 (4 500), arrondie au plus proche.
    public static func points(forEffort effort: Int) -> Int {
        let bounded = min(effortCeiling, max(effortFloor, effort))
        let span = effortCeiling - effortFloor
        let gain = pointsMax - pointsMin
        return pointsMin + (gain * (bounded - effortFloor) * 2 + span) / (2 * span)
    }

    public static func glory(forPoints points: Int) -> Int {
        max(0, points) / gloryDivisor
    }

    /// Les fragments certains : 1, 2 dès 2 500 points, 3 dès 7 500.
    public static func meeshFragments(forPoints points: Int) -> Int {
        min(fragmentsMax, 1 + (min(max(0, points), pointsMax) + fragmentStepPoints / 2) / fragmentStepPoints)
    }

    public static func content(forEffort effort: Int) -> ChestContent {
        let earned = points(forEffort: effort)
        return ChestContent(points: earned, glory: glory(forPoints: earned), meeshFragments: meeshFragments(forPoints: earned))
    }

    public static func daily(userId: String, dayKey: String, effort: Int) -> DailyChest {
        var rng = GameRandom(parts: GameSeedParts(userId: userId, dayKey: dayKey, salt: "chest"))
        _ = rng.next()
        let fragment = rng.next() < odds.fragment
        let freeze = rng.next() < odds.freeze
        let certain = content(forEffort: effort)
        return DailyChest(
            points: certain.points, fragment: fragment, freeze: freeze,
            glory: certain.glory, meeshFragments: certain.meeshFragments + (fragment ? 1 : 0)
        )
    }
}
