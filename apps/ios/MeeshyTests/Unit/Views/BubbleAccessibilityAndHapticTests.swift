import XCTest
@testable import Meeshy

@MainActor
final class BubbleAccessibilityAndHapticTests: XCTestCase {

    func test_bubble_exposesNamedAccessibilityActions_replyReactCopyMenu() {
        let all = BubbleAccessibilityActionSet.available(canReply: true, canReact: true, canCopy: true, canOpenMenu: true)
        XCTAssertEqual(all, [.reply, .react, .copy, .openMenu])
        XCTAssertTrue(all.allSatisfy { !$0.name.isEmpty })
        XCTAssertEqual(Set(all.map(\.name)).count, 4)
    }

    func test_bubble_omitsAccessibilityActionsWithoutHandler() {
        let some = BubbleAccessibilityActionSet.available(canReply: false, canReact: true, canCopy: false, canOpenMenu: true)
        XCTAssertEqual(some, [.react, .openMenu])
    }

    func test_swipeResistance_crossingReplyThreshold_firesLightHapticOnce() {
        let below = BubbleSwipeResistance.crossing(wasCrossed: false, offset: BubbleSwipeResistance.commitDistance - 1)
        XCTAssertEqual(below, .init(crossed: false, firesHaptic: false))

        let first = BubbleSwipeResistance.crossing(wasCrossed: false, offset: BubbleSwipeResistance.commitDistance)
        XCTAssertEqual(first, .init(crossed: true, firesHaptic: true))

        let beyond = BubbleSwipeResistance.crossing(wasCrossed: first.crossed, offset: BubbleSwipeResistance.commitDistance + 20)
        XCTAssertEqual(beyond, .init(crossed: true, firesHaptic: false))

        let backAndForth = BubbleSwipeResistance.crossing(wasCrossed: false, offset: -BubbleSwipeResistance.commitDistance)
        XCTAssertTrue(backAndForth.firesHaptic)
    }
}
