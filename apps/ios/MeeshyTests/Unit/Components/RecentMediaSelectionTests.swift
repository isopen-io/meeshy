import XCTest
@testable import Meeshy

/// Pins the multi-selection semantics of the composer's recent-media strip:
/// "Sélectionner" begins an ordered selection, taps toggle membership while
/// preserving pick order (the order items are staged on confirm), and
/// cancel/confirm always resets to the inactive state.
final class RecentMediaSelectionTests: XCTestCase {

    func test_initialState_isInactiveAndEmpty() {
        let selection = RecentMediaSelection()
        XCTAssertFalse(selection.isActive)
        XCTAssertTrue(selection.isEmpty)
        XCTAssertEqual(selection.count, 0)
    }

    func test_begin_activatesAndSelectsTheAsset() {
        var selection = RecentMediaSelection()
        selection.begin(with: "a")
        XCTAssertTrue(selection.isActive)
        XCTAssertEqual(selection.ids, ["a"])
        XCTAssertEqual(selection.index(of: "a"), 0)
    }

    func test_begin_twiceWithSameId_doesNotDuplicate() {
        var selection = RecentMediaSelection()
        selection.begin(with: "a")
        selection.begin(with: "a")
        XCTAssertEqual(selection.ids, ["a"])
    }

    func test_toggle_whileInactive_isIgnored() {
        var selection = RecentMediaSelection()
        selection.toggle("a")
        XCTAssertFalse(selection.isActive)
        XCTAssertTrue(selection.isEmpty)
    }

    func test_toggle_appendsInTapOrder() {
        var selection = RecentMediaSelection()
        selection.begin(with: "a")
        selection.toggle("b")
        selection.toggle("c")
        XCTAssertEqual(selection.ids, ["a", "b", "c"])
        XCTAssertEqual(selection.index(of: "b"), 1)
    }

    func test_toggle_selectedId_removesItAndReindexesFollowers() {
        var selection = RecentMediaSelection()
        selection.begin(with: "a")
        selection.toggle("b")
        selection.toggle("c")
        selection.toggle("b")
        XCTAssertEqual(selection.ids, ["a", "c"])
        XCTAssertEqual(selection.index(of: "c"), 1)
        XCTAssertNil(selection.index(of: "b"))
    }

    func test_toggle_lastRemainingId_keepsSelectionModeActive() {
        var selection = RecentMediaSelection()
        selection.begin(with: "a")
        selection.toggle("a")
        XCTAssertTrue(selection.isActive)
        XCTAssertTrue(selection.isEmpty)
    }

    func test_clear_deactivatesAndEmpties() {
        var selection = RecentMediaSelection()
        selection.begin(with: "a")
        selection.toggle("b")
        selection.clear()
        XCTAssertFalse(selection.isActive)
        XCTAssertTrue(selection.isEmpty)
    }
}
