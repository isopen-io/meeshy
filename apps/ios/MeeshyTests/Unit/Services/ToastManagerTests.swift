import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class ToastManagerTests: XCTestCase {

    // ToastManager is a singleton with @MainActor. We test the public API
    // using the shared instance and clean up after each test.

    override func setUp() async throws {
        await MainActor.run {
            ToastManager.shared.dismiss()
        }
    }

    override func tearDown() async throws {
        await MainActor.run {
            ToastManager.shared.dismiss()
        }
    }

    // MARK: - Show

    func test_show_setsCurrentToast() {
        let sut = ToastManager.shared
        sut.show("Test message")
        XCTAssertNotNil(sut.currentToast)
        XCTAssertEqual(sut.currentToast?.message, "Test message")
    }

    func test_show_defaultTypeIsSuccess() {
        let sut = ToastManager.shared
        sut.show("Success message")
        XCTAssertEqual(sut.currentToast?.type, .success)
    }

    func test_show_withErrorType_setsErrorToast() {
        let sut = ToastManager.shared
        sut.show("Error message", type: .error)
        XCTAssertEqual(sut.currentToast?.type, .error)
    }

    // MARK: - Show Error

    func test_showError_setsErrorType() {
        let sut = ToastManager.shared
        sut.showError("Something went wrong")
        XCTAssertNotNil(sut.currentToast)
        XCTAssertEqual(sut.currentToast?.type, .error)
        XCTAssertEqual(sut.currentToast?.message, "Something went wrong")
    }

    // MARK: - Show Success

    func test_showSuccess_setsSuccessType() {
        let sut = ToastManager.shared
        sut.showSuccess("Done!")
        XCTAssertNotNil(sut.currentToast)
        XCTAssertEqual(sut.currentToast?.type, .success)
        XCTAssertEqual(sut.currentToast?.message, "Done!")
    }

    // MARK: - Dismiss

    func test_dismiss_clearsCurrentToast() {
        let sut = ToastManager.shared
        sut.show("Test")
        sut.dismiss()
        XCTAssertNil(sut.currentToast)
    }

    // MARK: - Replacement

    func test_show_replacesExistingToast() {
        let sut = ToastManager.shared
        sut.show("First toast")
        let firstId = sut.currentToast?.id
        sut.show("Second toast")
        XCTAssertNotEqual(sut.currentToast?.id, firstId)
        XCTAssertEqual(sut.currentToast?.message, "Second toast")
    }

    // MARK: - Auto-Dismiss

    func test_show_autoDismissesAfterDelay() async {
        let sut = ToastManager.shared
        sut.show("Auto dismiss")

        XCTAssertNotNil(sut.currentToast)

        try? await Task.sleep(nanoseconds: 3_500_000_000)

        XCTAssertNil(sut.currentToast)
    }

    // MARK: - Notification

    func test_showToastNotification_nameIsCorrect() {
        XCTAssertEqual(
            ToastManager.showToastNotification,
            Notification.Name("meeshy.showToast")
        )
    }

    // MARK: - In-App Notification Formatting (pure)

    func test_formatInAppNotificationMessage_groupMessage_returnsTitleSubtitleAndBody() {
        let payload = makeNotificationPayload(
            title: "Alice Martin",
            subtitle: "Équipe Dev",
            content: "🎵 Audio · 0:34"
        )
        XCTAssertEqual(
            ToastManager.formatInAppNotificationMessage(payload),
            "Alice Martin · Équipe Dev\n🎵 Audio · 0:34"
        )
    }

    func test_formatInAppNotificationMessage_directMessage_returnsTitleAndBodyOnly() {
        let payload = makeNotificationPayload(
            title: "Bob Smith",
            subtitle: nil,
            content: "Salut!"
        )
        XCTAssertEqual(
            ToastManager.formatInAppNotificationMessage(payload),
            "Bob Smith\nSalut!"
        )
    }

    func test_formatInAppNotificationMessage_emptyContent_returnsHeaderOnly() {
        let payload = makeNotificationPayload(
            title: "Alice Martin",
            subtitle: "Équipe Dev",
            content: ""
        )
        XCTAssertEqual(
            ToastManager.formatInAppNotificationMessage(payload),
            "Alice Martin · Équipe Dev"
        )
    }

    func test_formatInAppNotificationMessage_noTitleNoSubtitle_returnsContentOnly() {
        let payload = makeNotificationPayload(
            title: nil,
            subtitle: nil,
            content: "System message"
        )
        XCTAssertEqual(
            ToastManager.formatInAppNotificationMessage(payload),
            "System message"
        )
    }

    func test_formatInAppNotificationMessage_emptyEverywhere_returnsNil() {
        let payload = makeNotificationPayload(title: "", subtitle: "", content: "")
        XCTAssertNil(ToastManager.formatInAppNotificationMessage(payload))
    }

    func test_formatInAppNotificationMessage_whitespaceOnly_returnsNil() {
        let payload = makeNotificationPayload(title: "   ", subtitle: "\n", content: "\t ")
        XCTAssertNil(ToastManager.formatInAppNotificationMessage(payload))
    }

    func test_formatInAppNotificationMessage_audioBody_preservesEmojiAndDurationSeparator() {
        let payload = makeNotificationPayload(
            title: "Alice",
            subtitle: nil,
            content: "🎵 Audio · 1:23"
        )
        XCTAssertEqual(
            ToastManager.formatInAppNotificationMessage(payload),
            "Alice\n🎵 Audio · 1:23"
        )
    }

    // MARK: - showInAppNotification — Side Effects

    func test_showInAppNotification_groupMessage_setsInfoToastWithFullHeader() {
        let sut = ToastManager.shared
        let payload = makeNotificationPayload(
            title: "Alice Martin",
            subtitle: "Équipe Dev",
            content: "🎵 Audio · 0:34"
        )

        let shown = sut.showInAppNotification(payload)

        XCTAssertTrue(shown)
        XCTAssertNotNil(sut.currentToast)
        XCTAssertEqual(sut.currentToast?.type, .info)
        XCTAssertEqual(
            sut.currentToast?.message,
            "Alice Martin · Équipe Dev\n🎵 Audio · 0:34"
        )
    }

    func test_showInAppNotification_currentConversationMatchesTarget_isSuppressed() {
        let sut = ToastManager.shared
        let payload = makeNotificationPayload(
            title: "Alice",
            subtitle: "Équipe Dev",
            content: "Hello",
            conversationId: "conv_123"
        )

        let shown = sut.showInAppNotification(payload, currentConversationId: "conv_123")

        XCTAssertFalse(shown)
        XCTAssertNil(sut.currentToast)
    }

    func test_showInAppNotification_currentConversationDifferent_isShown() {
        let sut = ToastManager.shared
        let payload = makeNotificationPayload(
            title: "Alice",
            subtitle: "Équipe Dev",
            content: "Hello",
            conversationId: "conv_123"
        )

        let shown = sut.showInAppNotification(payload, currentConversationId: "conv_999")

        XCTAssertTrue(shown)
        XCTAssertNotNil(sut.currentToast)
    }

    func test_showInAppNotification_withTapAction_marksTappable() {
        let sut = ToastManager.shared
        let payload = makeNotificationPayload(
            title: "Alice",
            subtitle: nil,
            content: "Salut!"
        )
        var tapped = false

        _ = sut.showInAppNotification(payload, tapAction: { tapped = true })

        XCTAssertEqual(sut.currentToast?.isTappable, true)
        sut.onTapAction?()
        XCTAssertTrue(tapped)
    }

    func test_showInAppNotification_emptyPayload_returnsFalseAndShowsNothing() {
        let sut = ToastManager.shared
        let payload = makeNotificationPayload(title: nil, subtitle: nil, content: nil)

        let shown = sut.showInAppNotification(payload)

        XCTAssertFalse(shown)
        XCTAssertNil(sut.currentToast)
    }

    // MARK: - Test fixture

    private func makeNotificationPayload(
        title: String?,
        subtitle: String?,
        content: String?,
        conversationId: String? = nil
    ) -> APINotification {
        let context: NotificationContext? = conversationId.map { id in
            NotificationContext(
                conversationId: id,
                conversationTitle: subtitle,
                conversationType: subtitle == nil ? "direct" : "group",
                messageId: nil,
                originalMessageId: nil,
                callSessionId: nil,
                friendRequestId: nil,
                reactionId: nil,
                postId: nil,
                commentId: nil
            )
        }
        return APINotification(
            id: "notif_test",
            userId: "user_test",
            type: "new_message",
            priority: nil,
            title: title,
            subtitle: subtitle,
            content: content,
            actor: nil,
            context: context,
            metadata: nil,
            state: NotificationState(isRead: false, readAt: nil, createdAt: "2026-05-26T09:00:00Z", expiresAt: nil),
            delivery: nil
        )
    }
}
