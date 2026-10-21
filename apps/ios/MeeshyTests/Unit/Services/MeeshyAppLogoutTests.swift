import XCTest
@testable import Meeshy

/// Regression coverage for the logout branch of
/// `MeeshyApp.sessionChanged(isAuthenticated:)` in `MeeshyApp+Lifecycle.swift`
/// (it lived in the main window's `adaptiveOnChange(of: isAuthenticated)`
/// until the iPad could close that window and take the teardown with it).
///
/// That branch drives singletons that cannot be faked — `CallManager` (4900+ lines, CallKit/WebRTC-entangled) and
/// `VoIPPushManager` (PushKit-entangled) cannot be driven into a genuine
/// "active call" / "registered device" state from a unit test host. Mirrors
/// the existing source-inspection convention in `CallManagerTests.swift`
/// (`test_endCall_usesSharedReliableEmit`,
/// `AckFailureReconciliationTests`) for the same reason.
@MainActor
final class MeeshyAppLogoutTests: XCTestCase {

    private func meeshyAppSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // MeeshyAppLogoutTests.swift -> Services
            .deletingLastPathComponent() // Services -> Unit
            .deletingLastPathComponent() // Unit -> MeeshyTests
            .deletingLastPathComponent() // MeeshyTests -> apps/ios
            .appendingPathComponent("Meeshy/MeeshyApp+Lifecycle.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Extracts the `else` branch body of `sessionChanged(isAuthenticated:)`:
    /// from its `} else {` to the next function of the extension. Bounding on
    /// that marker (rather than a fixed-length prefix) survives future
    /// additions to the branch body.
    private func logoutBranchBody(from source: String) -> String? {
        guard let handlerRange = source.range(of: "static func sessionChanged(isAuthenticated isAuth: Bool) {"),
              let elseRange = source.range(of: "} else {", range: handlerRange.upperBound..<source.endIndex),
              let nextHandlerRange = source.range(of: "private static func handleForegroundTransition", range: elseRange.upperBound..<source.endIndex) else {
            return nil
        }
        return String(source[elseRange.upperBound..<nextHandlerRange.lowerBound])
    }

    func test_logoutBranch_clearsVoIPRegistration() throws {
        let source = try meeshyAppSource()
        guard let body = logoutBranchBody(from: source) else {
            XCTFail("Could not locate the logout branch of sessionChanged(isAuthenticated:)")
            return
        }
        XCTAssertTrue(
            body.contains("VoIPPushManager.shared.unregisterAndClearToken()"),
            "Logout must purge the device's VoIP registration (PushKit + keychain-backed token " +
            "record) so a different account logging in on the same device does not inherit the " +
            "previous user's VoIP push registration."
        )
    }

    func test_logoutBranch_endsActiveCall() throws {
        let source = try meeshyAppSource()
        guard let body = logoutBranchBody(from: source) else {
            XCTFail("Could not locate the logout branch of sessionChanged(isAuthenticated:)")
            return
        }
        XCTAssertTrue(
            body.contains("CallManager.shared.endCall()"),
            "Logout must end any active call before tearing down the sockets, otherwise the call " +
            "is orphaned locally (peer still rings/connects to a device that silently vanished)."
        )
    }

    func test_logoutBranch_endsCallBeforeDisconnectingSockets() throws {
        let source = try meeshyAppSource()
        guard let body = logoutBranchBody(from: source),
              let endCallRange = body.range(of: "CallManager.shared.endCall()"),
              let disconnectRange = body.range(of: "MessageSocketManager.shared.disconnect()") else {
            XCTFail("Could not locate both endCall() and the socket disconnect in the logout branch")
            return
        }
        XCTAssertTrue(
            endCallRange.lowerBound < disconnectRange.lowerBound,
            "endCall() must run before the sockets disconnect — endCall() relies on the signaling " +
            "socket to deliver the hangup to the peer."
        )
    }
}
