import XCTest
@testable import Meeshy

@MainActor
final class PendingBannerDismissResolverTests: XCTestCase {

    func test_shouldDismiss_swipeLeft_returnsTrue() {
        let result = PendingBannerDismissResolver.shouldDismiss(translation: CGSize(width: -60, height: 0))
        XCTAssertTrue(result)
    }

    func test_shouldDismiss_swipeRight_returnsTrue() {
        let result = PendingBannerDismissResolver.shouldDismiss(translation: CGSize(width: 60, height: 0))
        XCTAssertTrue(result)
    }

    func test_shouldDismiss_swipeUp_returnsTrue() {
        let result = PendingBannerDismissResolver.shouldDismiss(translation: CGSize(width: 0, height: -60))
        XCTAssertTrue(result)
    }

    func test_shouldDismiss_swipeDown_returnsFalse() {
        let result = PendingBannerDismissResolver.shouldDismiss(translation: CGSize(width: 0, height: 60))
        XCTAssertFalse(result, "swipe down is not one of the requested dismiss gestures")
    }

    func test_shouldDismiss_belowThreshold_returnsFalse() {
        let result = PendingBannerDismissResolver.shouldDismiss(translation: CGSize(width: 5, height: -5))
        XCTAssertFalse(result)
    }
}
