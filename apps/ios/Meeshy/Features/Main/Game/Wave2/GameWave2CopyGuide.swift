import Foundation

// MARK: - Ce que la vague 2 du jeu dit — guide (suite de `GameText`, voir `GameWave2CopyCommon.swift`)

extension GameText {
    static var guideActionSeeLeague: String { String(localized: "game2.guide.action.see_league", defaultValue: "Voir ma ligue", bundle: .main) }

    static var guideActionSeeSeason: String { String(localized: "game2.guide.action.see_season", defaultValue: "Voir la saison", bundle: .main) }

    static var guideActionSeeTrophies: String { String(localized: "game2.guide.action.see_trophies", defaultValue: "Voir ma vitrine", bundle: .main) }

    static var guideActionSeeAtlas: String { String(localized: "game2.guide.action.see_atlas", defaultValue: "Voir mon Atlas", bundle: .main) }

    static func guideMomentLeagueFirstWhat(league: String) -> String {
        String(localized: "game2.guide.moment.league_first.what", defaultValue: "Bienvenue en ligue \(league) !", bundle: .main)
    }

    static var guideMomentLeagueFirstMeans: String { String(localized: "game2.guide.moment.league_first.means", defaultValue: "Chaque semaine, tu te mesures à 29 autres joueurs. Les 7 premiers montent, les 5 derniers descendent, et les points repartent de zéro.", bundle: .main) }

    static func guideMomentLeagueFirstNext(points: String) -> String {
        String(localized: "game2.guide.moment.league_first.next", defaultValue: "Encore \(points) pour monter cette semaine.", bundle: .main)
    }

    static var guideMomentLeagueFirstNextTop: String { String(localized: "game2.guide.moment.league_first.next_top", defaultValue: "Tu es déjà au sommet des ligues.", bundle: .main) }

    static func guideMomentLeagueFirstShort(league: String, points: String) -> String {
        String(localized: "game2.guide.moment.league_first.short", defaultValue: "Ligue \(league) : \(points) pour monter.", bundle: .main)
    }

    static func guideMomentLeaguePromotedWhat(league: String) -> String {
        String(localized: "game2.guide.moment.league_promoted.what", defaultValue: "Tu montes en ligue \(league) !", bundle: .main)
    }

    static func guideMomentLeaguePromotedMeans(rank: String, from: String) -> String {
        String(localized: "game2.guide.moment.league_promoted.means", defaultValue: "Tu as fini à la place \(rank) de la ligue \(from) : les 7 premiers montent.", bundle: .main)
    }

    static var guideMomentLeaguePromotedNext: String { String(localized: "game2.guide.moment.league_promoted.next", defaultValue: "Une nouvelle semaine commence : les points repartent de zéro.", bundle: .main) }

    static func guideMomentLeaguePromotedShort(league: String) -> String {
        String(localized: "game2.guide.moment.league_promoted.short", defaultValue: "Montée : ligue \(league).", bundle: .main)
    }

    static func guideMomentLeagueRelegatedWhat(league: String) -> String {
        String(localized: "game2.guide.moment.league_relegated.what", defaultValue: "Tu redescends en ligue \(league).", bundle: .main)
    }

    static var guideMomentLeagueRelegatedMeans: String { String(localized: "game2.guide.moment.league_relegated.means", defaultValue: "Les 5 derniers de chaque groupe descendent. Ce n’est pas grave : les points repartent de zéro et rien d’autre ne baisse.", bundle: .main) }

    static func guideMomentLeagueRelegatedNext(points: String) -> String {
        String(localized: "game2.guide.moment.league_relegated.next", defaultValue: "Remonte dès cette semaine : \(points) pour monter.", bundle: .main)
    }

    static var guideMomentLeagueRelegatedNextFar: String { String(localized: "game2.guide.moment.league_relegated.next_far", defaultValue: "Remonte dès cette semaine : chaque point compte.", bundle: .main) }

    static func guideMomentLeagueRelegatedShort(league: String) -> String {
        String(localized: "game2.guide.moment.league_relegated.short", defaultValue: "Retour en ligue \(league).", bundle: .main)
    }

    static func guideMomentSeasonStartWhat(season: String) -> String {
        String(localized: "game2.guide.moment.season_start.what", defaultValue: "La saison \(season) commence !", bundle: .main)
    }

    static func guideMomentSeasonStartMeans(theme: String) -> String {
        String(localized: "game2.guide.moment.season_start.means", defaultValue: "Huit semaines, un thème : \(theme). Les missions du jour et le duo donnent des étoiles, et chaque étape est gratuite.", bundle: .main)
    }

