import SwiftUI
import XCTest
@testable import MeeshyUI

@MainActor
final class SwipeRowCoordinatorTests: XCTestCase {

    private let rowFrame = CGRect(x: 0, y: 200, width: 390, height: 72)

    func test_capped_fourActions_keepsTheFirstThree() {
        XCTAssertEqual(SwipeRowRules.capped(["a", "b", "c", "d"]), ["a", "b", "c"])
    }

    func test_capped_twoActions_keepsBoth() {
        XCTAssertEqual(SwipeRowRules.capped(["a", "b"]), ["a", "b"])
    }

    func test_swipeableRow_fourActionsPerSide_rendersAtMostThree() {
        let actions = (0..<4).map { SwipeAction(icon: "pin", label: "\($0)", color: .red) {} }
        let row = SwipeableRow(leadingActions: actions, trailingActions: actions) { EmptyView() }
        XCTAssertEqual(row.leadingActions.map(\.label), ["0", "1", "2"])
        XCTAssertEqual(row.trailingActions.map(\.label), ["0", "1", "2"])
    }

    func test_closesOpenRow_touchInsideTheOpenRow_keepsItOpen() {
        XCTAssertFalse(SwipeRowRules.closesOpenRow(touchAt: CGPoint(x: 300, y: 230), openRowFrame: rowFrame))
    }

    func test_closesOpenRow_touchOnAnotherRow_closes() {
        XCTAssertTrue(SwipeRowRules.closesOpenRow(touchAt: CGPoint(x: 300, y: 320), openRowFrame: rowFrame))
    }

    func test_closesOpenRow_frameNotMeasuredYet_closes() {
        XCTAssertTrue(SwipeRowRules.closesOpenRow(touchAt: CGPoint(x: 300, y: 230), openRowFrame: .null))
    }

    func test_rowDidOpen_whileAnotherRowIsOpen_closesThePreviousOne() {
        let coordinator = SwipeRowCoordinator()
        var closed: [String] = []
        coordinator.rowDidOpen(UUID()) { closed.append("first") }
        coordinator.rowDidOpen(UUID()) { closed.append("second") }
        XCTAssertEqual(closed, ["first"])
        XCTAssertTrue(coordinator.hasOpenRow)
    }

    func test_touchBegan_outsideTheOpenRow_closesItOnce() {
        let coordinator = SwipeRowCoordinator()
        let id = UUID()
        var closeCount = 0
        coordinator.rowDidOpen(id) { closeCount += 1 }
        coordinator.rowFrameDidChange(id, frame: rowFrame)

        coordinator.touchBegan(at: CGPoint(x: 40, y: 700))
        coordinator.touchBegan(at: CGPoint(x: 40, y: 700))

        XCTAssertEqual(closeCount, 1)
        XCTAssertFalse(coordinator.hasOpenRow)
    }

    func test_touchBegan_insideTheOpenRow_leavesItOpen() {
        let coordinator = SwipeRowCoordinator()
        let id = UUID()
        var closeCount = 0
        coordinator.rowDidOpen(id) { closeCount += 1 }
        coordinator.rowFrameDidChange(id, frame: rowFrame)

        coordinator.touchBegan(at: CGPoint(x: 350, y: 240))

        XCTAssertEqual(closeCount, 0)
        XCTAssertTrue(coordinator.hasOpenRow)
    }

    func test_rowDidClose_fromARowThatIsNotTheOpenOne_keepsTheOpenRow() {
        let coordinator = SwipeRowCoordinator()
        coordinator.rowDidOpen(UUID()) {}
        coordinator.rowDidClose(UUID())
        XCTAssertTrue(coordinator.hasOpenRow)
    }

    func test_closeOpenRow_withNoOpenRow_doesNothing() {
        let coordinator = SwipeRowCoordinator()
        coordinator.closeOpenRow()
        XCTAssertFalse(coordinator.hasOpenRow)
    }
}
