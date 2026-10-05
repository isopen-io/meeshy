import Foundation

// MARK: - Gloire et rangs (#9373)
//
// MIROIR de `packages/shared/utils/game/glory.ts`. La Gloire s'accumule dans un
// registre en ajout seul, elle ne baisse jamais ; le rang se lit sur elle.
//
// Dix rangs en trois divisions (III, II, I). Chaque intervalle est coupé en
// tiers égaux (début + ⌊étendue × k ÷ 3⌋, en entiers). Légende n'a pas de borne
// haute : ses divisions avancent par paliers de 40 000. Mythe n'est pas un seuil
// mais un DRAPEAU que le serveur fournit (les 100 Légendes les plus glorieuses) :
// le client ne le calcule jamais.

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
        case .echo: 500
        case .voix: 1500
        case .conteur: 3500
        case .passeur: 7000
        case .polyglotte: 12_000
        case .ambassadeur: 20_000
        case .orateur: 32_000
        case .oracle: 50_000
        case .legende: 80_000
        case .mythe: nil
        }
    }

    /// Position du rang dans l'échelle des onze (0 à 10).
    public var index: Int {
        Self.allCases.firstIndex(of: self) ?? 0
    }
}

/// III, II, I — la division que les chevrons sous l'écu comptent.
public enum GloryDivision: Int, CaseIterable, Codable, Sendable, Hashable {
    case iii = 3
    case ii = 2
    case i = 1

    /// Le nombre de chevrons à peindre sous l'écu.
    public var chevrons: Int { rawValue }
}

/// Une marche de l'échelle : un rang, sa division, la Gloire où elle commence.
public struct GloryStep: Codable, Sendable, Equatable {
    public let rank: GloryRank
    public let division: GloryDivision
    public let minGlory: Int

    public init(rank: GloryRank, division: GloryDivision, minGlory: Int) {
        self.rank = rank
        self.division = division
        self.minGlory = minGlory
    }
}

/// Où se tient une Gloire sur l'échelle.
public struct GloryStanding: Sendable, Equatable {
    public let glory: Int
    public let rank: GloryRank
    /// `nil` pour Mythe.
    public let division: GloryDivision?
    /// Gloire où commence la division courante — `nil` pour Mythe.
    public let divisionMinGlory: Int?
    /// La division suivante, `nil` en division I de Légende et pour Mythe.
    public let next: GloryStep?
    public let gloryMissing: Int?
    /// Fraction parcourue dans la division ; `1` quand il n'y a pas de suite.
    public let progress: Double

    public init(glory: Int, rank: GloryRank, division: GloryDivision?, divisionMinGlory: Int?,
                next: GloryStep?, gloryMissing: Int?, progress: Double) {
        self.glory = glory
        self.rank = rank
        self.division = division
        self.divisionMinGlory = divisionMinGlory
        self.next = next
        self.gloryMissing = gloryMissing
        self.progress = progress
    }
}

public enum GameGlory {

    /// Ce que chaque fait rapporte en Gloire (fixe, entier).
    public struct Points: Sendable {
        public let mint = 100
        public let firstLevel = 20
        public let goldMission = 40
        public let leagueUp = 30
        public let leagueCup = 100
        public let season = 500
        public let prestige = 1000
    }

    public static let points = Points()

    /// Largeur d'une division de Légende — au-delà, il n'y a plus de rang.
    public static let legendDivisionStep = 40_000

    public enum AchievementRarity: String, CaseIterable, Codable, Sendable, Hashable {
        case common
        case rare
        case epic
        case legendary
        case mythic
    }

    public static func gloryForAchievement(_ rarity: AchievementRarity) -> Int {
        switch rarity {
        case .common: 10
        case .rare: 25
        case .epic: 60
        case .legendary: 150
        case .mythic: 400
        }
    }

    public static func gloryForNewLevels(level: Int, previousRecord: Int?) -> Int {
        GameLevels.newLevelsReached(level: level, previousRecord: previousRecord).count * points.firstLevel
    }

    /// Records de Flamme (jours de série) et leur Gloire.
    public static let flameRecordGlory: [(days: Int, glory: Int)] = [
        (7, 50), (30, 150), (100, 500), (365, 2000),
    ]

    public static func gloryForFlameRecords(previousLongest: Int, longest: Int) -> Int {
        flameRecordGlory
            .filter { previousLongest < $0.days && longest >= $0.days }
            .reduce(0) { $0 + $1.glory }
    }

    private static func divisionStart(rankIndex: Int, divisionIndex: Int) -> Int {
        let rank = GloryRank.ladder[rankIndex]
        let start = rank.minGlory ?? 0
        guard rankIndex + 1 < GloryRank.ladder.count, let following = GloryRank.ladder[rankIndex + 1].minGlory else {
            return start + legendDivisionStep * divisionIndex
        }
        return start + ((following - start) * divisionIndex) / 3
    }

    /// Toutes les marches, du plus bas au plus haut : 10 rangs × 3 divisions.
    public static let steps: [GloryStep] = GloryRank.ladder.enumerated().flatMap { rankIndex, rank in
        GloryDivision.allCases.enumerated().map { divisionIndex, division in
            GloryStep(rank: rank, division: division,
                      minGlory: divisionStart(rankIndex: rankIndex, divisionIndex: divisionIndex))
        }
    }

    public static func standing(glory rawGlory: Int, mythic: Bool) -> GloryStanding {
        let glory = max(0, rawGlory)
        let legendStart = GloryRank.legende.minGlory ?? 0

        if mythic && glory >= legendStart {
            return GloryStanding(glory: glory, rank: .mythe, division: nil, divisionMinGlory: nil,
                                 next: nil, gloryMissing: nil, progress: 1)
        }

        let stepIndex = steps.indices.reduce(0) { found, index in glory >= steps[index].minGlory ? index : found }
        let step = steps[stepIndex]
        let next = stepIndex + 1 < steps.count ? steps[stepIndex + 1] : nil

        return GloryStanding(
            glory: glory,
            rank: step.rank,
            division: step.division,
            divisionMinGlory: step.minGlory,
            next: next,
            gloryMissing: next.map { $0.minGlory - glory },
            progress: next.map { Double(glory - step.minGlory) / Double($0.minGlory - step.minGlory) } ?? 1
        )
    }
}
