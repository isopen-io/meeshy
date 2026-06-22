import XCTest
@testable import Meeshy

@MainActor
final class ConsentNoticeDecisionTests: XCTestCase {
    func test_show_onlyWhenMineAndConsentMissing() {
        XCTAssertTrue(AudioMediaView.shouldShowConsentNotice(isMe: true, voiceConsentMissing: true))
        XCTAssertFalse(AudioMediaView.shouldShowConsentNotice(isMe: false, voiceConsentMissing: true))
        XCTAssertFalse(AudioMediaView.shouldShowConsentNotice(isMe: true, voiceConsentMissing: false))
        XCTAssertFalse(AudioMediaView.shouldShowConsentNotice(isMe: false, voiceConsentMissing: false))
    }
}
