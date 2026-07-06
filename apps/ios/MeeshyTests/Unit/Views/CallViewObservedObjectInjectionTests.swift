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
}
