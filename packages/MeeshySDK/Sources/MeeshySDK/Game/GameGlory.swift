import Foundation

// MARK: - Gloire et rangs (#9373, échelle de #9636)
//
// MIROIR de `packages/shared/utils/game/glory.ts`. La Gloire s'accumule dans un
// registre en ajout seul, elle ne baisse jamais ; le rang se lit sur elle.
//
// Dix rangs, de Murmure (0) à Légende (600 000), chacun coupé en CINQ divisions
// égales : V au départ du rang, I juste avant le rang suivant (début +
// ⌊étendue × k ÷ 5⌋, en entiers). Légende a une borne haute, le seuil du Mythe
// (1 000 000) : au-delà, faute de place, on reste Légende I.
//
// Mythe n'est pas un seuil mais une PLACE (cent places, dans l'ordre d'arrivée à
// 1 000 000) : la passerelle l'attribue et sert son numéro et son émission ; le
// client ne la calcule jamais.
//
// Rétrocompatibilité du fil (#9223) : `division` reste la projection HÉRITÉE à
// trois crans (V, IV → III ; III, II → II ; I → I) ; la division à cinq crans
// voyage dans le champ neuf `division5`.

/// Les onze rangs. `mythe` n'a pas de seuil : le serveur le pose.
public enum GloryRank: String, CaseIterable, Codable, Sendable, Hashable {
    case murmure
    case echo
    case voix
    case conteur
    case passeur
    case polyglotte
    case ambassadeur
    case orateur
    case oracle
    case legende
    case mythe

    /// Les dix rangs gagnés par la Gloire, du plus bas au plus haut.
    public static let ladder: [GloryRank] = [
        .murmure, .echo, .voix, .conteur, .passeur, .polyglotte, .ambassadeur, .orateur, .oracle, .legende,
    ]

    /// La Gloire où le rang commence — `nil` pour Mythe.
    public var minGlory: Int? {
        switch self {
        case .murmure: 0
        case .echo: 2000
        case .voix: 6000
        case .conteur: 15_000
        case .passeur: 35_000
        case .polyglotte: 70_000
        case .ambassadeur: 130_000
        case .orateur: 230_000
        case .oracle: 380_000
        case .legende: 600_000
        case .mythe: nil
        }
    }

    /// Position du rang dans l'échelle des onze (0 à 10).
    public var index: Int {
        Self.allCases.firstIndex(of: self) ?? 0
    }
}

/// III, II, I — la division HÉRITÉE du fil, la seule que les clients publiés savent lire.
public enum GloryDivision: Int, CaseIterable, Codable, Sendable, Hashable {
    case iii = 3
    case ii = 2
    case i = 1

    /// Le nombre de chevrons à peindre sous l'écu (ancien blason).
    public var chevrons: Int { rawValue }
}

/// V (la plus faible) à I (la plus haute) — la division à cinq crans (`division5`).
public enum GloryDivision5: Int, CaseIterable, Codable, Sendable, Hashable {
    case v = 5
    case iv = 4
    case iii = 3
    case ii = 2
    case i = 1

    /// La projection sur les trois crans hérités : V, IV → III ; III, II → II ; I → I.
    public var legacy: GloryDivision {
        switch self {
        case .v, .iv: .iii
        case .iii, .ii: .ii
        case .i: .i
        }
    }

    /// Le nombre d'encoches pleines sous l'écu : V = 1 … I = 5.
    public var notches: Int { 6 - rawValue }

    /// Le chiffre romain de la division.
    public var roman: String {
        switch self {
        case .v: "V"
        case .iv: "IV"
        case .iii: "III"
        case .ii: "II"
        case .i: "I"
        }
    }

    /// Une division héritée relue à cinq crans (un ancien serveur) : III, II, I se lisent tels quels.
    public init(legacy: GloryDivision) {
        switch legacy {
        case .iii: self = .iii
        case .ii: self = .ii
        case .i: self = .i
        }
    }
}

