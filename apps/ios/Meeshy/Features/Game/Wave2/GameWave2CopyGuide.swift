import Foundation

// MARK: - Ce que la vague 2 du jeu dit — guide (suite de `GameText`, voir `GameWave2CopyCommon.swift`)

extension GameText {
    static var guideActionSeeLeague: String { String(localized: "game2.guide.action.see_league", defaultValue: "Voir ma joute", bundle: .main) }

    static var guideActionSeeSeason: String { String(localized: "game2.guide.action.see_season", defaultValue: "Voir mon voyage", bundle: .main) }

    static var guideActionSeeTrophies: String { String(localized: "game2.guide.action.see_trophies", defaultValue: "Voir mes trophées", bundle: .main) }

    static var guideActionSeeAtlas: String { String(localized: "game2.guide.action.see_atlas", defaultValue: "Voir mon Atlas", bundle: .main) }

    static func guideMomentLeagueFirstWhat(league: String) -> String {
        String(localized: "game2.guide.moment.league_first.what", defaultValue: "Bienvenue dans la joute \(league) !", bundle: .main)
    }

    static var guideMomentLeagueFirstMeans: String { String(localized: "game2.guide.moment.league_first.means", defaultValue: "Chaque semaine, tu te mesures à 29 autres héros. Les 7 premiers gravissent le cercle suivant, les 5 derniers redescendent, et les étincelles repartent de zéro.", bundle: .main) }

    static func guideMomentLeagueFirstNext(points: String) -> String {
        String(localized: "game2.guide.moment.league_first.next", defaultValue: "\(points) jusqu’au cercle suivant cette semaine.", bundle: .main)
    }

    static var guideMomentLeagueFirstNextTop: String { String(localized: "game2.guide.moment.league_first.next_top", defaultValue: "Tu es déjà au plus haut cercle des joutes.", bundle: .main) }

    static func guideMomentLeagueFirstShort(league: String, points: String) -> String {
        String(localized: "game2.guide.moment.league_first.short", defaultValue: "Joute \(league) · \(points) jusqu’au cercle suivant.", bundle: .main)
    }

    static func guideMomentLeaguePromotedWhat(league: String) -> String {
        String(localized: "game2.guide.moment.league_promoted.what", defaultValue: "Tu gravis le cercle : joute \(league) !", bundle: .main)
    }

    static func guideMomentLeaguePromotedMeans(rank: String, from: String) -> String {
        String(localized: "game2.guide.moment.league_promoted.means", defaultValue: "Tu as fini à la place \(rank) de la joute \(from) : les 7 premiers gravissent le cercle suivant.", bundle: .main)
    }

    static var guideMomentLeaguePromotedNext: String { String(localized: "game2.guide.moment.league_promoted.next", defaultValue: "Une nouvelle semaine commence : les étincelles repartent de zéro.", bundle: .main) }

    static func guideMomentLeaguePromotedShort(league: String) -> String {
        String(localized: "game2.guide.moment.league_promoted.short", defaultValue: "Cercle gravi : joute \(league).", bundle: .main)
    }

    static func guideMomentLeagueRelegatedWhat(league: String) -> String {
        String(localized: "game2.guide.moment.league_relegated.what", defaultValue: "Tu redescends dans la joute \(league).", bundle: .main)
    }

    static var guideMomentLeagueRelegatedMeans: String { String(localized: "game2.guide.moment.league_relegated.means", defaultValue: "Les 5 derniers de chaque joute redescendent. Ce n’est pas grave : les étincelles repartent de zéro et rien d’autre ne baisse.", bundle: .main) }

    static func guideMomentLeagueRelegatedNext(points: String) -> String {
        String(localized: "game2.guide.moment.league_relegated.next", defaultValue: "Remonte dès cette semaine : \(points) jusqu’au cercle suivant.", bundle: .main)
    }

    static var guideMomentLeagueRelegatedNextFar: String { String(localized: "game2.guide.moment.league_relegated.next_far", defaultValue: "Remonte dès cette semaine : chaque étincelle compte.", bundle: .main) }

    static func guideMomentLeagueRelegatedShort(league: String) -> String {
        String(localized: "game2.guide.moment.league_relegated.short", defaultValue: "Retour dans la joute \(league).", bundle: .main)
    }

    static func guideMomentSeasonStartWhat(season: String) -> String {
        String(localized: "game2.guide.moment.season_start.what", defaultValue: "Le voyage \(season) commence !", bundle: .main)
    }

    static func guideMomentSeasonStartMeans(theme: String) -> String {
        String(localized: "game2.guide.moment.season_start.means", defaultValue: "Huit semaines en terre de langue : \(theme). Chaque acte réalisé et chaque alliance te font avancer de quelques pas, et chaque halte est gratuite.", bundle: .main)
    }

    static var guideMomentSeasonStartMeansPlain: String { String(localized: "game2.guide.moment.season_start.means_plain", defaultValue: "Huit semaines en terre de langue. Chaque acte réalisé et chaque alliance te font avancer de quelques pas, et chaque halte est gratuite.", bundle: .main) }

