import XCTest
@testable import Meeshy

/// #9947 — une saison ou une semaine de ligue, passée, en cours ou future, s'ouvre par un lien.
@MainActor
final class GameDeepLinkTests: XCTestCase {
    func test_parse_universalSeasonLink_opensThatSeason() {
        let url = URL(string: "https://meeshy.me/me/progression/saison/3")!
        XCTAssertEqual(DeepLinkParser.parse(url), .gameSeason(number: 3))
    }

    func test_parse_universalLeagueWeekLink_opensThatWeek() {
        let url = URL(string: "https://meeshy.me/me/progression/ligue/2026-10-12")!
        XCTAssertEqual(DeepLinkParser.parse(url), .gameLeagueWeek(weekKey: "2026-10-12"))
    }
}
