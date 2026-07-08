import XCTest
@testable import Meeshy

/// Décision pure du popup de consentement vocal à l'envoi d'un audio
/// (2026-07-08) : hasAudio && consentMissing && !alreadyPrompted.
final class VoiceConsentPromptGatingTests: XCTestCase {

    func test_shouldPromptVoiceConsent_audioWithoutConsent_prompts() {
        XCTAssertTrue(ConversationView.shouldPromptVoiceConsent(
            hasAudio: true, consentMissing: true, alreadyPrompted: false))
    }

    func test_shouldPromptVoiceConsent_noAudio_neverPrompts() {
        XCTAssertFalse(ConversationView.shouldPromptVoiceConsent(
            hasAudio: false, consentMissing: true, alreadyPrompted: false))
    }

    func test_shouldPromptVoiceConsent_consentGranted_neverPrompts() {
        XCTAssertFalse(ConversationView.shouldPromptVoiceConsent(
            hasAudio: true, consentMissing: false, alreadyPrompted: false))
    }

    func test_shouldPromptVoiceConsent_alreadyPromptedThisSession_neverRePrompts() {
        XCTAssertFalse(ConversationView.shouldPromptVoiceConsent(
            hasAudio: true, consentMissing: true, alreadyPrompted: true))
    }
}
