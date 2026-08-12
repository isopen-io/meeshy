import XCTest
@testable import Meeshy

@MainActor
final class VoiceConsentFetchTests: XCTestCase {
    func test_voiceConsentMissing_falseWhenFetchThrows() async {
        // resolveVoiceConsentMissing is a pure async helper: maps a throwing
        // fetch to a Bool, defaulting to false (no false nudge) on error.
        let missing = await ConversationViewModel.resolveVoiceConsentMissing {
            throw NSError(domain: "x", code: 1)
        }
        XCTAssertFalse(missing)
    }

    func test_voiceConsentMissing_trueWhenNoConsent() async {
        let missing = await ConversationViewModel.resolveVoiceConsentMissing { false /* hasConsent */ }
        XCTAssertTrue(missing)
    }

    func test_voiceConsentMissing_falseWhenConsentGranted() async {
        let missing = await ConversationViewModel.resolveVoiceConsentMissing { true }
        XCTAssertFalse(missing)
    }
}
