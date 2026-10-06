import Foundation

// MARK: - Ce que la vague 2 du jeu dit (#9384 à #9392, #9481)
//
// MIROIR des clés `game.*` de la vague 2 du catalogue du web
// (`apps/web/src/lib/interface-catalogs/catalog-game-<langue>.ts`) : la MÊME phrase, dans
// les sept langues, sur les deux plateformes (une demande porteur n'est jamais un écart de
// plateforme). Les clés iOS portent le préfixe `game2.` : elles ne se confondent avec aucune
// clé du premier lot (`GameCopy`). Chaque accesseur est une CLÉ LITTÉRALE (`String(localized:)`),
// que l'extraction du catalogue et la garde `GameWave2CopyTests` savent lire ; les valeurs
// des sept langues vivent dans `Localizable.xcstrings`, avec des marques positionnelles
// (`%1$@`, `%2$@`) : un ordre de mots qui change d'une langue à l'autre ne casse rien.
//
// Les nombres arrivent DÉJÀ formatés par la locale (`GameCopy.formatCount`) — l'accord se
// choisit sur l'entier (`GameCopy.isSingular`), jamais sur un `== 1` isolé.
enum GameText {}

/// LA CATÉGORIE ORDINALE d'un nombre dans une langue — ce que `Intl.PluralRules(type: 'ordinal')` donne au web
/// (`translateGameOrdinal`). Seuls le français (`one` : « 1re ») et l'anglais (`one`, `two`, `few`, `other`) en
/// distinguent plusieurs parmi les sept langues du jeu ; les cinq autres n'ont qu'une forme.
enum GameOrdinal: Equatable {
    case one, two, few, other

    static func category(of count: Int, languageCode: String?) -> GameOrdinal {
        switch languageCode {
        case "fr":
            return count == 1 ? .one : .other
        case "en":
            let teens = count % 100
            if (11...13).contains(teens) { return .other }
            switch count % 10 {
            case 1: return .one
            case 2: return .two
            case 3: return .few
            default: return .other
            }
        default:
            return .other
        }
    }
}

extension GameText {
    static func bannerLevel(level: String) -> String {
        String(localized: "game2.banner.level", defaultValue: "Niveau \(level)", bundle: .main)
    }

    static func bannerToNext(percent: String, level: String) -> String {
        String(localized: "game2.banner.to_next", defaultValue: "\(percent) % vers le \(level)", bundle: .main)
    }

    static var bannerTop: String { String(localized: "game2.banner.top", defaultValue: "au sommet", bundle: .main) }

    static func bannerLeague(league: String, place: String) -> String {
        String(localized: "game2.banner.league", defaultValue: "ligue \(league) \(place)", bundle: .main)
    }

    static func bannerFlame(days: String) -> String {
        String(localized: "game2.banner.flame", defaultValue: "Flamme \(days)", bundle: .main)
    }

    /// « 4e », « 4th », « 4. » — la place dans le groupe de ligue. La forme suit la catégorie ORDINALE de la langue
    /// (`GameOrdinal`) : l'anglais lit « 1st », « 2nd », « 3rd » puis « 4th » ; le français « 1re » puis « 2e ».
    static func bannerPlace(count: Int, languageCode: String? = Locale.current.language.languageCode?.identifier) -> String {
        let number = GameCopy.formatCount(count)
        switch GameOrdinal.category(of: count, languageCode: languageCode) {
        case .one: return String(localized: "game2.banner.place.one", defaultValue: "\(number)re", bundle: .main)
        case .two: return String(localized: "game2.banner.place.two", defaultValue: "\(number)e", bundle: .main)
        case .few: return String(localized: "game2.banner.place.few", defaultValue: "\(number)e", bundle: .main)
        case .other: return String(localized: "game2.banner.place.other", defaultValue: "\(number)e", bundle: .main)
        }
    }

    /// Ce que VoiceOver ajoute à la bannière du joueur : où mène son toucher.
    static var bannerHint: String { String(localized: "game2.banner.hint", defaultValue: "Ouvre ta progression", bundle: .main) }

    static func bannerPoints(points: String) -> String {
        String(localized: "game2.banner.points", defaultValue: "\(points) pts", bundle: .main)
    }

    static func bannerMissing(points: String) -> String {
        String(localized: "game2.banner.missing", defaultValue: "encore \(points)", bundle: .main)
    }

    static var bannerSeparator: String { String(localized: "game2.banner.separator", defaultValue: ", ", bundle: .main) }

    static func durationDaysHours(days: String, hours: String) -> String {
        String(localized: "game2.duration.days_hours", defaultValue: "\(days) j \(hours) h", bundle: .main)
    }

    static func durationHours(hours: String) -> String {
        String(localized: "game2.duration.hours", defaultValue: "\(hours) h", bundle: .main)
    }

