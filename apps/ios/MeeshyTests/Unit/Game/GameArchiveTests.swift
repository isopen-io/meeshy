import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// Ce qu'un lien du Jeu ouvre (#10018) : une saison passée, en cours ou future, une semaine de ligue passée ou
/// purgée. La lecture est CACHE-FIRST (le disque d'abord, le réseau en silence) et tient HORS LIGNE ; l'écran
/// choisi se décide par une règle pure, et ce qu'il rend se lit dans l'arbre d'accessibilité.
@MainActor
final class GameArchiveTests: XCTestCase {

    private actor MemoryCache: GameWave2Caching {
        private var store: [String: Data] = [:]
        func load<T: Decodable & Sendable>(_ type: T.Type, name: String) async -> T? {
            store[name].flatMap { try? JSONDecoder().decode(T.self, from: $0) }
        }
        func save<T: Encodable & Sendable>(_ value: T, name: String) async { store[name] = try? JSONEncoder().encode(value) }
        func remove(name: String) async { store[name] = nil }
    }

    private var ecran: RenderedScreen?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    private func makeSUT() -> (sut: GameArchiveModel, service: MockGameArchiveService, cache: MemoryCache) {
        let service = MockGameArchiveService()
        let cache = MemoryCache()
        return (GameArchiveModel(service: service, cache: cache), service, cache)
    }

    private static let weekKeys = ["2027-02-15", "2027-02-22", "2027-03-01", "2027-03-08", "2027-03-15", "2027-03-22", "2027-03-29", "2027-04-05"]

    private func season(
        number: Int = 2, status: GameArchiveStatus = .past, progress: GameSeasonProgressArchive? = nil
    ) -> GameSeasonArchive {
        GameSeasonArchive(number: number, status: status, themeKey: "language:es", startDay: "2027-02-15", endDay: "2027-04-11",
                          weekKeys: Self.weekKeys, progress: progress)
    }

    private func played(completed: Bool = true, sealOwned: Bool = true) -> GameSeasonProgressArchive {
        GameSeasonProgressArchive(stars: completed ? 160 : 34, steps: completed ? 40 : 8, claimedSteps: [1, 2, 3],
                                  sealOwned: sealOwned, completed: completed, settled: true)
    }

    private func week(
        key: String = "2026-10-12", status: GameArchiveStatus = .past, retention: GameArchiveRetention = .kept,
        result: GameLeagueWeekResult? = GameLeagueWeekResult(league: .jade, finalRank: 3, finalPoints: 410, zone: .promotion, cup: .bronze, settled: true)
    ) -> GameLeagueWeekArchive {
        GameLeagueWeekArchive(weekKey: key, status: status, season: nil, retention: retention, result: result)
    }

    @discardableResult
    private func monter(_ vue: some View) -> RenderedScreen {
        let e = RenderedScreen(vue, size: CGSize(width: 402, height: 3200))
        ecran = e
        return e
    }

    // MARK: - La lecture : cache-first, hors ligne

    func test_loadSeason_servesTheNetwork_andKeepsItForOffline() async {
        let (sut, service, cache) = makeSUT()
        service.seasonResult = .success(season(progress: played()))

        await sut.loadSeason(number: 2)

        XCTAssertEqual(sut.season.value?.number, 2)
        XCTAssertNil(sut.season.errorMessage)
        let kept = await cache.load(GameSeasonArchive.self, name: GameWave2CacheName.seasonArchive(2))
        XCTAssertEqual(kept, season(progress: played()))
    }

    func test_loadSeason_offline_servesTheDiskCopy_withoutAnError() async {
        let (sut, service, cache) = makeSUT()
        await cache.save(season(progress: played()), name: GameWave2CacheName.seasonArchive(2))

        await sut.loadSeason(number: 2)

        XCTAssertEqual(service.seasonCalls, [2])
        XCTAssertEqual(sut.season.value, season(progress: played()), "hors ligne, la copie disque reste à l'écran")
        XCTAssertFalse(sut.season.failedWithoutValue, "l'échec ne prime jamais sur une valeur déjà là")
    }

    func test_loadSeason_offline_withAnEmptyCache_saysItFailed() async {
        let (sut, _, _) = makeSUT()

        await sut.loadSeason(number: 2)

        XCTAssertNil(sut.season.value)
        XCTAssertTrue(sut.season.failedWithoutValue)
    }

