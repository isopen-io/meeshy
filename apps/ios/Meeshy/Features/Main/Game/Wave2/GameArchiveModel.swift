import SwiftUI
import MeeshySDK

// MARK: - Ce qu'un lien du Jeu ouvre : la lecture d'une saison n et d'une semaine de ligue (#10018)

extension GameWave2CacheName {
    static func seasonArchive(_ number: Int) -> String { "season-archive-\(number)" }
    static func leagueWeekArchive(_ weekKey: String) -> String { "league-week-archive-\(weekKey)" }
}

/// LES ARCHIVES DU JEU (#10018) — `GET /me/game/seasons/:number` et `GET /me/game/league/weeks/:weekKey`, lues
/// CACHE-FIRST : la copie disque (par compte, par saison, par semaine) s'affiche d'abord, le réseau la remplace en
/// silence. Hors ligne, la copie reste — l'échec ne prime jamais sur une valeur déjà là. Une saison ne se montre
/// jamais sous le lien d'une autre : changer de numéro repart de SA copie, ou de rien.
@MainActor
final class GameArchiveModel: ObservableObject {
    // iOS 26.1 : la deinit synthétisée serait ISOLÉE (SE-0466) et double-libère au démontage.
    nonisolated deinit {}

    @Published private(set) var season = GameLoad<GameSeasonArchive>()
    @Published private(set) var week = GameLoad<GameLeagueWeekArchive>()

    private let service: GameArchiveServiceProviding
    private let cache: GameWave2Caching

    init(
        service: GameArchiveServiceProviding = GameService.shared,
        cache: GameWave2Caching? = nil,
        currentUserId: String = AuthManager.shared.currentUser?.id ?? ""
    ) {
        self.service = service
        self.cache = cache ?? GameWave2DiskCache(userId: currentUserId)
    }

    func loadSeason(number: Int) async {
        let name = GameWave2CacheName.seasonArchive(number)
        if season.value?.number != number {
            season = GameLoad(value: await cache.load(GameSeasonArchive.self, name: name))
        }
        season.isLoading = true
        season.errorMessage = nil
        do {
            let fresh = try await service.fetchSeasonArchive(number: number)
            season.value = fresh
            await cache.save(fresh, name: name)
        } catch {
            season.errorMessage = GameCopy.errorMessage(for: error)
        }
        season.isLoading = false
    }

    func loadWeek(key: String) async {
        let name = GameWave2CacheName.leagueWeekArchive(key)
        if week.value?.weekKey != key {
            week = GameLoad(value: await cache.load(GameLeagueWeekArchive.self, name: name))
        }
        week.isLoading = true
        week.errorMessage = nil
        do {
            let fresh = try await service.fetchLeagueWeekArchive(weekKey: key)
            week.value = fresh
            await cache.save(fresh, name: name)
        } catch {
            week.errorMessage = GameCopy.errorMessage(for: error)
        }
        week.isLoading = false
    }
}

// MARK: - L'écran que la page Saison montre

/// La page Saison sous un lien : l'écran d'avant pour la saison EN COURS (ou sans lien), l'attente d'une saison
/// FUTURE (thème, date d'ouverture), le palmarès d'une saison PASSÉE. La saison à venir que le bloc `game` porte
/// déjà se peint sans attendre le réseau ; un cache froid hors ligne le dit, jamais un écran vide.
enum GameSeasonShown: Equatable {
    case current
    case upcoming(GameUpcomingSeasonBlock)
    case past(GameSeasonArchive)
    case skeleton
    case failed(String)

    /// Le bloc `game` ne suffit pas à peindre cette saison : il faut la lire.
    static func needsArchive(focus: Int?, game: GameBlock) -> Bool {
        guard let focus else { return false }
        return game.season?.number != focus && game.seasonUpcoming?.number != focus
    }

    static func of(focus: Int?, game: GameBlock, load: GameLoad<GameSeasonArchive>) -> GameSeasonShown {
        guard let focus else { return .current }
        if let archive = load.value, archive.number == focus {
            switch archive.status {
            case .current: return .current
            case .past: return .past(archive)
            case .upcoming:
                return .upcoming(GameUpcomingSeasonBlock(number: archive.number, themeKey: archive.themeKey,
                                                         startDay: archive.startDay, endDay: archive.endDay))
            }
        }
        if game.season?.number == focus { return .current }
        if let upcoming = game.seasonUpcoming, upcoming.number == focus { return .upcoming(upcoming) }
        if let message = load.errorMessage, !load.isLoading { return .failed(message) }
        return .skeleton
    }
}

// MARK: - L'écran que la page Ligue montre

/// La page Ligue sous un lien : l'écran d'avant pour la semaine EN COURS (ou sans lien), mon résultat gravé
/// d'une semaine passée — ou sa purge, ou l'absence de place, ou une semaine pas encore commencée.
enum GameLeagueShown: Equatable {
    case current
    case week(GameLeagueWeekArchive)
    case skeleton
    case failed(String)

    static func needsArchive(focus: String?, game: GameBlock) -> Bool {
        guard let focus else { return false }
        return game.league?.weekKey != focus
    }

    static func of(focus: String?, game: GameBlock, load: GameLoad<GameLeagueWeekArchive>) -> GameLeagueShown {
        guard let focus else { return .current }
        if let archive = load.value, archive.weekKey == focus {
            return archive.status == .current ? .current : .week(archive)
        }
        if game.league?.weekKey == focus { return .current }
        if let message = load.errorMessage, !load.isLoading { return .failed(message) }
        return .skeleton
    }
}

extension GamePageFocus {
    var seasonNumber: Int? {
        if case .season(let number) = self { return number }
        return nil
    }

    var leagueWeekKey: String? {
        if case .leagueWeek(let key) = self { return key }
        return nil
    }
}
