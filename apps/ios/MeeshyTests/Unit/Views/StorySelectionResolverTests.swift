import XCTest
@testable import Meeshy

@MainActor
final class StorySelectionResolverTests: XCTestCase {

    func test_liveSelection_allSelectedIDsStillLive_returnsAllOfThem() {
        let result = StorySelectionResolver.liveSelection(
            selectedIDs: ["a", "b"],
            liveIDs: ["a", "b", "c"]
        )
        XCTAssertEqual(result, ["a", "b"])
    }

    func test_liveSelection_oneSelectedIDNoLongerLive_dropsIt() {
        let result = StorySelectionResolver.liveSelection(
            selectedIDs: ["a", "b"],
            liveIDs: ["a", "c"]
        )
        XCTAssertEqual(result, ["a"], "b was removed from the live list (deleted elsewhere) — must be dropped from the selection")
    }

    func test_liveSelection_emptySelection_returnsEmpty() {
        let result = StorySelectionResolver.liveSelection(selectedIDs: [], liveIDs: ["a", "b"])
        XCTAssertTrue(result.isEmpty)
    }

    func test_liveSelection_noneOfSelectionIsLive_returnsEmpty() {
        let result = StorySelectionResolver.liveSelection(selectedIDs: ["x", "y"], liveIDs: ["a", "b"])
        XCTAssertTrue(result.isEmpty)
    }
}
