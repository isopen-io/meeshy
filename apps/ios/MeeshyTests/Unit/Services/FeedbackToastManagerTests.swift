import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class FeedbackToastManagerTests: XCTestCase {

    // FeedbackToastManager is a singleton with @MainActor. We test the public API
    // using the shared instance and clean up after each test.

    override func setUp() async throws {
        await MainActor.run {
            FeedbackToastManager.shared.dismiss()
            // Defensive: drain any crash diagnostics another test wrote to
            // disk via `CrashDiagnosticsManager.writeSync`. Without this, a
            // sibling test that boots `MeeshyApp.surfaceCrashReports` would
            // pop a toast mid-`Task.sleep` in
            // `test_show_autoDismissesAfterDelay`, and the assertion that
            // expects `currentToast == nil` after the dismiss delay would
            // see the polluting "Exception precedent" toast instead.
            _ = CrashDiagnosticsManager.shared.consumePending()
        }
    }

    override func tearDown() async throws {
        await MainActor.run {
            FeedbackToastManager.shared.dismiss()
        }
    }

    // MARK: - Show

    func test_show_setsCurrentToast() {
        let sut = FeedbackToastManager.shared
        sut.show("Test message")
        XCTAssertNotNil(sut.currentToast)
        XCTAssertEqual(sut.currentToast?.message, "Test message")
    }

    func test_show_defaultTypeIsSuccess() {
        let sut = FeedbackToastManager.shared
        sut.show("Success message")
        XCTAssertEqual(sut.currentToast?.type, .success)
    }

    func test_show_withErrorType_setsErrorToast() {
        let sut = FeedbackToastManager.shared
        sut.show("Error message", type: .error)
        XCTAssertEqual(sut.currentToast?.type, .error)
    }

    // MARK: - Show Error

    func test_showError_setsErrorType() {
        let sut = FeedbackToastManager.shared
        sut.showError("Something went wrong")
        XCTAssertNotNil(sut.currentToast)
        XCTAssertEqual(sut.currentToast?.type, .error)
        XCTAssertEqual(sut.currentToast?.message, "Something went wrong")
    }

    // MARK: - Show Success

    func test_showSuccess_setsSuccessType() {
        let sut = FeedbackToastManager.shared
        sut.showSuccess("Done!")
        XCTAssertNotNil(sut.currentToast)
        XCTAssertEqual(sut.currentToast?.type, .success)
        XCTAssertEqual(sut.currentToast?.message, "Done!")
    }

    // MARK: - Dismiss

    func test_dismiss_clearsCurrentToast() {
        let sut = FeedbackToastManager.shared
        sut.show("Test")
        sut.dismiss()
        XCTAssertNil(sut.currentToast)
    }

    // MARK: - Replacement

    func test_show_replacesExistingToast() {
        let sut = FeedbackToastManager.shared
        sut.show("First toast")
        let firstId = sut.currentToast?.id
        sut.show("Second toast")
        XCTAssertNotEqual(sut.currentToast?.id, firstId)
        XCTAssertEqual(sut.currentToast?.message, "Second toast")
    }

    // MARK: - Auto-Dismiss

    func test_show_autoDismissesAfterDelay() async {
        let sut = FeedbackToastManager.shared
        sut.show("Auto dismiss")

        XCTAssertNotNil(sut.currentToast)

        try? await Task.sleep(nanoseconds: 3_500_000_000)

        XCTAssertNil(sut.currentToast)
    }

    // MARK: - Notification

    func test_showToastNotification_nameIsCorrect() {
        XCTAssertEqual(
            FeedbackToastManager.showToastNotification,
            Notification.Name("meeshy.showToast")
        )
    }

    // MARK: - Auto-dismiss delay (VoiceOver-aware, pure)

    func test_dismissDelay_standardToast_voiceOverOff_is3s() {
        XCTAssertEqual(
            FeedbackToastManager.dismissDelay(isTappable: false, voiceOverRunning: false),
            3_000_000_000
        )
    }

    func test_dismissDelay_tappableToast_voiceOverOff_is6s() {
        XCTAssertEqual(
            FeedbackToastManager.dismissDelay(isTappable: true, voiceOverRunning: false),
            6_000_000_000
        )
    }

    func test_dismissDelay_standardToast_voiceOverOn_extendsTo6s() {
        // VoiceOver users need time to hear the announcement + read the message.
        XCTAssertEqual(
            FeedbackToastManager.dismissDelay(isTappable: false, voiceOverRunning: true),
            6_000_000_000
        )
    }

    func test_dismissDelay_tappableToast_voiceOverOn_staysAtLeast6s() {
        XCTAssertEqual(
            FeedbackToastManager.dismissDelay(isTappable: true, voiceOverRunning: true),
            6_000_000_000
        )
    }

}
