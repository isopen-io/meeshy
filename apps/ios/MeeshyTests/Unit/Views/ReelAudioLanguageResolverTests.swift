import XCTest
@testable import Meeshy

/// Covers the P1 audit fix: `autoSelectPreferredAudioLanguage` used to iterate
/// the TTS payload order first (no short-circuit on the audio's original
/// language, no user priority ordering) — a French audio for a French-preferring
/// user was auto-switched to whichever TTS translation the payload listed
/// first (e.g. English). `ReelAudioLanguageResolver.preferredAudioLanguage`
/// mirrors `FeedPost.resolved(preferredLanguages:)`'s algorithm exactly.
final class ReelAudioLanguageResolverTests: XCTestCase {

    func test_preferredAudioLanguage_originalAlreadyPreferred_returnsNil() {
        // The user's #1 preferred language IS the audio's original language —
        // no TTS switch should happen even though a TTS translation exists.
        let result = ReelAudioLanguageResolver.preferredAudioLanguage(
            original: "fr",
            preferredLanguages: ["fr", "en"],
            availableLanguages: ["en", "es"]
        )
        XCTAssertNil(result)
    }

    func test_preferredAudioLanguage_noOriginalMatch_returnsHighestPriorityAvailableTranslation() {
        // Payload lists "en" before "fr", but the user's PRIORITY order puts
        // "fr" first — the priority order must win, not the payload order.
        let result = ReelAudioLanguageResolver.preferredAudioLanguage(
            original: "es",
            preferredLanguages: ["fr", "en"],
            availableLanguages: ["en", "fr"]
        )
        XCTAssertEqual(result, "fr")
    }

    func test_preferredAudioLanguage_firstPreferredUnavailable_fallsBackToNextPreferred() {
        let result = ReelAudioLanguageResolver.preferredAudioLanguage(
            original: "es",
            preferredLanguages: ["de", "en"],
            availableLanguages: ["en"]
        )
        XCTAssertEqual(result, "en")
    }

    func test_preferredAudioLanguage_noMatchAtAll_returnsNil() {
        let result = ReelAudioLanguageResolver.preferredAudioLanguage(
            original: "es",
            preferredLanguages: ["de", "it"],
            availableLanguages: ["en", "fr"]
        )
        XCTAssertNil(result)
    }

    func test_preferredAudioLanguage_isCaseInsensitive() {
        let result = ReelAudioLanguageResolver.preferredAudioLanguage(
            original: "ES",
            preferredLanguages: ["FR"],
            availableLanguages: ["Fr"]
        )
        XCTAssertEqual(result, "fr")
    }

    func test_preferredAudioLanguage_nilOriginal_stillHonorsPreferredOrder() {
        let result = ReelAudioLanguageResolver.preferredAudioLanguage(
            original: nil,
            preferredLanguages: ["fr", "en"],
            availableLanguages: ["en", "fr"]
        )
        XCTAssertEqual(result, "fr")
    }
}

/// Covers the P2 audit fix: `finalizeReelSession` used to read the shared video
/// engine unconditionally, even for an audio/image reel — attaching a stale
/// video's `watchMs` to the wrong session (inflated playCount / qualified
/// views).
final class ReelWatchAttachmentPolicyTests: XCTestCase {

    func test_shouldAttachVideoWatch_video_true() {
        XCTAssertTrue(ReelWatchAttachmentPolicy.shouldAttachVideoWatch(mediaType: .video))
    }

    func test_shouldAttachVideoWatch_audio_false() {
        XCTAssertFalse(ReelWatchAttachmentPolicy.shouldAttachVideoWatch(mediaType: .audio))
    }

    func test_shouldAttachVideoWatch_image_false() {
        XCTAssertFalse(ReelWatchAttachmentPolicy.shouldAttachVideoWatch(mediaType: .image))
    }

    func test_shouldAttachVideoWatch_nil_false() {
        XCTAssertFalse(ReelWatchAttachmentPolicy.shouldAttachVideoWatch(mediaType: nil))
    }
}
