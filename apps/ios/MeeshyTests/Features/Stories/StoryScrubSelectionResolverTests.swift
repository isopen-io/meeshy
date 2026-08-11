import XCTest
@testable import Meeshy

/// Résolution PURE du survol des barres scrubbables du story viewer :
/// cadres des tuiles + position du doigt → index survolé (bande de tolérance
/// verticale pour qu'un tremblement ne perde pas le survol), et relâchement
/// → action. Pattern StoryGestureDecisions : décision pure, testée isolément.
final class StoryScrubSelectionResolverTests: XCTestCase {

    // Trois tuiles 40×40 côte à côte à y=100, puis la tuile « + » (index 3).
    private let frames: [Int: CGRect] = [
        0: CGRect(x: 0, y: 100, width: 40, height: 40),
        1: CGRect(x: 44, y: 100, width: 40, height: 40),
        2: CGRect(x: 88, y: 100, width: 40, height: 40),
        3: CGRect(x: 132, y: 100, width: 40, height: 40),
    ]

    private func hovered(_ x: CGFloat, _ y: CGFloat) -> Int? {
        StoryScrubSelectionResolver.hoveredIndex(
            tileFrames: frames, point: CGPoint(x: x, y: y), verticalTolerance: 16)
    }

    func test_hoveredIndex_insideTile_hoversIt() {
        XCTAssertEqual(hovered(60, 120), 1)
    }

    func test_hoveredIndex_slightlyAbove_staysWithinToleranceBand() {
        XCTAssertEqual(hovered(60, 90), 1)
    }

    func test_hoveredIndex_slightlyBelow_staysWithinToleranceBand() {
        XCTAssertEqual(hovered(60, 150), 1)
    }

    func test_hoveredIndex_beyondToleranceBand_hoversNothing() {
        XCTAssertNil(hovered(60, 200))
    }

    func test_hoveredIndex_horizontallyOutside_hoversNothing() {
        XCTAssertNil(hovered(500, 120))
    }

    func test_hoveredIndex_emptyFrames_hoversNothing() {
        XCTAssertNil(StoryScrubSelectionResolver.hoveredIndex(
            tileFrames: [:], point: CGPoint(x: 60, y: 120), verticalTolerance: 16))
    }

    func test_release_overTile_selectsIt() {
        XCTAssertEqual(StoryScrubSelectionResolver.release(hoveredIndex: 1, tileCount: 3), .select(index: 1))
    }

    func test_release_overTrailingPlus_expands() {
        XCTAssertEqual(StoryScrubSelectionResolver.release(hoveredIndex: 3, tileCount: 3), .expand)
    }

    func test_release_outsideEveryTile_keepsBarOpen() {
        XCTAssertEqual(StoryScrubSelectionResolver.release(hoveredIndex: nil, tileCount: 3), .keepOpen)
    }

    func test_release_outOfRangeIndex_keepsBarOpen() {
        XCTAssertEqual(StoryScrubSelectionResolver.release(hoveredIndex: 9, tileCount: 3), .keepOpen)
    }
}