    static func guideMomentSeasonStartNext(steps: String) -> String {
        String(localized: "game2.guide.moment.season_start.next", defaultValue: "\(steps) haltes t’attendent, et au bout, la coupe du voyage.", bundle: .main)
    }

    static func guideMomentSeasonStartShort(season: String) -> String {
        String(localized: "game2.guide.moment.season_start.short", defaultValue: "Voyage \(season) : des haltes gratuites.", bundle: .main)
    }

    static func guideMomentSeasonEndWhatDone(season: String) -> String {
        String(localized: "game2.guide.moment.season_end.what_done", defaultValue: "Voyage \(season) accompli : tu es allé au bout !", bundle: .main)
    }

    static func guideMomentSeasonEndWhat(season: String) -> String {
        String(localized: "game2.guide.moment.season_end.what", defaultValue: "Le voyage \(season) s’achève.", bundle: .main)
    }

    static func guideMomentSeasonEndMeansDone(glory: String) -> String {
        String(localized: "game2.guide.moment.season_end.means_done", defaultValue: "Tu gagnes la coupe du voyage, une médaille datée et \(glory) de gloire.", bundle: .main)
    }

    static func guideMomentSeasonEndMeans(steps: String) -> String {
        String(localized: "game2.guide.moment.season_end.means", defaultValue: "Tu es allé jusqu’à la halte \(steps) sur 40. Rien n’est perdu : ton niveau et ton rang ne bougent pas.", bundle: .main)
    }

    static var guideMomentSeasonEndNext: String { String(localized: "game2.guide.moment.season_end.next", defaultValue: "Le prochain voyage part bientôt.", bundle: .main) }

    static func guideMomentSeasonEndShort(season: String) -> String {
        String(localized: "game2.guide.moment.season_end.short", defaultValue: "Fin du voyage \(season).", bundle: .main)
    }

    static var guideMomentTrophyWhat: String { String(localized: "game2.guide.moment.trophy.what", defaultValue: "Un nouveau trophée !", bundle: .main) }

    static func guideMomentTrophyMeans(title: String) -> String {
        String(localized: "game2.guide.moment.trophy.means", defaultValue: "\(title) rejoint tes trophées. Un trophée ne rapporte rien : il se garde et se montre.", bundle: .main)
    }

    static var guideMomentTrophyNext: String { String(localized: "game2.guide.moment.trophy.next", defaultValue: "Range-le à ta façon, et choisis qui le voit.", bundle: .main) }

    static func guideMomentTrophyShort(title: String) -> String {
        String(localized: "game2.guide.moment.trophy.short", defaultValue: "Nouveau trophée : \(title).", bundle: .main)
    }

    static func guideMomentPrestigeWhat(number: String) -> String {
        String(localized: "game2.guide.moment.prestige.what", defaultValue: "Renaissance \(number) !", bundle: .main)
    }

    static func guideMomentPrestigeMeans(glory: String) -> String {
        String(localized: "game2.guide.moment.prestige.means", defaultValue: "Ta légende entre dans un nouvel Âge, avec un trophée numéroté et \(glory) de gloire. Ton rang ne recule jamais.", bundle: .main)
    }

    static var guideMomentPrestigeNext: String { String(localized: "game2.guide.moment.prestige.next", defaultValue: "Ta lumière redevient Étincelle : ton niveau repart à 1.", bundle: .main) }

    static func guideMomentPrestigeShort(number: String) -> String {
        String(localized: "game2.guide.moment.prestige.short", defaultValue: "Renaissance \(number).", bundle: .main)
    }

    static func guideMomentAtlasStampWhat(language: String) -> String {
        String(localized: "game2.guide.moment.atlas_stamp.what", defaultValue: "Nouveau tampon : \(language) !", bundle: .main)
    }

    static var guideMomentAtlasStampMeans: String { String(localized: "game2.guide.moment.atlas_stamp.means", defaultValue: "Tu as vraiment échangé dans cette langue : un message envoyé, un message reçu.", bundle: .main) }

    static func guideMomentAtlasStampNext(stamped: String, total: String) -> String {
        String(localized: "game2.guide.moment.atlas_stamp.next", defaultValue: "\(stamped) langues sur \(total) dans ton passeport.", bundle: .main)
    }

    static func guideMomentAtlasStampShort(language: String) -> String {
        String(localized: "game2.guide.moment.atlas_stamp.short", defaultValue: "Tampon : \(language).", bundle: .main)
    }

    static var photoKickerTrophy: String { String(localized: "game2.photo.kicker.trophy", defaultValue: "Nouveau trophée", bundle: .main) }

    static var photoKickerLeagueUp: String { String(localized: "game2.photo.kicker.league_up", defaultValue: "Cercle gravi", bundle: .main) }

    static var photoKickerSeason: String { String(localized: "game2.photo.kicker.season", defaultValue: "Voyage accompli", bundle: .main) }

    static var photoKickerPrestige: String { String(localized: "game2.photo.kicker.prestige", defaultValue: "Renaissance", bundle: .main) }

    static func photoTitleLeagueUp(league: String) -> String {
        String(localized: "game2.photo.title.league_up", defaultValue: "Joute \(league)", bundle: .main)
    }

}
