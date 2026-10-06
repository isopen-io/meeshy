import Foundation

// MARK: - Les 100 niveaux du Jeu Meeshy (#9373)
//
// MIROIR de `packages/shared/utils/game/levels.ts` — seuil(N) = 10 × N².
// Le niveau se lit sur le score EN POCHE (`level.engagementScore`), celui que la
// frappe d'une Meesh débite : il peut redescendre. Le niveau RECORD ne
// redescend jamais ; il règle le Vent arrière et la Gloire du premier passage.
//
// Le niveau minimum est 1 : le score le plus bas lit déjà « niveau 1 », dont la
// barre part de 0. `EngagementProgressResolver` (six paliers) reste la lecture
// des anciens paliers ; rien ici ne le remplace.

/// Les dix paliers de nom — clés STABLES que chaque client habille et localise.
public enum LevelTierKey: String, CaseIterable, Codable, Sendable, Hashable {
    case etincelle
    case lueur
    case lumiere
    case eclat
    case rayon
    case aurore
    case comete
    case etoile
    case constellation
    case galaxie
}

public extension LevelTierKey {
    /// Le rang du palier, de 1 (Étincelle) à 10 (Galaxie) : la source du chiffre romain et de
    /// « quatrième palier ». L'ordre des cas EST l'ordre des paliers.
    var ordinal: Int {
        (Self.allCases.firstIndex(of: self) ?? 0) + 1
    }

    /// Le rang du palier en chiffres romains, de I à X — ce que l'anneau de niveau écrit dans son
    /// cartouche. Les chiffres romains ne se localisent pas : ils sont les mêmes dans les sept langues.
    var romanNumeral: String {
        Self.romanNumerals[ordinal - 1]
    }

    private static let romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
}

/// Où se tient un score sur l'échelle des cent niveaux.
public struct GameLevelProgress: Sendable, Equatable {
    public let level: Int
    public let tier: LevelTierKey
    public let score: Int
    /// Score où la barre du niveau commence — 0 au niveau 1, sinon le seuil du niveau.
    public let floorScore: Int
    /// Seuil du niveau suivant, `nil` au niveau 100.
    public let nextThreshold: Int?
    public let pointsToNext: Int
    /// Fraction de la barre du niveau, de 0 à 1 ; `1` au niveau 100.
    public let progress: Double
    public let isMax: Bool

    public init(level: Int, tier: LevelTierKey, score: Int, floorScore: Int, nextThreshold: Int?,
                pointsToNext: Int, progress: Double, isMax: Bool) {
        self.level = level
        self.tier = tier
        self.score = score
        self.floorScore = floorScore
        self.nextThreshold = nextThreshold
        self.pointsToNext = pointsToNext
        self.progress = progress
        self.isMax = isMax
    }
}

/// Les niveaux franchis POUR LA PREMIÈRE FOIS : de `from` à `to`, `count` niveaux.
public struct GameNewLevels: Sendable, Equatable {
    public let from: Int
    public let to: Int
    public let count: Int

    public init(from: Int, to: Int, count: Int) {
        self.from = from
        self.to = to
        self.count = count
    }
}

public enum GameLevels {
    public static let minLevel = 1
    public static let maxLevel = 100
    /// Le Prestige remet le niveau à 1 et ajoute une étoile ; cinq au plus.
    public static let maxPrestige = 5

    /// Score minimal du niveau N : 10 × N².
    public static func threshold(of level: Int) -> Int {
        10 * level * level
    }

    /// Le niveau (1 à 100) que porte ce score ; un score négatif vaut 0. Le score se
    /// borne au seuil du niveau 100 avant tout calcul : au-delà, le niveau ne change
    /// plus, et `10 × N²` déborderait sur un score démesuré reçu du réseau.
    public static func level(forScore score: Int) -> Int {
        let s = min(max(0, score), threshold(of: maxLevel))
        let guess = Int((Double(s) / 10).squareRoot().rounded(.down))
        let exact = [guess - 1, guess, guess + 1]
            .filter { $0 >= 0 && threshold(of: $0) <= s }
            .max() ?? 0
        return min(maxLevel, max(minLevel, exact))
    }

    /// L'indice du palier (0 à 9) : 1–9 → 0, 10–19 → 1 … 90–100 → 9.
    public static func tierIndex(of level: Int) -> Int {
        min(LevelTierKey.allCases.count - 1, max(0, level) / 10)
    }

    public static func tier(of level: Int) -> LevelTierKey {
        LevelTierKey.allCases[tierIndex(of: level)]
    }

    public static func progress(forScore score: Int) -> GameLevelProgress {
        let s = max(0, score)
        let current = level(forScore: s)
        let floorScore = current == minLevel ? 0 : threshold(of: current)
        let isMax = current >= maxLevel
        let nextThreshold = isMax ? nil : threshold(of: current + 1)
        return GameLevelProgress(
            level: current,
            tier: tier(of: current),
            score: s,
            floorScore: floorScore,
            nextThreshold: nextThreshold,
            pointsToNext: nextThreshold.map { $0 - s } ?? 0,
            progress: nextThreshold.map { Double(s - floorScore) / Double($0 - floorScore) } ?? 1,
            isMax: isMax
        )
    }

    /// Le plus haut niveau atteint — `previousRecord` vaut `nil` pour un compte
    /// qui n'en a pas encore gravé.
    public static func record(level: Int, previousRecord: Int?) -> Int {
        max(level, previousRecord ?? minLevel)
    }

    /// Les niveaux franchis pour la première fois. Le niveau 1 est acquis
    /// d'office : le premier niveau « gagné » est le 2.
    public static func newLevelsReached(level: Int, previousRecord: Int?) -> GameNewLevels {
        let record = previousRecord ?? minLevel
        return level > record
            ? GameNewLevels(from: record + 1, to: level, count: level - record)
            : GameNewLevels(from: 0, to: 0, count: 0)
    }

    /// Le Prestige s'offre au niveau 100, tant qu'il reste une étoile à poser.
    public static func canPrestige(level: Int, prestige: Int) -> Bool {
        level >= maxLevel && prestige < maxPrestige
    }
}
