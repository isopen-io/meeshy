import Foundation

// MARK: - La rareté des succès (#9390) et les badges à sept paliers (#9392)
//
// MIROIR de `packages/shared/utils/game/rarity.ts` et `badge-tiers.ts`.
//
// | rareté      | part des comptes | liseré  | Gloire |
// |-------------|------------------|---------|--------|
// | commun      | plus de 40 %     | ardoise | 10     |
// | rare        | 10 à 40 %        | bleu    | 25     |
// | épique      | 2 à 10 %         | violet  | 60     |
// | légendaire  | 0,2 à 2 %        | or      | 150    |
// | mythique    | moins de 0,2 %   | prisme  | 400    |
//
// Borne basse incluse, haute exclue ; le commun est la seule borne stricte. Le
// calcul est en ENTIERS : la part se compare au millième par produit en croix.
//
// La Gloire est FIGÉE à l'obtention ; la rareté est NON MESURÉE sous
// `minPopulation` comptes, et son pourcentage ne s'affiche qu'à partir de
// `minDisplayHolders` titulaires (conformité G-2). Mythe n'est jamais calculé
// par un client : la passerelle sert le drapeau.

public enum RarityBorder: String, Sendable, Hashable {
    case slate
    case blue
    case violet
    case gold
    case prism
}

public enum GameRarity {
    public static let minPopulation = 1000
    /// Sous ce nombre de TITULAIRES, un succès n'affiche pas son pourcentage.
    public static let minDisplayHolders = 20
    public static let mytheSize = GameGlory.mytheSize

    public static func border(for rarity: GameGlory.AchievementRarity) -> RarityBorder {
        switch rarity {
        case .common: .slate
        case .rare: .blue
        case .epic: .violet
        case .legendary: .gold
        case .mythic: .prism
        }
    }

    private struct Band {
        let rarity: GameGlory.AchievementRarity
        let floor: Int
        let inclusive: Bool
    }

    /// Les bornes basses, en millièmes de la population, de la plus commune à la plus rare.
    private static let bands = [
        Band(rarity: .common, floor: 400, inclusive: false),
        Band(rarity: .rare, floor: 100, inclusive: true),
        Band(rarity: .epic, floor: 20, inclusive: true),
        Band(rarity: .legendary, floor: 2, inclusive: true),
    ]

    /// La rareté d'une part : `holders` comptes sur `population`.
    public static func rarity(holders: Int, population: Int) -> GameGlory.AchievementRarity {
        let scaled = holders * 1000
        let hit = bands.first { band in
            let bar = band.floor * population
            return band.inclusive ? scaled >= bar : scaled > bar
        }
        return hit?.rarity ?? .mythic
    }

    /// La rareté de la nuit, `nil` quand elle n'est pas mesurable.
    public static func measure(holders: Int, population: Int) -> GameGlory.AchievementRarity? {
        guard holders >= 0, population >= minPopulation else { return nil }
        return rarity(holders: holders, population: population)
    }

    /// `true` quand le pourcentage de détenteurs peut s'afficher ; sinon le client
    /// dit « rareté en cours de mesure ».
    public static func isShareDisplayable(holders: Int, population: Int) -> Bool {
        holders >= minDisplayHolders && population >= minPopulation
    }

    /// La Gloire d'un succès au moment où il est obtenu.
    public static func gloryAtEarning(_ measured: GameGlory.AchievementRarity?) -> Int {
        GameGlory.gloryForAchievement(measured ?? .common)
    }
}

// MARK: - Les badges d'accumulation à sept paliers

public enum BadgeMaterialKey: String, CaseIterable, Sendable, Hashable {
    case cuivre
    case bronze
    case argent
    case or
    case platine
    case obsidienne
    case prisme
}

public struct BadgeMaterial: Sendable, Equatable {
    public let threshold: Int
    public let key: BadgeMaterialKey
    /// Un ruban à partir de l'Or.
    public let ribbon: Bool
    /// L'émail irisé du Prisme suit l'inclinaison du téléphone.
    public let iridescent: Bool

    init(_ threshold: Int, _ key: BadgeMaterialKey) {
        self.threshold = threshold
        self.key = key
        self.ribbon = (BadgeMaterialKey.allCases.firstIndex(of: key) ?? 0) >= (BadgeMaterialKey.allCases.firstIndex(of: .or) ?? 0)
        self.iridescent = key == .prisme
    }
}

public struct BadgeImprint: Sendable, Equatable {
    public let extinguished: Bool
    public let missing: Int

    public init(extinguished: Bool, missing: Int) {
        self.extinguished = extinguished
        self.missing = missing
    }
}

public enum GameBadgeTiers {
    public static let materials = [
        BadgeMaterial(1, .cuivre), BadgeMaterial(10, .bronze), BadgeMaterial(50, .argent),
        BadgeMaterial(100, .or), BadgeMaterial(500, .platine), BadgeMaterial(1000, .obsidienne),
        BadgeMaterial(5000, .prisme),
    ]

    /// La matière du palier, `nil` pour un seuil qui n'en est pas un.
    public static func material(ofThreshold threshold: Int) -> BadgeMaterialKey? {
        materials.first { $0.threshold == threshold }?.key
    }

    /// La matière du plus haut palier que le compteur couvre, `nil` en dessous du premier.
    public static func materialReached(count: Int) -> BadgeMaterialKey? {
        materials.last { max(0, count) >= $0.threshold }?.key
    }

    /// `true` pour 1 000 et 5 000 : les paliers qu'un ancien client ne connaît pas.
    public static func isExtended(_ threshold: Int) -> Bool {
        !EngagementCatalog.legacyBadgeThresholds.contains(threshold) && EngagementCatalog.badgeThresholds.contains(threshold)
    }

    /// Les paliers à servir : les cinq d'origine à un client qui ignore les nouveaux.
    public static func servedThresholds(knowsExtendedTiers: Bool) -> [Int] {
        knowsExtendedTiers ? EngagementCatalog.badgeThresholds : EngagementCatalog.legacyBadgeThresholds
    }

    /// Ce qu'il manque pour rallumer un badge tenu à ce palier — « −37 » sur l'empreinte.
    public static func imprint(count: Int, threshold: Int) -> BadgeImprint {
        let missing = max(0, threshold - max(0, count))
        return BadgeImprint(extinguished: missing > 0, missing: missing)
    }
}
