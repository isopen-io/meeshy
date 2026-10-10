import XCTest
@testable import Meeshy

/// #9947 — une saison ou une semaine de ligue, passée, en cours ou future, s'ouvre par un lien :
/// `https://meeshy.me/me/progression/saison/{n}`, `…/ligue/{lundi}`, et leurs jumeaux `meeshy://`.
/// Le routage ne lit pas d'horloge : passé, en cours ou futur se décide à la lecture (gateway).
@MainActor
final class GameDeepLinkTests: XCTestCase {

    private func parse(_ string: String) -> DeepLinkDestination {
        DeepLinkParser.parse(URL(string: string)!, environmentWebOrigin: "https://meeshy.me")
    }

    // MARK: - Les deux schémas

    func test_parse_universalSeasonLink_opensThatSeason() {
        XCTAssertEqual(parse("https://meeshy.me/me/progression/saison/3"), .game(.season(number: 3)))
    }

    func test_parse_customSchemeSeasonLink_opensThatSeason() {
        XCTAssertEqual(parse("meeshy://me/progression/saison/3"), .game(.season(number: 3)))
    }

    func test_parse_universalLeagueWeekLink_opensThatWeek() {
        XCTAssertEqual(parse("https://meeshy.me/me/progression/ligue/2026-10-12"), .game(.leagueWeek(key: "2026-10-12")))
    }

    func test_parse_customSchemeLeagueWeekLink_opensThatWeek() {
        XCTAssertEqual(parse("meeshy://me/progression/ligue/2026-10-19"), .game(.leagueWeek(key: "2026-10-19")))
    }

    // MARK: - Passée, en cours, future : le lien ne juge pas, il nomme

    func test_parse_pastCurrentAndFutureSeasons_allRoute() {
        for number in [1, 2, 12, 9999] {
            XCTAssertEqual(parse("https://meeshy.me/me/progression/saison/\(number)"), .game(.season(number: number)))
        }
    }

    func test_parse_bareForms_openTheCurrentSeasonAndWeek() {
        XCTAssertEqual(parse("https://meeshy.me/me/progression/saison"), .game(.season(number: nil)))
        XCTAssertEqual(parse("meeshy://me/progression/ligue/"), .game(.leagueWeek(key: nil)))
    }

    // MARK: - Paramètre invalide : la page en cours, jamais Safari ni un écran vide

    func test_parse_invalidSeasonNumber_opensTheCurrentSeason() {
        for raw in ["0", "-1", "abc", "1.5", "01", "10000"] {
            XCTAssertEqual(parse("https://meeshy.me/me/progression/saison/\(raw)"), .game(.season(number: nil)), raw)
        }
    }

    func test_parse_invalidWeekKey_opensTheCurrentWeek() {
        for raw in ["2026-10-13", "2026-02-30", "semaine", "20261012"] {
            XCTAssertEqual(parse("https://meeshy.me/me/progression/ligue/\(raw)"), .game(.leagueWeek(key: nil)), raw)
        }
    }

    func test_parse_otherMePaths_keepOpeningTheOwnProfile() {
        XCTAssertEqual(parse("https://meeshy.me/me"), .ownProfile)
        XCTAssertEqual(parse("meeshy://me/progression/reglages"), .ownProfile)
    }

    func test_isMeeshyDeepLink_claimsGameLinks() {
        XCTAssertTrue(DeepLinkParser.isMeeshyDeepLink(URL(string: "https://meeshy.me/me/progression/saison/4")!))
        XCTAssertTrue(DeepLinkParser.isMeeshyDeepLink(URL(string: "https://meeshy.me/me/progression/ligue/2026-10-12")!))
    }

    // MARK: - Lancement système : à froid, après l'onboarding et SessionGate

    func test_handle_gameLink_queuesThePendingDestination() {
        let router = DeepLinkRouter(isAuthenticated: { false }, hasResolvedSession: { false })
        XCTAssertTrue(router.handle(url: URL(string: "https://meeshy.me/me/progression/saison/5")!))
        XCTAssertEqual(router.pendingDeepLink, .game(.season(number: 5)))
    }

    func test_gameLink_survivesSignIn() {
        XCTAssertTrue(DeepLink.game(.season(number: 1)).opensAfterSignIn)
        XCTAssertTrue(DeepLink.game(.leagueWeek(key: nil)).opensAfterSignIn)
    }

    // MARK: - La page du Jeu, et le chemin de retour

    func test_entry_seasonLink_opensTheSeasonPageOnThatSeason() {
        let route = GameNavigationMap.entry(for: .season(number: 3))
        XCTAssertEqual(route, .gamePage(.season, focus: .season(number: 3)))
        XCTAssertEqual(GameNavigationMap.chain(to: route), [.progression, .progressionConcept(.season), route])
    }

    func test_entry_leagueWeekLink_opensTheLeaguePageOnThatWeek() {
        let route = GameNavigationMap.entry(for: .leagueWeek(key: "2026-10-12"))
        XCTAssertEqual(route, .gamePage(.league, focus: .leagueWeek(key: "2026-10-12")))
        XCTAssertEqual(GameNavigationMap.parent(of: route), .progressionConcept(.league))
    }

    func test_entry_bareLinks_openThePagesWithoutFocus() {
        XCTAssertEqual(GameNavigationMap.entry(for: .season(number: nil)), .gamePage(.season))
        XCTAssertEqual(GameNavigationMap.entry(for: .leagueWeek(key: nil)), .gamePage(.league))
    }

    func test_openGame_fromALink_stacksProgressionFicheAndPage() {
        let router = Router()
        router.openGame(at: GameNavigationMap.entry(for: .season(number: 7)))
        XCTAssertEqual(router.path, [.progression, .progressionConcept(.season), .gamePage(.season, focus: .season(number: 7))])
    }
}
