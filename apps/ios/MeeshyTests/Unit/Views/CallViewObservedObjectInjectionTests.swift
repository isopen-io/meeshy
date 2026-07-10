import XCTest
@testable import Meeshy

/// Audit P1-16 regression guard.
///
/// `CallView` and `IncomingCallView` are reconstructed by SwiftUI every time
/// their parent (`RootView`/`iPadRootView`) re-evaluates its `body` — which
/// happens for churn unrelated to calls (unread counts, presence, navigation).
/// A defaulted `@ObservedObject var callManager = CallManager.shared` is
/// reassigned on every such reconstruction, tearing down and rebuilding the
/// `objectWillChange` subscription even mid-call. The fix threads the
/// parent's own `callManager` instance down via init injection instead.
@MainActor
final class CallViewObservedObjectInjectionTests: XCTestCase {

    private func source(of relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/\(relativePath)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callView_doesNotDefaultCallManagerToSharedInstance() throws {
        let source = try source(of: "Views/CallView.swift")
        XCTAssertFalse(
            source.contains("@ObservedObject var callManager = CallManager.shared"),
            "CallView must not default `callManager` to `CallManager.shared` at " +
            "declaration — that reassigns (and resubscribes) the ObservedObject " +
            "every time the parent view reconstructs CallView, including mid-call."
        )
        XCTAssertTrue(
            source.contains("@ObservedObject var callManager: CallManager"),
            "CallView must declare `callManager` as an injected (non-defaulted) " +
            "ObservedObject so callers pass their own existing instance down."
        )
    }

    func test_rootView_injectsOwnCallManagerIntoCallView() throws {
        let source = try source(of: "Views/RootView.swift")
        XCTAssertTrue(
            source.contains("CallView(callManager: callManager)"),
            "RootView must pass its own `callManager` into CallView instead of " +
            "letting CallView default to CallManager.shared on every reconstruction."
        )
    }

    func test_iPadRootView_injectsOwnCallManagerIntoCallView() throws {
        let source = try source(of: "Views/iPadRootView+Sheets.swift")
        XCTAssertTrue(
            source.contains("CallView(callManager: callManager)"),
            "iPadRootView must pass its own `callManager` into CallView instead of " +
            "letting CallView default to CallManager.shared on every reconstruction."
        )
    }

    // 2026-07-08 — FloatingCallPillView and CallBubbleView reintroduced the exact
    // anti-pattern this file guards CallView against: both are mounted as bare
    // `.overlay` closures directly on RootView/iPadRootView (top-level containers
    // whose body re-evaluates for unread-count/presence/navigation churn having
    // nothing to do with an active call), so a defaulted `= CallManager.shared`
    // tore down and rebuilt their objectWillChange subscription on every such
    // unrelated re-render.

    func test_floatingCallPillView_doesNotDefaultCallManagerToSharedInstance() throws {
        let source = try source(of: "Views/FloatingCallPillView.swift")
        XCTAssertFalse(
            source.contains("@ObservedObject var callManager = CallManager.shared"),
            "FloatingCallPillView must not default `callManager` to `CallManager.shared` " +
            "at declaration — that resubscribes on every unrelated parent re-render."
        )
        XCTAssertTrue(
            source.contains("@ObservedObject var callManager: CallManager"),
            "FloatingCallPillView must declare `callManager` as an injected " +
            "(non-defaulted) ObservedObject so callers pass their own instance down."
        )
    }

    func test_callBubbleView_doesNotDefaultCallManagerToSharedInstance() throws {
        let source = try source(of: "Views/CallBubbleView.swift")
        XCTAssertFalse(
            source.contains("@ObservedObject var callManager = CallManager.shared"),
            "CallBubbleView must not default `callManager` to `CallManager.shared` " +
            "at declaration — that resubscribes on every unrelated parent re-render."
        )
        XCTAssertTrue(
            source.contains("@ObservedObject var callManager: CallManager"),
            "CallBubbleView must declare `callManager` as an injected (non-defaulted) " +
            "ObservedObject so callers pass their own instance down."
        )
    }

    func test_rootView_injectsOwnCallManagerIntoPillAndBubble() throws {
        let source = try source(of: "Views/RootView.swift")
        XCTAssertTrue(
            source.contains("FloatingCallPillView(callManager: callManager)"),
            "RootView must pass its own `callManager` into FloatingCallPillView."
        )
        XCTAssertTrue(
            source.contains("CallBubbleView(callManager: callManager)"),
            "RootView must pass its own `callManager` into CallBubbleView."
        )
    }

    func test_iPadRootView_injectsOwnCallManagerIntoPillAndBubble() throws {
        let source = try source(of: "Views/iPadRootView+Sheets.swift")
        XCTAssertTrue(
            source.contains("FloatingCallPillView(callManager: callManager)"),
            "iPadRootView must pass its own `callManager` into FloatingCallPillView."
        )
        XCTAssertTrue(
            source.contains("CallBubbleView(callManager: callManager)"),
            "iPadRootView must pass its own `callManager` into CallBubbleView."
        )
    }

    // 2026-07-10 — `CallParticipantVisual` (the shared avatar/remote-video
    // visual mounted by both FloatingCallPillView and CallBubbleView, which
    // themselves already carry the P1-16 fix above) reintroduced the exact
    // same anti-pattern one layer down, and `CallView`'s separate
    // `transcriptionService` ObservedObject reintroduced it alongside an
    // already-fixed `callManager` in the same struct.

    func test_callParticipantVisual_doesNotDefaultCallManagerToSharedInstance() throws {
        let source = try source(of: "Views/CallParticipantVisual.swift")
        XCTAssertFalse(
            source.contains("@ObservedObject private var callManager = CallManager.shared"),
            "CallParticipantVisual must not default `callManager` to `CallManager.shared` " +
            "at declaration — that resubscribes on every parent re-render (every call tick)."
        )
        XCTAssertTrue(
            source.contains("@ObservedObject var callManager: CallManager"),
            "CallParticipantVisual must declare `callManager` as an injected " +
            "(non-defaulted) ObservedObject so callers pass their own instance down."
        )
    }

    func test_floatingCallPillView_injectsOwnCallManagerIntoCallParticipantVisual() throws {
        let source = try source(of: "Views/FloatingCallPillView.swift")
        XCTAssertTrue(
            source.contains("CallParticipantVisual(diameter: 44, callManager: callManager)"),
            "FloatingCallPillView must pass its own `callManager` into CallParticipantVisual."
        )
    }

    func test_callBubbleView_injectsOwnCallManagerIntoCallParticipantVisual() throws {
        let source = try source(of: "Views/CallBubbleView.swift")
        XCTAssertTrue(
            source.contains("CallParticipantVisual(diameter: diameter, callManager: callManager)"),
            "CallBubbleView must pass its own `callManager` into CallParticipantVisual."
        )
    }

    func test_callView_doesNotDefaultTranscriptionServiceToSharedInstance() throws {
        let source = try source(of: "Views/CallView.swift")
        XCTAssertFalse(
            source.contains("@ObservedObject private var transcriptionService = CallManager.shared.transcriptionService"),
            "CallView must not default `transcriptionService` to " +
            "`CallManager.shared.transcriptionService` at declaration — same P1-16 " +
            "hazard as `callManager`: reassigned (and resubscribed) on every parent " +
            "reconstruction, including mid-call."
        )
        XCTAssertTrue(
            source.contains("self.transcriptionService = callManager.transcriptionService"),
            "CallView must derive `transcriptionService` from the injected `callManager` " +
            "inside a custom init, not from a defaulted property declaration."
        )
    }
}
