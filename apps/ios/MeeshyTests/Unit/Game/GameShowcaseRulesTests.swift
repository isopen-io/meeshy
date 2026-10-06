import XCTest
@testable import Meeshy
import MeeshySDK

/// La vitrine : son ordre, son rangement, et ce qu'un visiteur en reçoit (#9387, conformité D-3).
@MainActor
final class GameShowcaseRulesTests: XCTestCase {

    private func trophies(items: [String], order: [String]) -> GameTrophiesBlock {
        GameTrophiesBlock(items: items.map { GameTrophyItem(key: $0, awardedAt: "2026-10-12T00:05:00.000Z") }, order: order)
    }

    func test_theShelfFollowsTheServedOrder_thenWhatTheOrderDoesNotCite() {
        let block = trophies(items: ["a", "b", "c"], order: ["c", "a"])
        XCTAssertEqual(GameShowcaseRules.shelfOrder(block), ["c", "a", "b"])
    }

    func test_aKeyTheOrderCitesButThePlayerDoesNotOwn_isDropped_andDuplicatesCollapse() {
        let block = trophies(items: ["a", "b"], order: ["ghost", "b", "b", "a"])
        XCTAssertEqual(GameShowcaseRules.shelfOrder(block), ["b", "a"])
    }

    func test_moving_swapsWithTheNeighbour_andStopsAtTheEdges() {
        let order = ["a", "b", "c"]
        XCTAssertEqual(GameShowcaseRules.moved(order, index: 1, delta: -1), ["b", "a", "c"])
        XCTAssertEqual(GameShowcaseRules.moved(order, index: 1, delta: 1), ["a", "c", "b"])
        XCTAssertEqual(GameShowcaseRules.moved(order, index: 0, delta: -1), order)
        XCTAssertEqual(GameShowcaseRules.moved(order, index: 2, delta: 1), order)
        XCTAssertEqual(GameShowcaseRules.moved(order, index: 9, delta: 1), order)
    }

    // MARK: - Ce qu'un visiteur reçoit

    private func visitor(visible: Bool = true, items: [GameVisitorTrophyItem], order: [String] = []) -> UserShowcaseResponse {
        UserShowcaseResponse(visible: visible, items: items, order: order)
    }

    func test_aClosedShowcase_drawsNothing_andSaysNothing() {
        let closed = visitor(visible: false, items: [GameVisitorTrophyItem(key: "trophy.flame.100", awardedMonth: "2026-09")])
        XCTAssertEqual(GameVisitorShowcase.entries(closed), [])
        XCTAssertEqual(GameVisitorShowcase.entries(nil), [])
    }

    func test_aVisitorReadsAMonth_neverADay() {
        let entries = GameVisitorShowcase.entries(visitor(items: [GameVisitorTrophyItem(key: "trophy.flame.100", awardedMonth: "2026-09")]))
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.caption, GameText.showcaseAwardedMonth(month: GameWave2Format.month("2026-09")))
    }

    func test_twoIdenticalCupsOfTheSameMonth_areOneCountedLine() {
        let items = [GameVisitorTrophyItem(key: "trophy.league-cup.2026-10.jade.gold", awardedMonth: "2026-10", count: 2)]
        let entries = GameVisitorShowcase.entries(visitor(items: items))
        XCTAssertEqual(entries.first?.caption, GameText.showcaseAwardedMonthCount(month: GameWave2Format.month("2026-10"), count: GameCopy.formatCount(2)))
    }

    func test_aKeyOfANewerVersion_isNotNamed() {
        let items = [GameVisitorTrophyItem(key: "trophy.future.9", awardedMonth: "2026-10"),
                     GameVisitorTrophyItem(key: "trophy.flame.100", awardedMonth: "2026-09")]
        XCTAssertEqual(GameVisitorShowcase.entries(visitor(items: items)).map(\.key), ["trophy.flame.100"])
    }

    func test_theOrderIsTheMembers_thenWhatItDoesNotCite() {
        let items = [GameVisitorTrophyItem(key: "trophy.flame.100", awardedMonth: "2026-09"),
                     GameVisitorTrophyItem(key: "trophy.season-cup.1", awardedMonth: "2026-12")]
        let entries = GameVisitorShowcase.entries(visitor(items: items, order: ["trophy.season-cup.1"]))
        XCTAssertEqual(entries.map(\.key), ["trophy.season-cup.1", "trophy.flame.100"])
    }
}
