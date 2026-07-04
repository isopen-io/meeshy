import XCTest
@testable import Meeshy

/// Source-level guards for `CallStarter`. `start(...)` composes real
/// singletons (`CallManager.shared`, `ConversationService.shared`,
/// `FeedbackToastManager.shared`) with no dependency injection seam, so a
/// behavioral test would either be flaky (shared singleton state across the
/// suite) or require CallKit/WebRTC side effects unavailable in a unit-test
/// host. These guards instead pin the two properties that regressed silently
/// before this fix: every failure path (busy call, unresolved conversation)
/// must reach user-visible feedback, not a bare no-op closure.
@MainActor
final class CallStarterTests: XCTestCase {

    private func callStarterSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Contacts/CallStarter.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_defaultOnUnavailable_isNotASilentNoOp() throws {
        let source = try callStarterSource()
        XCTAssertFalse(
            source.contains("onUnavailable: @escaping () -> Void = {}"),
            "onUnavailable must not default to a bare no-op — CallsTab and CallDetailSheet's " +
            "redial buttons never override it, so a resolution failure there was a tap that " +
            "visibly did nothing."
        )
        XCTAssertTrue(
            source.contains("onUnavailable: @escaping () -> Void = { showUnavailableToast() }"),
            "onUnavailable must default to showUnavailableToast so every call site gets " +
            "user-visible feedback unless it explicitly overrides with a richer fallback " +
            "(e.g. KeypadTab opening the profile)."
        )
    }

    func test_showUnavailableToast_usesFeedbackToastManager() throws {
        let source = try callStarterSource()
        guard let start = source.range(of: "func showUnavailableToast()") else {
            XCTFail("showUnavailableToast not found in CallStarter.swift"); return
        }
        let body = String(source[start.lowerBound...])
        XCTAssertTrue(
            body.contains("FeedbackToastManager.shared.showError"),
            "showUnavailableToast must surface a FeedbackToastManager error toast — per the " +
            "two-tier toast rule (apps/ios/CLAUDE.md), a local-action failure goes through " +
            "FeedbackToastManager, never NotificationToastManager."
        )
    }

    func test_start_delegatesBusyFeedbackToCallManager_doesNotDuplicateIt() throws {
        let source = try callStarterSource()
        // The busy-call toast must live in exactly one place (CallManager.startCall)
        // so CallStarter and every other direct startCall() caller share it —
        // CallStarter must not re-implement its own busy check/toast.
        XCTAssertFalse(
            source.contains("call.starter.busy"),
            "CallStarter must not surface its own busy-call toast — that responsibility " +
            "belongs to CallManager.startCall, which every direct call site shares."
        )
    }
}
