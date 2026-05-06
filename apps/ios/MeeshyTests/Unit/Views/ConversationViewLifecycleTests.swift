import XCTest
import Combine
@testable import Meeshy

@MainActor
final class ConversationViewLifecycleTests: XCTestCase {

    func test_typingDotTimer_invalidates_onDisappear() async {
        let cancellable = TypingDotTimerHarness.shared.makeTimer()
        XCTAssertTrue(TypingDotTimerHarness.shared.isActive)

        TypingDotTimerHarness.shared.invalidate(cancellable)

        XCTAssertFalse(TypingDotTimerHarness.shared.isActive)
    }
}
