import Foundation

// MARK: - Les étapes des niveaux (#9706)
//
// MIROIR de `packages/shared/utils/game/level-steps.ts` — une étape simple tous les dix niveaux, de 10 à 100.
// Si les points sont là mais pas l'étape, le niveau ATTEND au palier précédent (9, 19 … 99), puis monte
// d'un coup dès qu'elle est faite. Au-delà de 100, plus d'étape : seuls les plafonds du rang (#9688).
//
// Chaque étape porte sur un fait qui ne se défait jamais (Meeshes frappées à vie, missions du jour
// accomplies à vie, record de Flamme, rang de Gloire) : le palier qu'elle ouvre ne se referme pas.
// Le niveau servi est le plus petit de trois : celui des points, le plafond du rang, le palier des étapes.

/// Ce qu'une étape demande — clé STABLE du fil, que chaque client habille.
public enum LevelStepKind: String, CaseIterable, Codable, Sendable, Hashable {
    case mint
    case missions
    case rank
    case flame
}

/// Une étape : le niveau qu'elle ouvre et ce qu'elle demande (`rank` pour une étape de rang, sinon `target`).
public struct GameLevelStepRule: Sendable, Equatable {
    public let level: Int
    public let kind: LevelStepKind
    public let target: Int
    public let rank: GloryRank?

    public init(level: Int, kind: LevelStepKind, target: Int = 0, rank: GloryRank? = nil) {
        self.level = level
        self.kind = kind
        self.target = target
        self.rank = rank
    }
}

/// Les compteurs que les étapes lisent hors du bloc de Gloire — servis dans `ladder.steps`.
public struct GameLevelStepCounts: Codable, Sendable, Equatable {
    /// Meeshes frappées à vie.
    public let minted: Int
    /// Missions du jour accomplies à vie, comptées jusqu'à `GameLevelSteps.missionsCounted`.
    public let missionsDone: Int
    /// La plus longue Flamme, en jours.
    public let flameRecord: Int

    public init(minted: Int, missionsDone: Int, flameRecord: Int) {
        self.minted = minted
        self.missionsDone = missionsDone
        self.flameRecord = flameRecord
    }
}

/// Tout ce que les étapes lisent : les compteurs, la Gloire et le rang (Mythe compris, servi par le serveur).
public struct GameLevelStepFacts: Sendable, Equatable {
    public let minted: Int
    public let missionsDone: Int
    public let flameRecord: Int
    public let glory: Int
    public let rank: GloryRank

    public init(minted: Int, missionsDone: Int, flameRecord: Int, glory: Int, rank: GloryRank) {
        self.minted = minted
        self.missionsDone = missionsDone
        self.flameRecord = flameRecord
        self.glory = glory
        self.rank = rank
    }

    public init(counts: GameLevelStepCounts, glory: Int, rank: GloryRank) {
        self.init(minted: counts.minted, missionsDone: counts.missionsDone, flameRecord: counts.flameRecord, glory: glory, rank: rank)
    }

    public var counts: GameLevelStepCounts {
        GameLevelStepCounts(minted: minted, missionsDone: missionsDone, flameRecord: flameRecord)
    }
}

/// Une étape telle que le fil la sert : ce qu'elle demande, où en est le compte, et si elle est faite.
public struct GameLevelStep: Codable, Sendable, Equatable {
    public let level: Int
    public let kind: LevelStepKind
    /// Meeshes, missions, jours de Flamme — ou, pour un rang, la Gloire où il commence.
    public let target: Int
    /// Où en est le compte, dans la même unité que `target`.
    public let current: Int
    public let met: Bool
    /// Le rang demandé — `nil` hors des étapes de rang.
    public let rank: GloryRank?

    public init(level: Int, kind: LevelStepKind, target: Int, current: Int, met: Bool, rank: GloryRank?) {
        self.level = level
        self.kind = kind
        self.target = target
        self.current = current
        self.met = met
        self.rank = rank
    }
}

public enum GameLevelSteps {
    /// La table du porteur — une ligne par dizaine, dans l'ordre.
    public static let rules: [GameLevelStepRule] = [
        GameLevelStepRule(level: 10, kind: .mint, target: 1),
        GameLevelStepRule(level: 20, kind: .missions, target: 1),
        GameLevelStepRule(level: 30, kind: .rank, rank: .echo),
        GameLevelStepRule(level: 40, kind: .flame, target: 7),
        GameLevelStepRule(level: 50, kind: .missions, target: 10),
        GameLevelStepRule(level: 60, kind: .rank, rank: .voix),
        GameLevelStepRule(level: 70, kind: .mint, target: 5),
        GameLevelStepRule(level: 80, kind: .rank, rank: .conteur),
        GameLevelStepRule(level: 90, kind: .flame, target: 30),
        GameLevelStepRule(level: 100, kind: .rank, rank: .passeur),
    ]

    /// La plus grande cible des missions : la passerelle ne compte pas plus loin.
    public static let missionsCounted = rules.filter { $0.kind == .missions }.map(\.target).max() ?? 0

    private static func current(_ rule: GameLevelStepRule, _ facts: GameLevelStepFacts) -> Int {
        switch rule.kind {
        case .mint: max(0, facts.minted)
        case .missions: max(0, facts.missionsDone)
        case .flame: max(0, facts.flameRecord)
        case .rank: max(0, facts.glory)
        }
    }

    /// L'étape est-elle faite ? Un rang se juge sur le rang SERVI (le Mythe vaut tous les rangs).
    public static func isMet(_ rule: GameLevelStepRule, facts: GameLevelStepFacts) -> Bool {
        guard rule.kind == .rank else { return current(rule, facts) >= rule.target }
        return facts.rank.index >= (rule.rank?.index ?? 0)
    }

    /// Le palier des étapes : la première manquante retient juste en dessous ; toutes faites, ou sans
    /// faits (un serveur d'avant les étapes), rien ne retient (`nil`).
    public static func gate(_ facts: GameLevelStepFacts?) -> Int? {
        guard let facts, let missing = rules.first(where: { !isMet($0, facts: facts) }) else { return nil }
        return missing.level - 1
    }

    /// Le plafond du niveau SERVI : le plus serré du rang (#9688) et des étapes (#9706).
    public static func cap(rank: GloryRank, steps: GameLevelStepFacts?) -> Int? {
        GameLevels.tighter(GameGlory.levelCap(forRank: rank), gate(steps))
    }

    private static func step(of rule: GameLevelStepRule, facts: GameLevelStepFacts) -> GameLevelStep {
        GameLevelStep(
            level: rule.level,
            kind: rule.kind,
            target: rule.kind == .rank ? (rule.rank?.minGlory ?? 0) : rule.target,
            current: current(rule, facts),
            met: isMet(rule, facts: facts),
            rank: rule.kind == .rank ? rule.rank : nil
        )
    }

    /// La PROCHAINE étape au-dessus de ce niveau, faite ou à faire — `nil` au-delà de 100 ou sans faits.
    public static func next(after level: Int, facts: GameLevelStepFacts?) -> GameLevelStep? {
        guard let facts, level < GameLevels.stepLast else { return nil }
        let nextLevel = (max(0, level) / GameLevels.stepInterval + 1) * GameLevels.stepInterval
        return rules.first { $0.level == nextLevel }.map { step(of: $0, facts: facts) }
    }

    /// Toutes les étapes, faites ou à faire — le carnet des règles.
    public static func all(_ facts: GameLevelStepFacts) -> [GameLevelStep] {
        rules.map { step(of: $0, facts: facts) }
    }
}
