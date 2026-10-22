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

    func test_aServedTrophy_isOneEntry_namedByItsPresentation() {
        let entries = GameVisitorShowcase.entries(visitor(items: [GameVisitorTrophyItem(key: "trophy.flame.100", awardedMonth: "2026-09")]))
        XCTAssertEqual(entries.map(\.key), ["trophy.flame.100"])
        XCTAssertEqual(entries.first?.presentation, GameTrophyPresentation.of(key: "trophy.flame.100"))
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

    // MARK: - La constellation (#10053)

    private var ecran: RenderedScreen?
    override func tearDown() async throws { ecran?.dismount(); ecran = nil; try await super.tearDown() }

    /// La bande de la carte de contact ne monte plus la constellation d'un autre (#10380) : le web l'a retirée avec la
    /// carte visiteur (#10097) ; la bande garde le niveau, le rang, le trésor et trois coupes. La constellation reste
    /// celle du membre, sur sa vitrine.
    func test_theContactStrip_mountsNoConstellation() throws {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let strip = try String(contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Game/Wave2/GameProfileViews.swift"),
                               encoding: .utf8)
        XCTAssertTrue(strip.contains("struct GameContactStrip"))
        XCTAssertFalse(strip.lowercased().contains("constellation"), "la bande ne lit ni ne peint la constellation d'un autre")
        let showcase = try String(contentsOf: iosRoot.appendingPathComponent("Meeshy/Features/Main/Game/Wave2/GameShowcaseViews.swift"),
                                  encoding: .utf8)
        XCTAssertFalse(showcase.contains("init(stars:"), "plus aucune fiche ne monte la constellation d'un visiteur")
    }

    func test_theOwnersConstellation_saysItsStars_theNextOne_andItsCosmetics() {
        let e = RenderedScreen(GameConstellationCard(collected: 23).padding(), size: CGSize(width: 402, height: 1200))
        ecran = e
        XCTAssertTrue(e.identifiers.contains("game.constellation"), "vus : \(e.identifiers)")
        XCTAssertTrue(e.says(GameText.constellationNext(7)))
        XCTAssertTrue(e.says(GameText.constellationCosmetic(kind: GameText.constellationKind(.frame), star: GameCopy.formatCount(2))))
    }
}
