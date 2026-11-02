import Foundation

/// UN LIEN DU JEU (#9947) — une saison ou une semaine de ligue, passée, en cours ou future :
///
///     https://meeshy.me/me/progression/saison/{n}        meeshy://me/progression/saison/{n}
///     https://meeshy.me/me/progression/ligue/{lundi}     meeshy://me/progression/ligue/{lundi}
///
/// Miroir de `packages/shared/utils/game/game-links.ts` (mêmes chemins, mêmes gardes de paramètre). La forme
/// nue — et un paramètre invalide — ouvre la saison ou la semaine EN COURS : le lien d'une carte d'événement
/// in-app ne mène jamais à Safari ni à un écran vide. Le lien ne juge pas : passé, en cours ou futur se lit
/// à l'ouverture (`GET /me/game/seasons/:number`, `GET /me/game/league/weeks/:weekKey`).
enum GameLink: Hashable {
    case season(number: Int?)
    case leagueWeek(key: String?)
}

/// La saison ou la semaine sur laquelle une page du Jeu s'ouvre (`Route.gamePage(_, focus:)`) ; `nil` : l'en cours.
enum GamePageFocus: Hashable {
    case season(number: Int)
    case leagueWeek(key: String)
}

enum GameLinkParser {

    static let maxSeason = 9999

    /// Le lien du Jeu de segments d'adresse (`["me", "progression", "saison", "3"]`), `nil` hors du Jeu.
    static func link(from components: [String]) -> GameLink? {
        guard components.count >= 3, components[0] == "me", components[1] == "progression" else { return nil }
        let param = components.count == 4 ? components[3] : nil
        switch components[2] {
        case "saison": return .season(number: param.flatMap(seasonNumber))
        case "ligue": return .leagueWeek(key: param.flatMap { isLeagueWeekKey($0) ? $0 : nil })
        default: return nil
        }
    }

    /// `1` à `9999`, sans signe, décimale ni zéro de tête.
    static func seasonNumber(_ raw: String) -> Int? {
        guard raw.range(of: #"^[1-9][0-9]{0,3}$"#, options: .regularExpression) != nil,
              let number = Int(raw), number <= maxSeason else { return nil }
        return number
    }

    /// Un jour réel `AAAA-MM-JJ` qui est un lundi : la clé d'une semaine de ligue (`leagueWeekKey`).
    static func isLeagueWeekKey(_ raw: String) -> Bool {
        guard raw.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"#, options: .regularExpression) != nil,
              let date = dayFormatter.date(from: raw), dayFormatter.string(from: date) == raw else { return false }
        return utcCalendar.component(.weekday, from: date) == 2
    }

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        return calendar
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = utcCalendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = utcCalendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }()
}

extension GameNavigationMap {
    /// L'écran qu'un lien du Jeu ouvre : la page Saison ou Ligue, sur la saison ou la semaine nommée. Posée par
    /// `Router.openGame(at:)` au-dessus de Progression et de la fiche — « retour » remonte la chaîne.
    static func entry(for link: GameLink) -> Route {
        switch link {
        case .season(let number): .gamePage(.season, focus: number.map { .season(number: $0) })
        case .leagueWeek(let key): .gamePage(.league, focus: key.map { .leagueWeek(key: $0) })
        }
    }
}
