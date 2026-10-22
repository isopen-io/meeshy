import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// Ce qu'un lien du Jeu ouvre (#10018) : une saison passée, en cours ou future, une semaine de ligue passée ou
/// purgée. La lecture est CACHE-FIRST (le disque d'abord, le réseau en silence) et tient HORS LIGNE ; l'écran
/// choisi se décide par une règle pure, et ce qu'il rend se lit dans l'arbre d'accessibilité.
@MainActor
final class GameArchiveTests: XCTestCase {

    @MainActor
    private final class MemoryCache: GameWave2Caching {
        private var store: [String: Data] = [:]
        nonisolated deinit {}
        func load<T: Decodable & Sendable>(_ type: T.Type, name: String) async -> T? {
            store[name].flatMap { try? JSONDecoder().decode(T.self, from: $0) }
        }
        func save<T: Encodable & Sendable>(_ value: T, name: String) async { store[name] = try? JSONEncoder().encode(value) }
        func remove(name: String) async { store[name] = nil }
    }

    private var ecran: RenderedScreen?

    override func tearDown() async throws {
        ecran?.dismount()
        ecran = nil
        try await super.tearDown()
    }

    private func makeSUT(network: FakeNetworkMonitor = FakeNetworkMonitor()) -> (sut: GameArchiveModel, service: MockGameArchiveService, cache: MemoryCache) {
        let service = MockGameArchiveService()
        let cache = MemoryCache()
        return (GameArchiveModel(service: service, cache: cache, networkMonitor: network), service, cache)
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

    func test_season_servedAsCurrent_andCarriedByTheBlock_isTheCurrentScreen() {
        let shown = GameSeasonShown.of(focus: 1, game: GameWave2Fixture.game(), load: GameLoad(value: season(number: 1, status: .current)))
        XCTAssertEqual(shown, .current)
    }

    func test_season_servedAsCurrent_whileTheKeptBlockCarriesAnother_isOpened_neverAnotherSeasonsPath() {
        let shown = GameSeasonShown.of(focus: 2, game: GameWave2Fixture.game(), load: GameLoad(value: season(status: .current)),
                                       moment: LeagueMoment(dayKey: "2027-02-20", minuteOfDay: 600))
        XCTAssertEqual(shown, .opened(GameUpcomingSeasonBlock(number: 2, themeKey: "language:es", startDay: "2027-02-15", endDay: "2027-04-11")))
    }

    // MARK: - Le calendrier servi peint une saison future (#10232)

    private static let shiftedSchedule = SeasonSchedule.normalize(["revision": 2, "seasons": [
        ["number": 1, "startDay": "2026-12-21", "status": "scheduled", "themeKey": "language:fr", "stepPoints": 100, "copy": NSNull()],
        ["number": 2, "startDay": "2027-03-01", "status": "scheduled", "themeKey": "language:ja", "stepPoints": 150, "copy": NSNull()],
    ]])

    func test_aFutureSeasonOfTheServedCalendar_isPaintedWithItsShiftedDates_beforeAnyRead() {
        let shown = GameSeasonShown.of(focus: 3, game: GameWave2Fixture.game(), load: GameLoad(isLoading: true),
                                       moment: LeagueMoment(dayKey: "2027-01-05", minuteOfDay: 600), schedule: Self.shiftedSchedule)
        XCTAssertEqual(shown, .upcoming(GameUpcomingSeasonBlock(number: 3, themeKey: "language:ar", startDay: "2027-04-26", endDay: "2027-06-20")))
    }

    func test_aPausedSeasonOfTheServedCalendar_hasNoDateToPaint_andWaitsForItsRead() {
        let paused = SeasonSchedule.normalize(["revision": 2, "seasons": [
            ["number": 2, "startDay": "2027-02-15", "status": "paused", "themeKey": "language:es", "stepPoints": 100, "copy": NSNull()],
        ]])
        let shown = GameSeasonShown.of(focus: 2, game: GameWave2Fixture.game(), load: GameLoad(isLoading: true),
                                       moment: LeagueMoment(dayKey: "2027-01-05", minuteOfDay: 600), schedule: paused)
        XCTAssertEqual(shown, .skeleton)
    }

    func test_aServedArchive_winsOverTheCalendar() {
        let archive = season(number: 3, status: .upcoming)
        let shown = GameSeasonShown.of(focus: 3, game: GameWave2Fixture.game(), load: GameLoad(value: archive),
                                       moment: LeagueMoment(dayKey: "2027-01-05", minuteOfDay: 600), schedule: Self.shiftedSchedule)
        XCTAssertEqual(shown, .upcoming(GameUpcomingSeasonBlock(number: 3, themeKey: "language:es", startDay: "2027-02-15", endDay: "2027-04-11")))
    }

    // MARK: - Une saison « à venir » gardée hors ligne, le jour J (#10131)

    private static let eve = LeagueMoment(dayKey: "2027-02-14", minuteOfDay: 19 * 60 + 59)
    private static let opening = LeagueMoment(dayKey: "2027-02-15", minuteOfDay: 9 * 60)

    func test_aFutureCopyKeptOffline_isStillUpcoming_theEveBefore8pm() {
        let shown = GameSeasonShown.of(focus: 2, game: GameWave2Fixture.game(), load: GameLoad(value: season(status: .upcoming)), moment: Self.eve)
        XCTAssertEqual(shown, .upcoming(GameUpcomingSeasonBlock(number: 2, themeKey: "language:es", startDay: "2027-02-15", endDay: "2027-04-11")))
    }

    func test_aFutureCopyKeptOffline_turnsCurrentByItself_onItsOpeningDay() {
        let shown = GameSeasonShown.of(focus: 2, game: GameWave2Fixture.game(), load: GameLoad(value: season(status: .upcoming)), moment: Self.opening)
        XCTAssertEqual(shown, .opened(GameUpcomingSeasonBlock(number: 2, themeKey: "language:es", startDay: "2027-02-15", endDay: "2027-04-11")))
    }

    func test_theUpcomingSeasonOfTheKeptBlock_turnsOpenedToo_onItsOpeningDay() {
        let game = GameWave2Fixture.game(season: nil, seasonUpcoming: GameWave2Fixture.upcoming)
        let opening = LeagueMoment(dayKey: "2026-12-21", minuteOfDay: 600)
        XCTAssertEqual(GameSeasonShown.of(focus: 1, game: game, load: GameLoad(), moment: opening), .opened(GameWave2Fixture.upcoming))
        let e = monter(GameSeasonUpcoming(upcoming: GameWave2Fixture.upcoming, moment: opening))
        XCTAssertTrue(e.identifiers.contains("game.season.opened"), "vus : \(e.identifiers)")
        XCTAssertFalse(e.identifiers.contains("game.season.upcoming"))
    }

    func test_anOpenedSeason_saysItsNumberStateAndThatThePathComesBackWithTheNetwork() {
        let opened = GameUpcomingSeasonBlock(number: 2, themeKey: "language:es", startDay: "2027-02-15", endDay: "2027-04-11")
        let e = monter(GameSeasonArchiveView(shown: .opened(opened), retry: {}))
        XCTAssertTrue(e.identifiers.contains("game.season.opened"), "vus : \(e.identifiers)")
        XCTAssertTrue(e.says(GameText.archiveSeasonCurrentTitle(number: GameCopy.formatCount(2))))
        XCTAssertTrue(e.says(GameText.archiveSeasonOpenedNote))
    }

    func test_theSeasonIsReadAgain_whenTheNetworkComesBack() async {
        let network = FakeNetworkMonitor(isOnline: false)
        let (sut, service, cache) = makeSUT(network: network)
        await cache.save(season(status: .upcoming), name: GameWave2CacheName.seasonArchive(2))
        var blockReloads = 0
        sut.onReconnect = { blockReloads += 1 }
        await sut.loadSeason(number: 2)
        XCTAssertEqual(service.seasonCalls, [2])
        service.seasonResult = .success(season(status: .current))

        await sut.connectivityChanged(offline: false)

        XCTAssertEqual(service.seasonCalls, [2, 2], "le retour du réseau relit la saison")
        XCTAssertEqual(sut.season.value?.status, .current)
        XCTAssertEqual(blockReloads, 1, "et le bloc gardé avec elle")
    }

    func test_theNetworkPublisher_drivesTheReread_onlyOnTheOfflineToOnlineEdge() async throws {
        let network = FakeNetworkMonitor(isOnline: true)
        let (sut, service, _) = makeSUT(network: network)
        await sut.loadSeason(number: 2)
        network.offlineTransitions.send(false)
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(service.seasonCalls, [2], "rester en ligne ne relit rien")

        network.offlineTransitions.send(true)
        network.offlineTransitions.send(false)
        for _ in 0..<50 where service.seasonCalls.count < 2 { try await Task.sleep(nanoseconds: 20_000_000) }

        XCTAssertEqual(service.seasonCalls, [2, 2])
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

    // MARK: - Une page Saison restée ouverte se repeint au dimanche 20 h (#10225)

    private func local(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int, _ second: Int = 0) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute, second: second)) ?? Date()
    }

    func test_flipSchedule_repaintsNow_thenAtEachSundayEightPm() {
        let start = local(2026, 12, 20, 19, 59, 30)
        let entries = Array(GameSeasonFlipSchedule().entries(from: start, mode: .normal).prefix(3))
        XCTAssertEqual(entries, [start, local(2026, 12, 20, 20, 0), local(2026, 12, 27, 20, 0)])
        XCTAssertEqual(GameSeasonFlipSchedule.nextClose(after: local(2026, 12, 20, 20, 0)), local(2026, 12, 27, 20, 0),
                       "à 20 h pile, la prochaine bascule est la semaine suivante")
    }

    func test_anOpenSeasonPage_flipsFromUpcomingToOpened_atTheScheduledRepaint() {
        let game = GameWave2Fixture.game(season: nil, seasonUpcoming: GameWave2Fixture.upcoming)
        let entries = Array(GameSeasonFlipSchedule().entries(from: local(2026, 12, 20, 19, 59, 30), mode: .normal).prefix(2))
        let shown = entries.map { GameSeasonShown.of(focus: 1, game: game, load: GameLoad<GameSeasonArchive>(), moment: .local($0)) }
        XCTAssertEqual(shown, [.upcoming(GameWave2Fixture.upcoming), .opened(GameWave2Fixture.upcoming)],
                       "la page peinte avant 20 h se repeint « ouverte » à l'entrée suivante de la TimelineView")
    }
}