/// Une place du Mythe telle que le serveur la sert : la place (1 à 100) et l'émission (sa Signature).
public struct MythicSeatRef: Codable, Sendable, Equatable, Hashable {
    public let number: Int
    public let edition: Int

    public init(number: Int, edition: Int) {
        self.number = number
        self.edition = edition
    }

    /// Place de 1 à 100 et émission ≥ 1 — sinon la place est ignorée.
    public var isValid: Bool { GameGlory.isMythicNumber(number) && GameGlory.isMythicEdition(edition) }
}

/// Une marche de l'échelle : un rang, sa division, la Gloire où elle commence.
public struct GloryStep: Codable, Sendable, Equatable {
    public let rank: GloryRank
    /// Projection héritée (1–3).
    public let division: GloryDivision
    /// V (5) à I (1) — absente d'un ancien serveur.
    public let division5: GloryDivision5?
    public let minGlory: Int

    public init(rank: GloryRank, division: GloryDivision, division5: GloryDivision5? = nil, minGlory: Int) {
        self.rank = rank
        self.division = division
        self.division5 = division5
        self.minGlory = minGlory
    }

    private enum CodingKeys: String, CodingKey {
        case rank, division, division5, minGlory
    }

    /// `division5` est neuve et tolérée : illisible, la division héritée la remplace.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        rank = try container.decode(GloryRank.self, forKey: .rank)
        division = try container.decode(GloryDivision.self, forKey: .division)
        division5 = (try? container.decodeIfPresent(GloryDivision5.self, forKey: .division5)) ?? nil
        minGlory = try container.decode(Int.self, forKey: .minGlory)
    }

    /// La division à montrer : `division5` servie, sinon la division héritée relue.
    public var shownDivision: GloryDivision5 { division5 ?? GloryDivision5(legacy: division) }
}

/// Où se tient une Gloire sur l'échelle.
public struct GloryStanding: Sendable, Equatable {
    public let glory: Int
    public let rank: GloryRank
    /// Projection héritée (1–3), `nil` pour Mythe.
    public let division: GloryDivision?
    /// V (5) à I (1), `nil` pour Mythe.
    public let division5: GloryDivision5?
    /// Gloire où commence la division courante — `nil` pour Mythe.
    public let divisionMinGlory: Int?
    /// La division suivante, `nil` en Légende I et pour Mythe.
    public let next: GloryStep?
    public let gloryMissing: Int?
    /// Fraction parcourue dans la division ; `1` quand il n'y a pas de suite.
    public let progress: Double
    /// La place du Mythe et son émission, quand le serveur les a servies.
    public let mythic: MythicSeatRef?

    public init(glory: Int, rank: GloryRank, division: GloryDivision?, division5: GloryDivision5? = nil,
                divisionMinGlory: Int?, next: GloryStep?, gloryMissing: Int?, progress: Double,
                mythic: MythicSeatRef? = nil) {
        self.glory = glory
        self.rank = rank
        self.division = division
        self.division5 = division5
        self.divisionMinGlory = divisionMinGlory
        self.next = next
        self.gloryMissing = gloryMissing
        self.progress = progress
        self.mythic = mythic
    }
}

public enum GameGlory {

    /// Ce que chaque fait ponctuel rapporte en Gloire — les missions ont leur table, `missionGlory`.
    public struct Points: Sendable {
        public let mint = 1000
        public let firstLevel = 100
        public let leagueUp = 300
        public let leagueCup = 1000
        public let season = 5000
        public let prestige = 10_000
    }

    public static let points = Points()

    /// Le seuil du Mythe — et la borne haute de Légende.
    public static let mytheGlory = 1_000_000
    /// Le nombre de places du Mythe : jamais une de plus.
    public static let mytheSize = 100
    /// Le nombre de divisions d'un rang.
    public static let divisionCount = 5