    static func durationMinutes(minutes: String) -> String {
        String(localized: "game2.duration.minutes", defaultValue: "\(minutes) min", bundle: .main)
    }

    static var visibilityEveryone: String { String(localized: "game2.visibility.everyone", defaultValue: "Tout le monde", bundle: .main) }

    static var visibilityFriends: String { String(localized: "game2.visibility.friends", defaultValue: "Mes amis", bundle: .main) }

    static var visibilityMe: String { String(localized: "game2.visibility.me", defaultValue: "Moi seul", bundle: .main) }

    static var doorLeague: String { String(localized: "game2.door.league", defaultValue: "Ligue", bundle: .main) }

    static func doorLeagueLocked(level: String) -> String {
        String(localized: "game2.door.league.locked", defaultValue: "Dès le niveau \(level)", bundle: .main)
    }

    static func doorLeagueRank(league: String, rank: String, size: String) -> String {
        String(localized: "game2.door.league.rank", defaultValue: "\(league) · rang \(rank) sur \(size)", bundle: .main)
    }

    static var doorLeagueOpen: String { String(localized: "game2.door.league.open", defaultValue: "Classement de la semaine", bundle: .main) }

    static func doorSeason(number: String) -> String {
        String(localized: "game2.door.season", defaultValue: "Saison \(number)", bundle: .main)
    }

    static func doorSeasonSteps(steps: String, total: String) -> String {
        String(localized: "game2.door.season.steps", defaultValue: "Étape \(steps) sur \(total)", bundle: .main)
    }

    static var doorSeasonNone: String { String(localized: "game2.door.season.none", defaultValue: "Aucune saison ouverte pour le moment", bundle: .main) }

    static var doorShowcase: String { String(localized: "game2.door.showcase", defaultValue: "Vitrine de trophées", bundle: .main) }

    static func doorShowcaseCount(count: Int) -> String {
        let number = GameCopy.formatCount(count)
        return GameCopy.isSingular(count)
            ? String(localized: "game2.door.showcase.count.one", defaultValue: "\(number) trophée", bundle: .main)
            : String(localized: "game2.door.showcase.count.other", defaultValue: "\(number) trophées", bundle: .main)
    }

    static var doorShowcaseEmpty: String { String(localized: "game2.door.showcase.empty", defaultValue: "Pas encore de trophée", bundle: .main) }

    static var doorAtlas: String { String(localized: "game2.door.atlas", defaultValue: "Atlas des langues", bundle: .main) }

    static func doorAtlasCount(stamped: String, total: String) -> String {
        String(localized: "game2.door.atlas.count", defaultValue: "\(stamped) langues sur \(total)", bundle: .main)
    }

    static var doorPrestige: String { String(localized: "game2.door.prestige", defaultValue: "Prestige", bundle: .main) }

    static var doorPrestigeReady: String { String(localized: "game2.door.prestige.ready", defaultValue: "Tu peux passer en Prestige", bundle: .main) }

    static func doorPrestigeStars(stars: String, max: String) -> String {
        String(localized: "game2.door.prestige.stars", defaultValue: "Étoiles : \(stars) sur \(max)", bundle: .main)
    }

    static var doorPrestigeLocked: String { String(localized: "game2.door.prestige.locked", defaultValue: "Au niveau 100", bundle: .main) }

    static var offlineAction: String { String(localized: "game2.offline.action", defaultValue: "Hors ligne : ce geste reprendra avec la connexion.", bundle: .main) }

    static var retry: String { String(localized: "game2.retry", defaultValue: "Réessayer", bundle: .main) }

    static var unavailable: String { String(localized: "game2.unavailable", defaultValue: "Cette partie du jeu n’est pas encore disponible sur ton serveur.", bundle: .main) }

    static var doorsLabel: String { String(localized: "game2.doors.label", defaultValue: "Le jeu", bundle: .main) }

    static var visibilityFieldShowcase: String { String(localized: "game2.visibility.field.showcase", defaultValue: "Vitrine de trophées", bundle: .main) }

    static var visibilityFieldRank: String { String(localized: "game2.visibility.field.rank", defaultValue: "Rang et niveau", bundle: .main) }

    static var visibilityFieldTreasury: String { String(localized: "game2.visibility.field.treasury", defaultValue: "Trésor et Flamme", bundle: .main) }

    static var visibilityFieldAtlas: String { String(localized: "game2.visibility.field.atlas", defaultValue: "Atlas des langues", bundle: .main) }

    static var visibilitySaving: String { String(localized: "game2.visibility.saving", defaultValue: "Enregistrement…", bundle: .main) }

    static var doorSettings: String { String(localized: "game2.door.settings", defaultValue: "Réglages du jeu", bundle: .main) }

}
