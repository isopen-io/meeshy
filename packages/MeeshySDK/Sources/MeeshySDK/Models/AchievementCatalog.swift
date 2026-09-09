import Foundation

/// LA GRAMMAIRE DES SUCCÈS, côté iOS (#5758/#5759) — MIROIR de
/// `packages/shared/types/achievement-catalog.ts` et `utils/achievement-view.ts`.
///
/// Le catalogue Xcode ne peut pas importer un module TypeScript : ce fichier en
/// est la projection, et il doit rendre EXACTEMENT les mêmes entrées, dans le
/// même ordre, que le web. Trois mécanismes distincts s'y rejouent, et les
/// confondre les casserait :
///
///  1. l'ATTEIGNABILITÉ, qui RETIRE un palier que le produit ne peut pas rendre
///     vrai — un objectif hors de portée ne doit pas exister, même invisible ;
///  2. l'ORDRE, du moins complexe au plus complexe, par `baseDifficulty +
///     log10(palier)` — le palier brut rangerait « 100 conversations » et
///     « une conversation de 100 membres » au même endroit ;
///  3. la FENÊTRE `max(7, acquis + 2)`, qui garde le prochain objectif visible
///     à tout moment.
public struct AchievementFamily: Sendable, Equatable, Hashable {
    public let section: String
    public let subject: String
    public let verb: String
    /// « count » (volume — combien de fois) ou « size » (ampleur — de quelle taille).
    public let scale: String
    public let baseDifficulty: Double

    public init(section: String, subject: String, verb: String, scale: String, baseDifficulty: Double) {
        self.section = section
        self.subject = subject
        self.verb = verb
        self.scale = scale
        self.baseDifficulty = baseDifficulty
    }

    /// L'identité dans les tables de libellés — sans la section, qui n'en change pas le sens.
    public var id: String { "\(subject).\(verb).\(scale)" }

    public func key(tier: Int) -> String {
        "achievement.\(section).\(subject).\(verb).\(scale):\(tier)"
    }

    public var tiers: [Int] {
        scale == "count" ? AchievementCatalog.countTiers : AchievementCatalog.sizeTiers
    }

    public func difficulty(tier: Int) -> Double {
        baseDifficulty + log10(Double(max(1, tier)))
    }
}

public enum AchievementCatalog {
    public static let countTiers: [Int] = [1, 10, 100, 1_000, 10_000]
    public static let sizeTiers: [Int] = [10, 100, 1_000, 10_000, 100_000, 1_000_000]

    /// La fenêtre : sept entrées au minimum, puis deux de plus par succès décroché.
    public static let windowMinimum = 7
    public static let windowStep = 2

    /// Les familles, TOUTES sections — miroir exact du TypeScript, gardé par
    /// `achievement-catalog-mirror-parity`.
    ///
    /// `decouverte` est ABSENTE des deux côtés : elle demande la forme
    /// COLLECTION (#5751), dont aucun stockage n'existe encore.
    ///
    ///
    /// `community.leave.count` est ABSENTE, comme côté TypeScript : quitter une
    /// communauté SUPPRIME la ligne, il n'y a rien à compter (#5760). La
    /// déclarer ici produirait un succès que rien ne peut faire tomber — et une
    /// divergence avec le web, que le témoin de parité interdit.
    public static let families: [AchievementFamily] = [
        AchievementFamily(section: "cercles", subject: "conversation", verb: "join", scale: "size", baseDifficulty: 1),
        AchievementFamily(section: "cercles", subject: "conversation", verb: "join", scale: "count", baseDifficulty: 2),
        AchievementFamily(section: "cercles", subject: "conversation", verb: "leave", scale: "count", baseDifficulty: 1.8),
        AchievementFamily(section: "cercles", subject: "conversation", verb: "create", scale: "count", baseDifficulty: 2.5),
        AchievementFamily(section: "cercles", subject: "community", verb: "join", scale: "size", baseDifficulty: 1.5),
        AchievementFamily(section: "cercles", subject: "community", verb: "join", scale: "count", baseDifficulty: 2.5),
        AchievementFamily(section: "cercles", subject: "community", verb: "create", scale: "size", baseDifficulty: 2),
        AchievementFamily(section: "cercles", subject: "community", verb: "create", scale: "count", baseDifficulty: 3),
        AchievementFamily(section: "parole", subject: "message", verb: "send", scale: "count", baseDifficulty: 0),
        AchievementFamily(section: "parole", subject: "voice", verb: "send", scale: "count", baseDifficulty: 0.8),
        AchievementFamily(section: "parole", subject: "image", verb: "send", scale: "count", baseDifficulty: 0.8),
        AchievementFamily(section: "parole", subject: "video", verb: "send", scale: "count", baseDifficulty: 1.3),
        AchievementFamily(section: "retouche", subject: "message", verb: "edit", scale: "count", baseDifficulty: 1),
        AchievementFamily(section: "retouche", subject: "message", verb: "delete", scale: "count", baseDifficulty: 1),
        AchievementFamily(section: "retouche", subject: "message", verb: "react", scale: "count", baseDifficulty: 0.5),
        AchievementFamily(section: "appels", subject: "call", verb: "join", scale: "count", baseDifficulty: 1.5),
        AchievementFamily(section: "appels", subject: "call", verb: "start", scale: "count", baseDifficulty: 2),
        AchievementFamily(section: "appels", subject: "call", verb: "start", scale: "size", baseDifficulty: 2.5),
        AchievementFamily(section: "ambassade", subject: "referral", verb: "complete", scale: "count", baseDifficulty: 2.5),
        AchievementFamily(section: "ambassade", subject: "link", verb: "click", scale: "count", baseDifficulty: 1.5),
        AchievementFamily(section: "constance", subject: "streak", verb: "hold", scale: "count", baseDifficulty: 2),
        AchievementFamily(section: "monnaie", subject: "meesh", verb: "mint", scale: "count", baseDifficulty: 3.5),
    ]