    static var guideMomentSeasonStartMeansPlain: String { String(localized: "game2.guide.moment.season_start.means_plain", defaultValue: "Huit semaines et un thème. Les missions du jour et le duo donnent des étoiles, et chaque étape est gratuite.", bundle: .main) }

    static func guideMomentSeasonStartNext(steps: String) -> String {
        String(localized: "game2.guide.moment.season_start.next", defaultValue: "\(steps) étapes t’attendent, de quoi gagner une coupe de saison.", bundle: .main)
    }

    static func guideMomentSeasonStartShort(season: String) -> String {
        String(localized: "game2.guide.moment.season_start.short", defaultValue: "Saison \(season) : étapes gratuites.", bundle: .main)
    }

    static func guideMomentSeasonEndWhatDone(season: String) -> String {
        String(localized: "game2.guide.moment.season_end.what_done", defaultValue: "Saison \(season) terminée : parcours complet !", bundle: .main)
    }

    static func guideMomentSeasonEndWhat(season: String) -> String {
        String(localized: "game2.guide.moment.season_end.what", defaultValue: "La saison \(season) se termine.", bundle: .main)
    }

    static func guideMomentSeasonEndMeansDone(glory: String) -> String {
        String(localized: "game2.guide.moment.season_end.means_done", defaultValue: "Tu gagnes la coupe de saison, un badge daté et \(glory) de Gloire.", bundle: .main)
    }

    static func guideMomentSeasonEndMeans(steps: String) -> String {
        String(localized: "game2.guide.moment.season_end.means", defaultValue: "Tu es allé jusqu’à l’étape \(steps) sur 40. Rien n’est perdu : ton niveau et ton rang ne bougent pas.", bundle: .main)
    }

    static var guideMomentSeasonEndNext: String { String(localized: "game2.guide.moment.season_end.next", defaultValue: "La prochaine saison commence bientôt.", bundle: .main) }

    static func guideMomentSeasonEndShort(season: String) -> String {
        String(localized: "game2.guide.moment.season_end.short", defaultValue: "Fin de la saison \(season).", bundle: .main)
    }

    static var guideMomentTrophyWhat: String { String(localized: "game2.guide.moment.trophy.what", defaultValue: "Un nouveau trophée !", bundle: .main) }

    static func guideMomentTrophyMeans(title: String) -> String {
        String(localized: "game2.guide.moment.trophy.means", defaultValue: "\(title) rejoint ta vitrine. Un trophée ne rapporte rien : il se garde et se montre.", bundle: .main)
    }

    static var guideMomentTrophyNext: String { String(localized: "game2.guide.moment.trophy.next", defaultValue: "Range-la à ta façon, et choisis qui la voit.", bundle: .main) }

    static func guideMomentTrophyShort(title: String) -> String {
        String(localized: "game2.guide.moment.trophy.short", defaultValue: "Nouveau trophée : \(title).", bundle: .main)
    }

    static func guideMomentPrestigeWhat(number: String) -> String {
        String(localized: "game2.guide.moment.prestige.what", defaultValue: "Prestige \(number) !", bundle: .main)
    }

    static func guideMomentPrestigeMeans(glory: String) -> String {
        String(localized: "game2.guide.moment.prestige.means", defaultValue: "Une étoile sur ton anneau, un trophée numéroté et \(glory) de Gloire. Ton rang ne baisse jamais.", bundle: .main)
    }

    static var guideMomentPrestigeNext: String { String(localized: "game2.guide.moment.prestige.next", defaultValue: "Ton niveau repart à 1 : une nouvelle boucle commence.", bundle: .main) }

    static func guideMomentPrestigeShort(number: String) -> String {
        String(localized: "game2.guide.moment.prestige.short", defaultValue: "Prestige \(number).", bundle: .main)
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

    static var photoKickerLeagueUp: String { String(localized: "game2.photo.kicker.league_up", defaultValue: "Montée de ligue", bundle: .main) }

    static var photoKickerSeason: String { String(localized: "game2.photo.kicker.season", defaultValue: "Saison terminée", bundle: .main) }

    static var photoKickerPrestige: String { String(localized: "game2.photo.kicker.prestige", defaultValue: "Nouveau Prestige", bundle: .main) }

    static func photoTitleLeagueUp(league: String) -> String {
        String(localized: "game2.photo.title.league_up", defaultValue: "Ligue \(league)", bundle: .main)
    }

}
