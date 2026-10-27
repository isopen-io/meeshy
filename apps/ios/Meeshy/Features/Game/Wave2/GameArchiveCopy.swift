import Foundation

// MARK: - Ce que l'écran d'une saison passée ou d'une semaine passée dit (#10018, suite de `GameText`)
//
// Miroir des clés `game.archive.*` du catalogue web du jeu (`apps/web/src/lib/interface-catalogs/catalog-game-<l>.ts`).

extension GameText {

    // MARK: La saison passée — mon palmarès

    static func archiveSeasonPastTitle(number: String) -> String {
        String(localized: "game2.archive.season.past_title", defaultValue: "Voyage \(number) · terminé", bundle: .main)
    }

    /// Une saison ouverte que le bloc gardé ne porte pas encore (#10131).
    static func archiveSeasonCurrentTitle(number: String) -> String {
        String(localized: "game2.archive.season.current_title", defaultValue: "Voyage \(number) · en cours", bundle: .main)
    }

    static var archiveSeasonOpenedNote: String {
        String(localized: "game2.archive.season.opened_note",
               defaultValue: "Le voyage est en cours : ton chemin s’affiche dès qu’il est relu.", bundle: .main)
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
        String(localized: "game2.archive.season.cup_won", defaultValue: "Voyage accompli : la coupe du voyage est à toi.", bundle: .main)
    }

    static var archiveSeasonCupMissed: String {
        String(localized: "game2.archive.season.cup_missed", defaultValue: "Voyage inachevé : la coupe du voyage n’a pas été gagnée.", bundle: .main)
    }

    static var archiveSeasonSealOwned: String {
        String(localized: "game2.archive.season.seal_owned", defaultValue: "Sceau du voyage obtenu.", bundle: .main)
    }

    static var archiveSeasonNotPlayed: String {
        String(localized: "game2.archive.season.not_played", defaultValue: "Tu n’as pas fait ce voyage.", bundle: .main)
    }

    // MARK: La semaine passée — mon résultat gravé

    static func archiveWeekRank(rank: String) -> String {
        String(localized: "game2.archive.week.rank", defaultValue: "Place finale : \(rank)", bundle: .main)
    }

    static func archiveWeekPoints(points: String) -> String {
        String(localized: "game2.archive.week.points", defaultValue: "Étincelles de la semaine : \(points)", bundle: .main)
    }

    static var archiveWeekNoCup: String {
        String(localized: "game2.archive.week.no_cup", defaultValue: "Pas de coupe cette semaine-là.", bundle: .main)
    }

    static var archiveWeekUnsettled: String {
        String(localized: "game2.archive.week.unsettled", defaultValue: "Le résultat se grave à la clôture de la semaine.", bundle: .main)
    }

    static var archiveWeekNotPlaced: String {
        String(localized: "game2.archive.week.not_placed", defaultValue: "Tu n’avais pas de place en joute cette semaine-là.", bundle: .main)
    }

    static var archiveWeekPurged: String {
        String(localized: "game2.archive.week.purged", defaultValue: "Cette semaine est trop ancienne : son résultat a été effacé, comme prévu.", bundle: .main)
    }

    static var archiveWeekUpcoming: String {
        String(localized: "game2.archive.week.upcoming", defaultValue: "Cette semaine n’a pas encore commencé.", bundle: .main)
    }

    static var archiveWeekPrivacy: String {
        String(localized: "game2.archive.week.privacy", defaultValue: "Seul ton résultat est gardé : les autres héros de la joute ne se relisent pas.", bundle: .main)
    }
}