    /// Une famille absente de la carte n'est pas « zéro » : c'est « non mesuré ».
    /// Ses paliers d'AMPLEUR sont masqués (on ne promet pas ce qu'on ignore) et
    /// ses paliers de VOLUME restent visibles (répéter reste possible).
    public static func isAttainable(_ family: AchievementFamily, tier: Int, reach: [String: Int]) -> Bool {
        guard let mesure = reach[family.id] else { return family.scale == "count" }
        return tier <= mesure
    }

    public static func windowSize(unlockedCount: Int) -> Int {
        max(windowMinimum, max(0, unlockedCount) + windowStep)
    }
}

public struct AchievementEntry: Sendable, Equatable, Identifiable {
    public let key: String
    public let section: String
    public let family: AchievementFamily
    public let tier: Int
    public let difficulty: Double
    public let unlocked: Bool
    public let reachedAt: Date?

    public var id: String { key }
}

public struct AchievementSectionView: Sendable, Equatable, Identifiable {
    public let section: String
    /// Déjà tronquées à la fenêtre — la vue n'en retire aucune.
    public let entries: [AchievementEntry]
    public let unlockedCount: Int
    /// Le total ATTEIGNABLE, jamais le total déclaré.
    public let attainableCount: Int

    public var id: String { section }
}

public enum AchievementResolver {
    /// Développe, ordonne, filtre et tronque — dans cet ordre, comme la loi partagée.
    public static func sections(
        reach: [String: Int],
        unlocked: [String: Date?],
        families: [AchievementFamily] = AchievementCatalog.families
    ) -> [AchievementSectionView] {
        var entries: [AchievementEntry] = []
        for family in families {
            for tier in family.tiers where AchievementCatalog.isAttainable(family, tier: tier, reach: reach) {
                let key = family.key(tier: tier)
                let estAcquis = unlocked.keys.contains(key)
                entries.append(
                    AchievementEntry(
                        key: key,
                        section: family.section,
                        family: family,
                        tier: tier,
                        difficulty: family.difficulty(tier: tier),
                        unlocked: estAcquis,
                        reachedAt: unlocked[key] ?? nil
                    )
                )
            }
        }
        // À difficulté égale la clé départage : un ordre STABLE vaut mieux qu'un
        // ordre joli mais changeant d'un rendu à l'autre — et c'est aussi ce qui
        // garantit l'identité avec le web.
        entries.sort { $0.difficulty == $1.difficulty ? $0.key < $1.key : $0.difficulty < $1.difficulty }

        var parSection: [String: [AchievementEntry]] = [:]
        var ordre: [String] = []
        for entry in entries {
            if parSection[entry.section] == nil { ordre.append(entry.section) }
            parSection[entry.section, default: []].append(entry)
        }

        return ordre.compactMap { section in
            guard let toutes = parSection[section] else { return nil }
            let acquis = toutes.filter(\.unlocked).count
            return AchievementSectionView(
                section: section,
                entries: Array(toutes.prefix(AchievementCatalog.windowSize(unlockedCount: acquis))),
                unlockedCount: acquis,
                attainableCount: toutes.count
            )
        }
    }
}
