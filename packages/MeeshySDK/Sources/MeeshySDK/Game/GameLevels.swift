import Foundation

// MARK: - Les niveaux du Jeu Meeshy (#9373, ouverts par le rang #9688)
//
// MIROIR de `packages/shared/utils/game/levels.ts` — seuil(N) = 100 × N² (#9706) : un million pour le
// niveau 100, et une ÉTAPE tous les dix niveaux de 10 à 100 (`GameLevelSteps`) — sans elle, le niveau
// attend au palier précédent. Le niveau servi est le plus petit de trois : les points, le rang, les étapes.
// La courbe ne s'arrête plus à 100 : le RANG de Gloire ouvre les niveaux
// (`GameGlory.levelCap(forRank:)`) — 499 au plus sous Ambassadeur, 1000 pour
// Ambassadeur et Orateur, sans limite (`nil`) à partir d'Oracle. Le niveau 100
// n'est plus un maximum : c'est le seuil du Prestige, facultatif.
// Le niveau se lit sur le score EN POCHE (`level.engagementScore`), celui que la
// frappe d'une Meesh débite : il peut redescendre. Le niveau RECORD ne
// redescend jamais ; il règle le Vent arrière et la Gloire du premier passage.
//
// Le niveau minimum est 1 : le score le plus bas lit déjà « niveau 1 », dont la
// barre part de 0. `EngagementProgressResolver` (six paliers) reste la lecture
// des anciens paliers ; rien ici ne le remplace.

/// Les vingt paliers de nom — clés STABLES que chaque client habille et localise : les dix d'hier
/// (1–100), neuf de cent niveaux (101–199, 200–299 … 900–999), puis Singularité dès 1000 (#9688).
/// Les champs d'HIER du fil ne portent que les dix premiers (un client publié décode strictement).
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
    case nebuleuse
    case pulsar
    case quasar
    case supernova
    case magnetar
    case amas
    case superamas
    case cosmos
    case infini
    case singularite
}

public extension LevelTierKey {
    /// Le rang du palier, de 1 (Étincelle) à 20 (Singularité) : la source du chiffre romain et de
    /// « quatrième palier ». L'ordre des cas EST l'ordre des paliers.
    var ordinal: Int {
        (Self.allCases.firstIndex(of: self) ?? 0) + 1
    }

    /// Le rang du palier en chiffres romains, de I à XX — ce que l'anneau de niveau écrit dans son
    /// cartouche. Les chiffres romains ne se localisent pas : ils sont les mêmes dans les sept langues.
    var romanNumeral: String {
        Self.romanNumerals[ordinal - 1]
    }

    private static let romanNumerals = [
        "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
        "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
    ]

    /// Galaxie et Singularité sont des spectres : elles se peignent au prisme.
    var isSpectral: Bool { self == .galaxie || self == .singularite }
}

/// Où se tient un score sur la courbe, sous le plafond que le rang ouvre.
public struct GameLevelProgress: Sendable, Equatable {
    public let level: Int
    public let tier: LevelTierKey
    public let score: Int
    /// Score où la barre du niveau commence — 0 au niveau 1, sinon le seuil du niveau.
    public let floorScore: Int
    /// Seuil du niveau suivant, `nil` au plafond.
    public let nextThreshold: Int?
    public let pointsToNext: Int
    /// Fraction de la barre du niveau, de 0 à 1 ; `1` au plafond.
    public let progress: Double
    /// Le niveau est au plafond que le rang lui ouvre : il monte dès que le rang l'ouvre.
    public let isMax: Bool
    /// Le plafond appliqué — `nil` : sans limite.
    public let cap: Int?
    /// Les points sont là, une ÉTAPE manque (#9706) : le niveau attend, la barre est pleine.
    public let held: Bool

