import Foundation
import MeeshySDK

// MARK: - Le carnet des règles, illustré (#9538)
//
// Directive porteur 2026-10-06 : la partie explication reprend le détail du document de conception (parties I, II et
// IV) AVEC les images et les représentations — les blasons des rangs, les pièces, les paliers, les Flammes, les ligues,
// les médailles, le trésor, les trophées, les raretés. Pas d'image bitmap : chaque famille est dessinée par la brique
// qui la dessine déjà partout ailleurs dans l'app (anneau, pièce, blason, Flamme, gemme, médaille, coupe, liseré) — une
// seule source du dessin, jamais une jumelle qui dériverait.
//
// Ce fichier est le MODÈLE : quelles familles, dans quel ordre, avec quels éléments, et qui parle (Mee montre le geste,
// Meo explique la règle). La vue (`GameRulesAtlasView`) les dessine. Miroir de `apps/web/src/routes/progression-rules.tsx`.

enum GameRulesAtlas {

    /// Les neuf familles, dans l'ordre du document : ce que le joueur monte (paliers), ce qu'il garde (pièce, trésor), ce
    /// qui le distingue (rangs, Flamme, ligues), ce qu'il montre (médailles, trophées, raretés).
    enum Family: String, CaseIterable, Identifiable {
        case tiers
        case coin
        case treasury
        case ranks
        case flames
        case leagues
        case medals
        case trophies
        case rarities

        var id: String { rawValue }

        /// Mee montre le geste, Meo explique la règle : ils se relaient d'une famille à l'autre.
        var speaker: GuideSpeaker {
            switch self {
            case .tiers, .treasury, .flames, .medals, .rarities: .mee
            case .coin, .ranks, .leagues, .trophies: .meo
            }
        }
    }

    // MARK: Les éléments de chaque famille

    /// Les dix paliers, du premier éclat à la galaxie, chacun avec le premier niveau qu'il couvre (1, 10, 20 … 90).
    static let tiers: [LevelTierKey] = LevelTierKey.allCases

    static func firstLevel(of tier: LevelTierKey) -> Int {
        tier.ordinal == 1 ? 1 : (tier.ordinal - 1) * 10
    }

    /// Les quatre faces de la planche IV.2 : l'avers, le revers numéroté, l'édition or (chaque centième), l'édition prisme
    /// (chaque millième).
    enum CoinPlate: String, CaseIterable, Identifiable {
        case obverse
        case reverse
        case gold
        case prism

        var id: String { rawValue }

        var isReverse: Bool { self != .obverse }

        var edition: MeeshEdition {
            switch self {
            case .obverse, .reverse: .silver
            case .gold: .gold
            case .prism: .prism
            }
        }

        /// Le numéro gravé au revers : 13 pour l'argent, 100 pour l'or, 1 000 pour le prisme.
        var number: Int {
            switch self {
            case .obverse, .reverse: 13
            case .gold: 100
            case .prism: 1000
            }
        }
    }

    /// Les six paliers du trésor, de la Bourse à la Réserve royale.
    static let treasury: [TreasuryTierKey] = TreasuryTierKey.allCases

    /// Combien de pièces la pile dessine : une de plus à chaque palier, de 1 à 6.
    static func pile(of tier: TreasuryTierKey) -> Int {
        (TreasuryTierKey.allCases.firstIndex(of: tier) ?? 0) + 1
    }

    /// Les onze blasons : dix rangs en cinq divisions (V → I), puis Mythe (#9636).
    static let ranks: [GloryRank] = GloryRank.allCases

    /// La division sous laquelle le blason se montre : la plus basse (V, une encoche) — Mythe n'en a pas.
    static func division(of rank: GloryRank) -> GloryDivision5? {
        rank == .mythe ? nil : .v
    }

    /// Les cinq formes de la Flamme.
    static let flames: [FlameFormKey] = FlameFormKey.allCases

    /// Les huit ligues, du Quartz au Prisme.
    static let leagues: [LeagueKey] = LeagueKey.allCases

    /// Une matière de médaille avec son seuil d'actions.
    struct MedalMaterial: Identifiable, Equatable {
        let material: GameMaterial
        let threshold: Int

