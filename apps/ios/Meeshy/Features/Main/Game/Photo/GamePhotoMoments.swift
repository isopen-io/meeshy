import Foundation
import MeeshySDK

/// LES MOMENTS QUI SE PHOTOGRAPHIENT (#9382) — conception, partie VI : « les
/// grands moments se photographient ». Photo de départ, nouveau rang ou
/// division, nouveau palier de niveau et Prestige, première Meesh, chaque 10e et
/// chaque édition or ou prisme, palier du trésor, Flamme à 7, 30, 100 et 365
/// jours. Miroir de `apps/web/src/lib/game-photo/moments.ts`.
///
/// Un moment est une DONNÉE : une identité stable (`id`), l'emblème que le cadre
/// grave (`emblem`), et deux lignes (`kicker`, `title`). L'identité fait qu'un
/// « plus tard » puis un retour ne propose jamais deux fois la même photo, et
/// qu'une division nouvelle est un moment nouveau.
nonisolated enum PhotoEmblem: Equatable, Codable, Sendable {
    case start
    case rank(GloryRank, GloryDivision5?)
    case tier(LevelTierKey, level: Int)
    case levelHundred(prestige: Int)
    case meesh(number: Int, edition: MeeshEdition)
    case treasury(TreasuryTierKey)
    case flame(FlameFormKey, days: Int)
    /// Un succès révélé (#7742) : la coupe d'or, la Signature frappée sur la panse.
    case achievement
    // La vague 2 (#9481) : le trophée qui vient d'arriver, la gemme de la ligue gagnée, la coupe de la saison
    // terminée, le trophée numéroté du Prestige.
    case trophy(key: String)
    case leagueUp(LeagueKey)
    case season(Int)
    case prestige(number: Int)
}

nonisolated struct PhotoMoment: Equatable, Identifiable, Codable, Sendable {
    let id: String
    let emblem: PhotoEmblem
    /// La ligne du dessus : « Nouveau rang ».
    let kicker: String
    /// La ligne forte : « Voix II ».
    let title: String
}

enum GamePhotoMoments {

    static let flameThresholds = [7, 30, 100, 365]

    static func start() -> PhotoMoment {
        PhotoMoment(
            id: "start",
            emblem: .start,
            kicker: String(localized: "game.photo.kicker.start", defaultValue: "Premiers pas", bundle: .main),
            title: String(localized: "game.photo.title.start", defaultValue: "Mon départ sur Meeshy", bundle: .main)
        )
    }

    /// Le succès qu'on vient de révéler : la même carte se propose à la révélation (#7742). L'identité
    /// porte la clé du succès (`EngagementReveal.id`, déjà préfixée « achievement: ») — le même succès
    /// n'est jamais proposé deux fois au carnet.
    static func achievement(id: String, title: String) -> PhotoMoment {
        PhotoMoment(
            id: id.hasPrefix("achievement:") ? id : "achievement:\(id)",
            emblem: .achievement,
            kicker: String(localized: "game.photo.kicker.achievement", defaultValue: "Succès", bundle: .main),
            title: title
        )
    }

    static func rank(_ rank: GloryRank, division: GloryDivision5?, mythic: MythicSeatRef? = nil) -> PhotoMoment {
        PhotoMoment(
            id: "rank:\(rank.rawValue):\(division?.rawValue ?? 0)",
            emblem: .rank(rank, division),
            kicker: String(localized: "game.photo.kicker.rank", defaultValue: "Nouveau rang", bundle: .main),
            title: GameCopy.rankLabel(rank, division5: division, mythic: mythic)
        )
    }

    static func tier(_ tier: LevelTierKey, level: Int) -> PhotoMoment {
        let name = GameCopy.tierName(tier)
        return PhotoMoment(
            id: "tier:\(tier.rawValue)",
            emblem: .tier(tier, level: level),
            kicker: String(localized: "game.photo.kicker.tier", defaultValue: "Niveau \(GameCopy.formatCount(level))", bundle: .main),
            title: String(localized: "game.photo.title.tier", defaultValue: "Palier \(name)", bundle: .main)
        )
    }

    static func levelHundred(prestige: Int) -> PhotoMoment {
        PhotoMoment(
            id: "level-100:\(prestige)",
            emblem: .levelHundred(prestige: prestige),
            kicker: prestige == 0
                ? String(localized: "game.photo.kicker.summit", defaultValue: "Au sommet", bundle: .main)
                : String(localized: "game.photo.kicker.new_lap", defaultValue: "Nouveau tour", bundle: .main),
            title: prestige == 0
                ? String(localized: "game.photo.title.level_100", defaultValue: "Niveau 100", bundle: .main)
                : String(localized: "game.photo.title.prestige", defaultValue: "Prestige \(GameCopy.formatCount(prestige))", bundle: .main)
        )
    }