    /// La Gloire d'une mission du jour, par difficulté (40 / 100 / 250 / 500), gravée au tirage.
    public static func missionGlory(_ difficulty: MissionDifficulty) -> Int {
        switch difficulty {
        case .easy: 40
        case .medium: 100
        case .hard: 250
        case .gold: 500
        }
    }

    public enum AchievementRarity: String, CaseIterable, Codable, Sendable, Hashable {
        case common
        case rare
        case epic
        case legendary
        case mythic
    }

    public static func gloryForAchievement(_ rarity: AchievementRarity) -> Int {
        switch rarity {
        case .common: 100
        case .rare: 250
        case .epic: 600
        case .legendary: 1500
        case .mythic: 4000
        }
    }

    public static func gloryForNewLevels(level: Int, previousRecord: Int?) -> Int {
        GameLevels.newLevelsReached(level: level, previousRecord: previousRecord).count * points.firstLevel
    }

    /// Records de Flamme (jours de série) et leur Gloire — ×10 avec la nouvelle échelle des rangs (#9636).
    public static let flameRecordGlory: [(days: Int, glory: Int)] = [
        (7, 500), (30, 1500), (100, 5000), (365, 20000),
    ]

    public static func gloryForFlameRecords(previousLongest: Int, longest: Int) -> Int {
        flameRecordGlory
            .filter { previousLongest < $0.days && longest >= $0.days }
            .reduce(0) { $0 + $1.glory }
    }

    /// Un numéro de place du Mythe : un entier de 1 à 100.
    public static func isMythicNumber(_ value: Int) -> Bool { (1...mytheSize).contains(value) }

    /// Un numéro d'émission : un entier à partir de 1, sans borne haute.
    public static func isMythicEdition(_ value: Int) -> Bool { value >= 1 }

    private static func divisionStart(rankIndex: Int, divisionIndex: Int) -> Int {
        let start = GloryRank.ladder[rankIndex].minGlory ?? 0
        let upper = rankIndex + 1 < GloryRank.ladder.count ? (GloryRank.ladder[rankIndex + 1].minGlory ?? mytheGlory) : mytheGlory
        return start + ((upper - start) * divisionIndex) / divisionCount
    }

    /// Toutes les marches, du plus bas au plus haut : 10 rangs × 5 divisions.
    public static let steps: [GloryStep] = GloryRank.ladder.enumerated().flatMap { rankIndex, rank in
        GloryDivision5.allCases.enumerated().map { divisionIndex, division5 in
            GloryStep(rank: rank, division: division5.legacy, division5: division5,
                      minGlory: divisionStart(rankIndex: rankIndex, divisionIndex: divisionIndex))
        }
    }

    /// Le rang lu sur la Gloire. Mythe vient du SERVEUR, jamais du seuil : `mythicSeat`
    /// (la place et son émission) ou, pour un appelant qui ne connaît que le rang servi,
    /// `mythic: true`. La place ne se perd pas : Mythe ne dépend plus de la Gloire.
    public static func standing(glory rawGlory: Int, mythic: Bool, mythicSeat: MythicSeatRef? = nil) -> GloryStanding {
        let glory = max(0, rawGlory)
        let seat = mythicSeat.flatMap { $0.isValid ? $0 : nil }

        if seat != nil || mythic {
            return GloryStanding(glory: glory, rank: .mythe, division: nil, division5: nil, divisionMinGlory: nil,
                                 next: nil, gloryMissing: nil, progress: 1, mythic: seat)
        }

        let stepIndex = steps.indices.reduce(0) { found, index in glory >= steps[index].minGlory ? index : found }
        let step = steps[stepIndex]
        let next = stepIndex + 1 < steps.count ? steps[stepIndex + 1] : nil

        return GloryStanding(
            glory: glory,
            rank: step.rank,
            division: step.division,
            division5: step.division5,
            divisionMinGlory: step.minGlory,
            next: next,
            gloryMissing: next.map { $0.minGlory - glory },
            progress: next.map { Double(glory - step.minGlory) / Double($0.minGlory - step.minGlory) } ?? 1
        )
    }
}