        var id: GameMaterial { material }
    }

    /// Les sept matières des médailles, du cuivre au prisme, chacune avec son seuil d'actions (1 · 10 · 50 · 100 · 500 ·
    /// 1 000 · 5 000). La matière « Flamme » est celle du trophée de série, pas d'une médaille.
    static let medalMaterials: [MedalMaterial] = [
        MedalMaterial(material: .copper, threshold: 1), MedalMaterial(material: .bronze, threshold: 10),
        MedalMaterial(material: .silver, threshold: 50), MedalMaterial(material: .gold, threshold: 100),
        MedalMaterial(material: .platinum, threshold: 500), MedalMaterial(material: .obsidian, threshold: 1000),
        MedalMaterial(material: .prism, threshold: 5000),
    ]

    /// Les trois formes d'un badge : l'hexagone (combien de fois), le losange (le meilleur), le médaillon (à réunir).
    enum MedalShape: String, CaseIterable, Identifiable {
        case accumulation
        case record
        case collection

        var id: String { rawValue }
    }

    /// Les trophées : la coupe de ligue (or, argent, bronze), la coupe de saison, le trophée de Prestige, celui de la Flamme.
    enum TrophyPlate: String, CaseIterable, Identifiable {
        case leagueGold
        case leagueSilver
        case leagueBronze
        case season
        case prestige
        case flame

        var id: String { rawValue }

        var material: GameMaterial {
            switch self {
            case .leagueGold: .gold
            case .leagueSilver: .silver
            case .leagueBronze: .bronze
            case .season: .platinum
            case .prestige: .prism
            case .flame: .flame
            }
        }
    }

    /// Les cinq raretés, de la plus commune à la plus rare, avec le liseré et la Gloire qu'elles rapportent.
    static let rarities: [GameGlory.AchievementRarity] = GameGlory.AchievementRarity.allCases

    static func border(of rarity: GameGlory.AchievementRarity) -> RarityBorder {
        GameRarity.border(for: rarity)
    }

    static func glory(of rarity: GameGlory.AchievementRarity) -> Int {
        GameGlory.gloryForAchievement(rarity)
    }
}

// MARK: - Ce que Mee et Meo disent

/// Une ligne par famille — courte : le détail est dans les dessins. Les titres et les phrases sont dans les sept langues.
enum GameAtlasCopy {

    static func title(_ family: GameRulesAtlas.Family) -> String {
        switch family {
        case .tiers: String(localized: "game.atlas.tiers.title", defaultValue: "Les 10 paliers", bundle: .main)
        case .coin: String(localized: "game.atlas.coin.title", defaultValue: "La Meesh : avers et revers", bundle: .main)
        case .treasury: String(localized: "game.atlas.treasury.title", defaultValue: "Les paliers du trésor", bundle: .main)
        case .ranks: String(localized: "game.atlas.ranks.title", defaultValue: "Les blasons des rangs", bundle: .main)
        case .flames: String(localized: "game.atlas.flames.title", defaultValue: "Les cinq Flammes", bundle: .main)
        case .leagues: String(localized: "game.atlas.leagues.title", defaultValue: "Les huit ligues", bundle: .main)
        case .medals: String(localized: "game.atlas.medals.title", defaultValue: "Les médailles", bundle: .main)
        case .trophies: String(localized: "game.atlas.trophies.title", defaultValue: "Les trophées", bundle: .main)
        case .rarities: String(localized: "game.atlas.rarities.title", defaultValue: "Les raretés", bundle: .main)
        }
    }

