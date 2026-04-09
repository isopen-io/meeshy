import XCTest
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
}