    public init(level: Int, tier: LevelTierKey, score: Int, floorScore: Int, nextThreshold: Int?,
                pointsToNext: Int, progress: Double, isMax: Bool, cap: Int? = nil, held: Bool = false) {
        self.level = level
        self.tier = tier
        self.score = score
        self.floorScore = floorScore
        self.nextThreshold = nextThreshold
        self.pointsToNext = pointsToNext
        self.progress = progress
        self.isMax = isMax
        self.cap = cap
        self.held = held
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
    /// Le niveau où le Prestige s'offre — un seuil, plus un maximum (#9688).
    public static let prestigeLevel = 100
    /// Le plafond de l'ANCIENNE loi : la borne des champs que lisent les clients publiés.
    public static let legacyMaxLevel = 100
    /// Le plafond d'un compte sous Ambassadeur.
    public static let capBase = 499
    /// Le plafond d'Ambassadeur et d'Orateur ; Oracle et au-delà n'en ont plus.
    public static let capAmbassador = 1000
    /// Le Prestige remet le niveau à 1 et ajoute une étoile ; cinq au plus.
    public static let maxPrestige = 5

    /// Une étape tous les dix niveaux (#9706)…
    public static let stepInterval = 10
    /// …jusqu'au niveau 100 : au-delà, seuls les plafonds du rang (#9688).
    public static let stepLast = 100

    /// Le score se borne à ce seuil avant tout calcul : `100 × N²` déborderait sur un score démesuré reçu du réseau.
    private static let scoreCeiling = 100 * 1_000_000 * 1_000_000
    private static let singularityLevel = 1000
    private static let legacyTierCount = 10

    /// Score minimal du niveau N : 100 × N² (#9706).
    public static func threshold(of level: Int) -> Int {
        100 * level * level
    }

    /// Le plus serré de deux plafonds — `nil` ne borne rien.
    public static func tighter(_ a: Int?, _ b: Int?) -> Int? {
        guard let a else { return b }
        guard let b else { return a }
        return min(a, b)
    }

    /// Le plus haut niveau lu sans relire les étapes, depuis le record (#9706) : la dizaine qui suit le
    /// record, moins un — `nil` au-delà de la dernière étape. Le record ne franchit une dizaine qu'étape faite.
    public static func stepCeiling(record: Int?) -> Int? {
        let current = max(minLevel, record ?? minLevel)
        if current >= stepLast { return nil }
        return (current / stepInterval + 1) * stepInterval - 1
    }

    /// FAIL-CLOSED : seul `nil` vaut « sans limite » ; un plafond sous 1 se relit 1.
    private static func sanitized(cap: Int?) -> Int? {
        cap.map { max(minLevel, $0) }
    }

    /// Le niveau que porte ce score, borné par le plafond (`nil` : sans limite) ; un score négatif vaut 0.
    public static func level(forScore score: Int, cap: Int?) -> Int {
        let s = min(max(0, score), scoreCeiling)
        let guess = Int((Double(s) / 100).squareRoot().rounded(.down))
        let exact = [guess - 1, guess, guess + 1]
            .filter { $0 >= 0 && threshold(of: $0) <= s }
            .max() ?? 0
        let bounded = sanitized(cap: cap).map { min($0, exact) } ?? exact
        return max(minLevel, bounded)
    }

    /// Le niveau lu sur le score et le RECORD seuls, pour une décision qui ne le compare qu'à un seuil de
    /// 100 au plus (Prestige, missions, ligue, duo) : tout plafond de rang vaut au moins 499 ; les étapes, si
    /// (#9706) — le niveau ne passe pas la dizaine qui suit le record, gravé étape faite.
    public static func levelForUnlocks(score: Int, levelRecord: Int?) -> Int {
        level(forScore: score, cap: stepCeiling(record: levelRecord))
    }

    /// L'indice du palier (0 à 19) : 1–9 → 0 … 90–100 → 9, puis 101–199 → 10 … 900–999 → 18, 1000+ → 19.
    public static func tierIndex(of level: Int) -> Int {
        let n = max(0, level)
        if n <= legacyMaxLevel { return min(legacyTierCount - 1, n / 10) }
        if n >= singularityLevel { return LevelTierKey.allCases.count - 1 }
        return legacyTierCount - 1 + n / 100
    }

    public static func tier(of level: Int) -> LevelTierKey {
        LevelTierKey.allCases[tierIndex(of: level)]
    }

    /// Le premier niveau d'un palier : 1, 10 … 90, puis 101, 200 … 900, et 1000.
    public static func tierStart(of tier: LevelTierKey) -> Int {
        let index = tier.ordinal - 1
        if index <= 0 { return minLevel }
        if index < legacyTierCount { return index * 10 }
        if index == legacyTierCount { return legacyMaxLevel + 1 }
        if index == LevelTierKey.allCases.count - 1 { return singularityLevel }
        return (index - legacyTierCount + 1) * 100
    }

    /// Le niveau tel que l'ancienne loi le lit : borné à 100.
    public static func legacyLevel(_ level: Int) -> Int {
        min(legacyMaxLevel, max(minLevel, level))
    }

    /// Le palier tel que l'ancienne loi le lit : l'un des dix premiers.
    public static func legacyTier(of level: Int) -> LevelTierKey {
        tier(of: legacyLevel(level))
    }

    /// Où se tient ce score sous le plafond du rang (`cap`) et le palier des étapes (`gate`, #9706). Au
    /// plafond du rang, la barre est pleine et sans suite (`isMax`) ; retenu par une étape, elle est pleine et
    /// la suite reste dite (`held`, `pointsToNext` à 0).
    public static func progress(forScore score: Int, cap: Int?, gate: Int? = nil) -> GameLevelProgress {
        let s = min(max(0, score), scoreCeiling)
        let bound = sanitized(cap: cap)
        let hold = sanitized(cap: gate)
        let current = level(forScore: s, cap: tighter(bound, hold))
        let floorScore = current == minLevel ? 0 : threshold(of: current)
        let isMax = bound.map { current >= $0 } ?? false
        let held = !isMax && (hold.map { current >= $0 } ?? false) && level(forScore: s, cap: bound) > current
        let nextThreshold = isMax ? nil : threshold(of: current + 1)
        return GameLevelProgress(
            level: current,
            tier: tier(of: current),
            score: s,
            floorScore: floorScore,
            nextThreshold: nextThreshold,
            pointsToNext: nextThreshold.map { max(0, $0 - s) } ?? 0,
            progress: nextThreshold.map { min(1, Double(s - floorScore) / Double($0 - floorScore)) } ?? 1,
            isMax: isMax,
            cap: bound,
            held: held
        )
    }

    /// La lecture de l'ANCIENNE loi — celle des champs d'hier du fil : bornée à 100, l'un des dix premiers
    /// paliers, et retenue par les étapes (#9706) : un ancien client lit le niveau servi.
    public static func legacyProgress(forScore score: Int, gate: Int? = nil) -> GameLevelProgress {
        progress(forScore: score, cap: legacyMaxLevel, gate: gate)
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

    /// Le Prestige s'offre à partir du niveau 100, tant qu'il reste une étoile à poser — il reste facultatif.
    public static func canPrestige(level: Int, prestige: Int) -> Bool {
        level >= prestigeLevel && prestige < maxPrestige
    }
}