    static func line(_ family: GameRulesAtlas.Family) -> String {
        switch family {
        case .tiers:
            String(localized: "game.atlas.tiers.line", defaultValue: "Dix paliers, du premier éclat à la galaxie : ton anneau change à chacun.", bundle: .main)
        case .coin:
            String(localized: "game.atlas.coin.line", defaultValue: "Chaque Meesh est numérotée : une pièce d’or tous les cent, un prisme tous les mille.", bundle: .main)
        case .treasury:
            String(localized: "game.atlas.treasury.line", defaultValue: "Garde tes Meeshes : le trésor se remplit, de la bourse à la réserve royale.", bundle: .main)
        case .ranks:
            String(localized: "game.atlas.ranks.line", defaultValue: "La Gloire fait monter ton rang. Il ne redescend jamais, même quand tu frappes.", bundle: .main)
        case .flames:
            String(localized: "game.atlas.flames.line", defaultValue: "Un jour de plus et ta Flamme grandit : de la braise jusqu’au soleil.", bundle: .main)
        case .leagues:
            String(localized: "game.atlas.leagues.line", defaultValue: "Chaque semaine, tu joues dans ta ligue : les sept premiers montent d’une gemme.", bundle: .main)
        case .medals:
            String(localized: "game.atlas.medals.line", defaultValue: "Sept matières, du cuivre au prisme : plus tu répètes un geste, plus la médaille brille.", bundle: .main)
        case .trophies:
            String(localized: "game.atlas.trophies.line", defaultValue: "Un trophée se reçoit à un moment précis, et il ne s’éteint jamais.", bundle: .main)
        case .rarities:
            String(localized: "game.atlas.rarities.line", defaultValue: "Plus un succès est rare, plus son liseré est précieux.", bundle: .main)
        }
    }

    static func coin(_ plate: GameRulesAtlas.CoinPlate) -> String {
        switch plate {
        case .obverse: String(localized: "game.atlas.coin.obverse", defaultValue: "Avers", bundle: .main)
        case .reverse: String(localized: "game.atlas.coin.reverse", defaultValue: "Revers", bundle: .main)
        case .gold: String(localized: "game.atlas.coin.gold", defaultValue: "Édition or · chaque centième", bundle: .main)
        case .prism: String(localized: "game.atlas.coin.prism", defaultValue: "Édition prisme · chaque millième", bundle: .main)
        }
    }

    static func shape(_ shape: GameRulesAtlas.MedalShape) -> String {
        switch shape {
        case .accumulation: String(localized: "game.atlas.medals.accumulation", defaultValue: "Accumulation", bundle: .main)
        case .record: String(localized: "game.atlas.medals.record", defaultValue: "Record", bundle: .main)
        case .collection: String(localized: "game.atlas.medals.collection", defaultValue: "Collection", bundle: .main)
        }
    }

    static var imprint: String { String(localized: "game.atlas.medals.imprint", defaultValue: "Empreinte", bundle: .main) }

    static func trophy(_ plate: GameRulesAtlas.TrophyPlate) -> String {
        switch plate {
        case .leagueGold, .leagueSilver, .leagueBronze:
            String(localized: "game.atlas.trophy.league", defaultValue: "Coupe de ligue", bundle: .main)
        case .season: String(localized: "game.atlas.trophy.season", defaultValue: "Coupe de saison", bundle: .main)
        case .prestige: String(localized: "game.atlas.trophy.prestige", defaultValue: "Trophée de Prestige", bundle: .main)
        case .flame: String(localized: "game.atlas.trophy.flame", defaultValue: "Trophée de Flamme", bundle: .main)
        }
    }

    static func share(_ rarity: GameGlory.AchievementRarity) -> String {
        switch rarity {
        case .common: String(localized: "game.atlas.rarity.common", defaultValue: "plus de 40 % des comptes", bundle: .main)
        case .rare: String(localized: "game.atlas.rarity.rare", defaultValue: "10 à 40 % des comptes", bundle: .main)
        case .epic: String(localized: "game.atlas.rarity.epic", defaultValue: "2 à 10 % des comptes", bundle: .main)
        case .legendary: String(localized: "game.atlas.rarity.legendary", defaultValue: "0,2 à 2 % des comptes", bundle: .main)
        case .mythic: String(localized: "game.atlas.rarity.mythic", defaultValue: "moins de 0,2 % des comptes", bundle: .main)
        }
    }

    /// Mythe est un rang à part : cent places, aux cent premiers qui atteignent 1 000 000 de Gloire (#9636).
    static var mythRank: String {
        String(localized: "game.atlas.ranks.myth", defaultValue: "Les 100 premiers à atteindre 1 000 000 de Gloire", bundle: .main)
    }
}