    static func meesh(number: Int, edition: MeeshEdition) -> PhotoMoment {
        let digits = GameCopy.formatCount(number)
        let title: String
        if number == 1 {
            title = String(localized: "game.photo.title.meesh_first", defaultValue: "Ma première Meesh", bundle: .main)
        } else if edition == .silver {
            title = String(localized: "game.photo.title.meesh_number", defaultValue: "Meesh n° \(digits)", bundle: .main)
        } else {
            title = String(localized: "game.photo.title.meesh_number_edition", defaultValue: "Meesh n° \(digits) · \(GameCopy.editionName(edition))", bundle: .main)
        }
        return PhotoMoment(
            id: "meesh:\(number)",
            emblem: .meesh(number: number, edition: edition),
            kicker: String(localized: "game.photo.kicker.meesh", defaultValue: "Meesh frappée", bundle: .main),
            title: title
        )
    }

    static func treasury(_ tier: TreasuryTierKey) -> PhotoMoment {
        PhotoMoment(
            id: "treasury:\(tier.rawValue)",
            emblem: .treasury(tier),
            kicker: String(localized: "game.photo.kicker.treasury", defaultValue: "Trésor", bundle: .main),
            title: GameCopy.treasuryName(tier)
        )
    }

    static func flameThreshold(for days: Int) -> Int? {
        flameThresholds.last { days >= $0 }
    }

    static func flame(days: Int) -> PhotoMoment {
        let threshold = flameThreshold(for: days) ?? days
        return PhotoMoment(
            id: "flame:\(threshold)",
            emblem: .flame(GameFlame.form(forDays: threshold) ?? .braise, days: threshold),
            kicker: String(localized: "game.photo.kicker.flame", defaultValue: "Flamme", bundle: .main),
            title: String(localized: "game.photo.title.flame_days", defaultValue: "\(GameCopy.formatCount(threshold)) jours de Flamme", bundle: .main)
        )
    }

    private static func tierLevel(_ tier: LevelTierKey) -> Int {
        (LevelTierKey.allCases.firstIndex(of: tier) ?? 0) * 10
    }

    /// Le moment que propose une carte du guide, dans l'état courant du jeu ; `nil` si elle ne se photographie pas.
    static func fromCard(key: GuideMomentKey, game: GameBlock) -> PhotoMoment? {
        switch key {
        case .newRank:
            return rank(game.glory.rank, division: game.glory.shownDivision, mythic: game.glory.mythicSeat)
        case .newTier:
            return tier(game.level.tier, level: tierLevel(game.level.tier))
        case .firstMint:
            // `mint.number` est la PROCHAINE pièce : celle qui vient d'être frappée porte le numéro d'avant.
            let number = max(1, game.mint.number - 1)
            return meesh(number: number, edition: GameMint.edition(forNumber: number))
        case .treasuryTier:
            return game.treasury.tier.map(treasury)
        case .level100:
            return levelHundred(prestige: game.level.prestige)
        default:
            return nil
        }
    }

    private static func treasuryIndex(_ game: GameBlock) -> Int {
        guard let tier = game.treasury.tier else { return -1 }
        return TreasuryTierKey.allCases.firstIndex(of: tier) ?? -1
    }

    /// Les moments que la transition vient de produire : ce que Mee propose APRÈS la célébration.
    static func ofTransition(from before: GameBlock, to after: GameBlock) -> [PhotoMoment] {
        var moments: [PhotoMoment] = []
        let minted = before.mint.number

        let divisionRose: Bool = {
            guard let now = after.glory.shownDivision, let then = before.glory.shownDivision else { return false }
            return now.rawValue < then.rawValue
        }()
        if (after.glory.rank != before.glory.rank || divisionRose) && after.glory.glory > before.glory.glory {
            moments.append(rank(after.glory.rank, division: after.glory.shownDivision, mythic: after.glory.mythicSeat))
        }
        // Le Prestige a sa propre carte (le trophée numéroté) : la carte « niveau 100 » de la vague 1 ne la double pas.
        let wave2 = ofTransitionV2(from: before, to: after)
        let prestigeCard = wave2.contains { if case .prestige = $0.emblem { true } else { false } }
        let tierBefore = LevelTierKey.allCases.firstIndex(of: before.level.tier) ?? 0
        let tierAfter = LevelTierKey.allCases.firstIndex(of: after.level.tier) ?? 0
        if tierAfter > tierBefore {
            moments.append(tier(after.level.tier, level: tierLevel(after.level.tier)))
        }
        if after.level.prestige > before.level.prestige && !prestigeCard {
            moments.append(levelHundred(prestige: after.level.prestige))
        }
        if after.mint.number > before.mint.number && (minted == 1 || minted % 10 == 0) {
            moments.append(meesh(number: minted, edition: GameMint.edition(forNumber: minted)))
        }
        if treasuryIndex(after) > treasuryIndex(before), let tier = after.treasury.tier {
            moments.append(treasury(tier))
        }
        if flameThresholds.contains(where: { before.flame.days < $0 && after.flame.days >= $0 }) {
            moments.append(flame(days: after.flame.days))
        }
        moments.append(contentsOf: wave2)
        return moments
    }
}
