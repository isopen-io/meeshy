import Foundation

// MARK: - Ce que l'écran d'une saison passée ou d'une semaine passée dit (#10018, suite de `GameText`)
//
// Miroir des clés `game.archive.*` du catalogue web du jeu (`apps/web/src/lib/interface-catalogs/catalog-game-<l>.ts`).

extension GameText {

    // MARK: La saison passée — mon palmarès

    static func archiveSeasonPastTitle(number: String) -> String {
        String(localized: "game2.archive.season.past_title", defaultValue: "Saison \(number) · terminée", bundle: .main)
    }

    static func archiveSeasonDates(start: String, end: String) -> String {
        String(localized: "game2.archive.season.dates", defaultValue: "Du \(start) au \(end)", bundle: .main)
    }

    static func archiveSeasonRewards(count: Int) -> String {
        let number = GameCopy.formatCount(count)
        return GameCopy.isSingular(count)
            ? String(localized: "game2.archive.season.rewards.one", defaultValue: "\(number) récompense réclamée", bundle: .main)
            : String(localized: "game2.archive.season.rewards.other", defaultValue: "\(number) récompenses réclamées", bundle: .main)
    }

    static var archiveSeasonCupWon: String {
        String(localized: "game2.archive.season.cup_won", defaultValue: "Parcours terminé : la coupe de saison est à toi.", bundle: .main)
    }

    static var archiveSeasonCupMissed: String {
        String(localized: "game2.archive.season.cup_missed", defaultValue: "Parcours non terminé : la coupe de saison n’a pas été gagnée.", bundle: .main)
    }

    static var archiveSeasonSealOwned: String {
        String(localized: "game2.archive.season.seal_owned", defaultValue: "Sceau de la saison obtenu.", bundle: .main)
    }

    static var archiveSeasonNotPlayed: String {
        String(localized: "game2.archive.season.not_played", defaultValue: "Tu n’as pas joué cette saison.", bundle: .main)
    }

    // MARK: La semaine passée — mon résultat gravé

    static func archiveWeekRank(rank: String) -> String {
        String(localized: "game2.archive.week.rank", defaultValue: "Rang final : \(rank)", bundle: .main)
    }

    static func archiveWeekPoints(points: String) -> String {
        String(localized: "game2.archive.week.points", defaultValue: "Total de la semaine : \(points)", bundle: .main)
    }

    static var archiveWeekNoCup: String {
        String(localized: "game2.archive.week.no_cup", defaultValue: "Pas de coupe cette semaine-là.", bundle: .main)
    }

    static var archiveWeekUnsettled: String {
        String(localized: "game2.archive.week.unsettled", defaultValue: "Le résultat se grave à la clôture de la semaine.", bundle: .main)
    }

    static var archiveWeekNotPlaced: String {
        String(localized: "game2.archive.week.not_placed", defaultValue: "Tu n’avais pas de place en ligue cette semaine-là.", bundle: .main)
    }

    static var archiveWeekPurged: String {
        String(localized: "game2.archive.week.purged", defaultValue: "Cette semaine est trop ancienne : son résultat a été effacé, comme prévu.", bundle: .main)
    }

    static var archiveWeekUpcoming: String {
        String(localized: "game2.archive.week.upcoming", defaultValue: "Cette semaine n’a pas encore commencé.", bundle: .main)
    }

    static var archiveWeekPrivacy: String {
        String(localized: "game2.archive.week.privacy", defaultValue: "Seul ton résultat est gardé : les autres membres du groupe ne se relisent pas.", bundle: .main)
    }
}