    func test_loadSeason_anotherNumber_neverShowsThePreviousSeason() async {
        let (sut, service, _) = makeSUT()
        service.seasonResult = .success(season(number: 2))
        await sut.loadSeason(number: 2)
        service.seasonResult = .failure(URLError(.notConnectedToInternet))

        await sut.loadSeason(number: 3)

        XCTAssertNil(sut.season.value, "la saison 2 ne se montre pas sous le lien de la saison 3")
    }

    func test_loadWeek_offline_servesTheDiskCopy() async {
        let (sut, service, cache) = makeSUT()
        await cache.save(week(), name: GameWave2CacheName.leagueWeekArchive("2026-10-12"))

        await sut.loadWeek(key: "2026-10-12")

        XCTAssertEqual(service.weekCalls, ["2026-10-12"])
        XCTAssertEqual(sut.week.value, week())
    }

    // MARK: - L'écran choisi : passée, en cours, future

    func test_season_withoutFocus_isTheCurrentScreen() {
        let shown = GameSeasonShown.of(focus: nil, game: GameWave2Fixture.game(), load: GameLoad())
        XCTAssertEqual(shown, .current)
        XCTAssertFalse(GameSeasonShown.needsArchive(focus: nil, game: GameWave2Fixture.game()))
    }

    func test_season_focusedOnTheCurrentSeason_isTheCurrentScreen_withoutAnyRead() {
        let game = GameWave2Fixture.game()
        XCTAssertEqual(GameSeasonShown.of(focus: 1, game: game, load: GameLoad()), .current)
        XCTAssertFalse(GameSeasonShown.needsArchive(focus: 1, game: game))
    }

    func test_season_focusedOnTheUpcomingSeason_isPaintedFromTheBlock_beforeAnyRead() {
        let game = GameWave2Fixture.game(season: nil, seasonUpcoming: GameWave2Fixture.upcoming)
        XCTAssertEqual(GameSeasonShown.of(focus: 1, game: game, load: GameLoad(isLoading: true)), .upcoming(GameWave2Fixture.upcoming))
        XCTAssertFalse(GameSeasonShown.needsArchive(focus: 1, game: game))
    }

    func test_season_focusedOnAPastSeason_showsItsRecord() {
        let archive = season(progress: played())
        XCTAssertEqual(GameSeasonShown.of(focus: 2, game: GameWave2Fixture.game(), load: GameLoad(value: archive)), .past(archive))
        XCTAssertTrue(GameSeasonShown.needsArchive(focus: 2, game: GameWave2Fixture.game()))
    }

    func test_season_focusedOnAFutureSeason_showsItsThemeAndDate() {
        let archive = season(number: 3, status: .upcoming)
        let shown = GameSeasonShown.of(focus: 3, game: GameWave2Fixture.game(), load: GameLoad(value: archive))
        XCTAssertEqual(shown, .upcoming(GameUpcomingSeasonBlock(number: 3, themeKey: "language:es", startDay: "2027-02-15", endDay: "2027-04-11")))
    }

    func test_season_servedAsCurrent_isTheCurrentScreen() {
        let shown = GameSeasonShown.of(focus: 2, game: GameWave2Fixture.game(), load: GameLoad(value: season(status: .current)))
        XCTAssertEqual(shown, .current)
    }

    func test_season_coldAndOffline_saysItFailed_neverAnEmptyScreen() {
        let shown = GameSeasonShown.of(focus: 2, game: GameWave2Fixture.game(), load: GameLoad(errorMessage: "hors ligne"))
        XCTAssertEqual(shown, .failed("hors ligne"))
        XCTAssertEqual(GameSeasonShown.of(focus: 2, game: GameWave2Fixture.game(), load: GameLoad()), .skeleton)
    }

    func test_league_focusedOnThisWeek_isTheCurrentScreen_withoutAnyRead() {
        let game = GameWave2Fixture.game()
        XCTAssertEqual(GameLeagueShown.of(focus: "2026-10-12", game: game, load: GameLoad()), .current)
        XCTAssertFalse(GameLeagueShown.needsArchive(focus: "2026-10-12", game: game))
        XCTAssertEqual(GameLeagueShown.of(focus: nil, game: game, load: GameLoad()), .current)
    }

