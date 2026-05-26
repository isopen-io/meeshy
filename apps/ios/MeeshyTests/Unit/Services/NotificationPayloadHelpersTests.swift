import XCTest
@testable import Meeshy

/// Unit tests for the pure helpers used by the notification service extension
/// to repair fields iOS Communication Notifications drop / can't carry through
/// the E2EE push path.
///
/// These cover the two bugs identified empirically on iOS 18:
///   - Bug A: `try content.updating(from: INSendMessageIntent)` wipes the
///     APN-native `subtitle` (conversation name for groups / Meeshy Global).
///   - Bug B: An audio-only E2EE message arrives with an empty plaintext body
///     after decryption (gateway encrypts only the optional caption, which is
///     empty for a voice memo) and the rich push shows no audio context.
///
/// The helpers themselves live in `MeeshyNotificationExtension/NotificationPayloadHelpers.swift`
/// and are compiled into BOTH the NSE target and the `MeeshyTests` target via
/// `project.pbxproj` so we can exercise them without bringing the full
/// `UNNotificationServiceExtension` runtime into the test process.
final class NotificationPayloadHelpersTests: XCTestCase {

    // MARK: - Factories

    private func makeUserInfo(
        conversationType: String? = nil,
        conversationTitle: String? = nil,
        attachmentMimeType: String? = nil
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [:]
        if let conversationType { info["conversationType"] = conversationType }
        if let conversationTitle { info["conversationTitle"] = conversationTitle }
        if let attachmentMimeType { info["attachmentMimeType"] = attachmentMimeType }
        return info
    }

    // MARK: - Bug A — subtitle preservation

    func test_preservedSubtitle_groupWithEmptySubtitle_returnsConversationTitle() {
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Mon groupe"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "Mon groupe")
    }

    func test_preservedSubtitle_globalWithEmptySubtitle_returnsConversationTitle() {
        let userInfo = makeUserInfo(
            conversationType: "global",
            conversationTitle: "Meeshy Global"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "Meeshy Global")
    }

    func test_preservedSubtitle_whitespaceOnlySubtitle_returnsConversationTitle() {
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Equipe Dev"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            currentSubtitle: "   ",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "Equipe Dev")
    }

    func test_preservedSubtitle_directConversation_returnsNil() {
        // Direct messages never carry a subtitle — restoring one would invent
        // a "group name" where there is none.
        let userInfo = makeUserInfo(
            conversationType: "direct",
            conversationTitle: "Alice"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_subtitleAlreadySet_returnsNil() {
        // iOS sometimes preserves the subtitle (e.g. when no intent donation
        // happened) — we must not stomp it with a re-resolved value.
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: "Mon groupe"
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            currentSubtitle: "Mon groupe",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_missingConversationTitle_returnsNil() {
        let userInfo = makeUserInfo(conversationType: "group")

        let result = NotificationPayloadHelpers.preservedSubtitle(
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_emptyConversationTitle_returnsNil() {
        let userInfo = makeUserInfo(
            conversationType: "group",
            conversationTitle: ""
        )

        let result = NotificationPayloadHelpers.preservedSubtitle(
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_preservedSubtitle_missingConversationType_returnsNil() {
        let userInfo = makeUserInfo(conversationTitle: "Mon groupe")

        let result = NotificationPayloadHelpers.preservedSubtitle(
            currentSubtitle: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    // MARK: - Bug B — audio body fallback

    func test_audioBodyFallback_emptyBodyWithAudioMime_returnsLocalizedFallback() {
        let userInfo = makeUserInfo(attachmentMimeType: "audio/m4a")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "🎵 Message vocal")
    }

    func test_audioBodyFallback_whitespaceBodyWithAudioMime_returnsFallback() {
        let userInfo = makeUserInfo(attachmentMimeType: "audio/mp4")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "   \n",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "🎵 Message vocal")
    }

    func test_audioBodyFallback_caseInsensitiveMime_returnsFallback() {
        let userInfo = makeUserInfo(attachmentMimeType: "AUDIO/M4A")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "",
            userInfo: userInfo
        )

        XCTAssertEqual(result, "🎵 Message vocal")
    }

    func test_audioBodyFallback_bodyAlreadyFormatted_returnsNil() {
        // The non-E2EE path arrives with `"🎵 Audio · 0:34"` already formatted
        // by the gateway — never overwrite it.
        let userInfo = makeUserInfo(attachmentMimeType: "audio/m4a")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "🎵 Audio · 0:34",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_audioBodyFallback_decryptedCaptionPresent_returnsNil() {
        // E2EE message with a non-empty caption (e.g. "Listen to this!") has
        // a meaningful body after decryption and must not be replaced.
        let userInfo = makeUserInfo(attachmentMimeType: "audio/m4a")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "Listen to this!",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_audioBodyFallback_imageAttachment_returnsNil() {
        let userInfo = makeUserInfo(attachmentMimeType: "image/jpeg")

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }

    func test_audioBodyFallback_noMimeType_returnsNil() {
        let userInfo = makeUserInfo()

        let result = NotificationPayloadHelpers.audioBodyFallback(
            currentBody: "",
            userInfo: userInfo
        )

        XCTAssertNil(result)
    }
}
