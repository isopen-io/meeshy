import XCTest
import SwiftUI
@testable import Meeshy

/// Verrouille `FeedButtonAnchor` — le mapping pur "x,y" persistée → point écran /
/// UnitPoint qui place le foyer du liquid reveal Reels au centre EXACT du bouton
/// feed. Doit rester un miroir parfait de `FreeFloatingButton.screenPosition`
/// (mêmes constantes : buttonSize 52, minEdgePadding 20, topSafeZone 50,
/// bottomSafeZone 110/50). Si l'un bouge sans l'autre, le disque naît à côté du
/// bouton — ce test casse alors volontairement.
@MainActor
final class FeedButtonAnchorTests: XCTestCase {

    private let screen = CGSize(width: 390, height: 844)
    private let safeArea = EdgeInsets(top: 59, leading: 0, bottom: 34, trailing: 0)

    // MARK: - parse

    func test_parse_validPair_returnsClampedPoint() {
        XCTAssertEqual(FeedButtonAnchor.parse("0.0,0.0"), CGPoint(x: 0, y: 0))
        XCTAssertEqual(FeedButtonAnchor.parse("1.0,1.0"), CGPoint(x: 1, y: 1))
        XCTAssertEqual(FeedButtonAnchor.parse("0.5,0.25"), CGPoint(x: 0.5, y: 0.25))
    }

    func test_parse_outOfRange_clampsTo01() {
        XCTAssertEqual(FeedButtonAnchor.parse("2.0,-1.0"), CGPoint(x: 1, y: 0))
    }

    func test_parse_malformed_defaultsToTopLeft() {
        XCTAssertEqual(FeedButtonAnchor.parse("garbage"), CGPoint(x: 0, y: 0))
        XCTAssertEqual(FeedButtonAnchor.parse(""), CGPoint(x: 0, y: 0))
        XCTAssertEqual(FeedButtonAnchor.parse("1.0"), CGPoint(x: 0, y: 0))
    }

    // MARK: - screenPoint mirrors FreeFloatingButton math

    func test_screenPoint_topLeft_matchesBoundsMinCorner() {
        // pos (0,0) → button center = (minX, minY) with search bar visible.
        let p = FeedButtonAnchor.screenPoint(
            fromRaw: "0.0,0.0", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        let half = FeedButtonAnchor.buttonSize / 2
        let expectedX = safeArea.leading + FeedButtonAnchor.minEdgePadding + half       // 0 + 20 + 26
        let expectedY = safeArea.top + FeedButtonAnchor.topSafeZone + half               // 59 + 50 + 26
        XCTAssertEqual(p.x, expectedX, accuracy: 0.001)
        XCTAssertEqual(p.y, expectedY, accuracy: 0.001)
    }

    func test_screenPoint_bottomRight_searchVisible_usesLargerBottomSafeZone() {
        let p = FeedButtonAnchor.screenPoint(
            fromRaw: "1.0,1.0", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        let half = FeedButtonAnchor.buttonSize / 2
        let expectedX = screen.width - safeArea.trailing - FeedButtonAnchor.minEdgePadding - half
        let expectedY = screen.height - safeArea.bottom - FeedButtonAnchor.bottomSafeZoneWithSearch - half
        XCTAssertEqual(p.x, expectedX, accuracy: 0.001)
        XCTAssertEqual(p.y, expectedY, accuracy: 0.001)
    }

    func test_screenPoint_searchHidden_movesAnchorLower() {
        // No search bar → smaller bottom safe-zone → the bottom-anchored button
        // sits LOWER on screen (larger y).
        let visible = FeedButtonAnchor.screenPoint(
            fromRaw: "0.0,1.0", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        let hidden = FeedButtonAnchor.screenPoint(
            fromRaw: "0.0,1.0", screenSize: screen, safeArea: safeArea, isSearchBarVisible: false
        )
        XCTAssertGreaterThan(hidden.y, visible.y)
    }

    // MARK: - unitPoint

    func test_unitPoint_isScreenPointFraction() {
        let p = FeedButtonAnchor.screenPoint(
            fromRaw: "0.5,0.5", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        let u = FeedButtonAnchor.unitPoint(
            fromRaw: "0.5,0.5", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        XCTAssertEqual(u.x, p.x / screen.width, accuracy: 0.0001)
        XCTAssertEqual(u.y, p.y / screen.height, accuracy: 0.0001)
    }

    func test_unitPoint_zeroSize_returnsTopLeading() {
        let u = FeedButtonAnchor.unitPoint(
            fromRaw: "0.5,0.5", screenSize: .zero, safeArea: safeArea, isSearchBarVisible: true
        )
        XCTAssertEqual(u, .topLeading)
    }
}