    func test_league_focusedOnAPastWeek_showsItsResult() {
        let archive = week(key: "2026-10-05")
        let game = GameWave2Fixture.game()
        XCTAssertTrue(GameLeagueShown.needsArchive(focus: "2026-10-05", game: game))
        XCTAssertEqual(GameLeagueShown.of(focus: "2026-10-05", game: game, load: GameLoad(value: archive)), .week(archive))
        XCTAssertEqual(GameLeagueShown.of(focus: "2026-10-05", game: game, load: GameLoad(value: week(key: "2026-10-05", status: .current))), .current)
    }

    // MARK: - Ce que l'écran rend

    func test_aPastSeason_rendersMyRecord_stepsCupAndSeal() {
        let e = monter(GameSeasonArchiveView(shown: .past(season(progress: played())), retry: {}))
        XCTAssertTrue(e.identifiers.contains("game.season.archive"), "vus : \(e.identifiers)")
        XCTAssertTrue(e.says(GameText.archiveSeasonPastTitle(number: GameCopy.formatCount(2))))
        XCTAssertTrue(e.says(GameText.archiveSeasonCupWon))
        XCTAssertTrue(e.says(GameText.archiveSeasonSealOwned))
        XCTAssertTrue(e.says(GameText.archiveSeasonRewards(count: 3)))
    }

    func test_aPastSeasonNotFinished_saysTheCupWasNotWon() {
        let e = monter(GameSeasonArchiveView(shown: .past(season(progress: played(completed: false, sealOwned: false))), retry: {}))
        XCTAssertTrue(e.says(GameText.archiveSeasonCupMissed))
        XCTAssertFalse(e.says(GameText.archiveSeasonSealOwned))
    }

    func test_aPastSeasonNotPlayed_saysSo() {
        let e = monter(GameSeasonArchiveView(shown: .past(season()), retry: {}))
        XCTAssertTrue(e.says(GameText.archiveSeasonNotPlayed))
    }

    func test_aFutureSeason_rendersItsThemeAndOpeningDate() {
        let upcoming = GameUpcomingSeasonBlock(number: 3, themeKey: "language:es", startDay: "2027-02-15", endDay: "2027-04-11")
        let e = monter(GameSeasonArchiveView(shown: .upcoming(upcoming), retry: {}))
        XCTAssertTrue(e.identifiers.contains("game.season.upcoming"), "vus : \(e.identifiers)")
        XCTAssertTrue(e.says(GameSeasonUpcoming.line(upcoming)))
    }

    func test_aColdOfflineSeason_offersToRetry() {
        let e = monter(GameSeasonArchiveView(shown: .failed("hors ligne"), retry: {}))
        XCTAssertTrue(e.identifiers.contains("game.retry"), "vus : \(e.identifiers)")
    }

    func test_aPastWeek_rendersLeagueRankZoneAndCup() {
        let e = monter(GameLeagueWeekArchiveCard(archive: week()))
        XCTAssertTrue(e.identifiers.contains("game.league.archive"), "vus : \(e.identifiers)")
        XCTAssertTrue(e.says(GameText.leagueName(.jade)))
        XCTAssertTrue(e.says(GameText.archiveWeekRank(rank: GameCopy.formatCount(3))))
        XCTAssertTrue(e.says(GameText.zoneLabel(.promotion)))
        XCTAssertTrue(e.says(GameText.cupName(.bronze)))
    }

    func test_aPurgedWeek_saysItWasErased() {
        let e = monter(GameLeagueWeekArchiveCard(archive: week(retention: .purged, result: nil)))
        XCTAssertTrue(e.says(GameText.archiveWeekPurged))
    }

    func test_aWeekWithoutPlace_saysSo_andAFutureWeekSaysItHasNotBegun() {
        XCTAssertTrue(monter(GameLeagueWeekArchiveCard(archive: week(result: nil))).says(GameText.archiveWeekNotPlaced))
        ecran?.dismount()
        XCTAssertTrue(monter(GameLeagueWeekArchiveCard(archive: week(key: "2026-11-30", status: .upcoming, result: nil))).says(GameText.archiveWeekUpcoming))
    }

    func test_aPastWeek_showsNobodyElse() {
        let e = monter(GameLeagueWeekArchiveCard(archive: week()))
        XCTAssertFalse(e.identifiers.contains("game.league.standings"), "aucun classement, aucune ligne d’un autre membre")
        XCTAssertTrue(e.says(GameText.archiveWeekPrivacy))
    }
}
