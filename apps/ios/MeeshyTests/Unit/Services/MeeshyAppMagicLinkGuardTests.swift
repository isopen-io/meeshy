import XCTest
@testable import Meeshy

/// P0 — regression coverage for the "magic link tapped while already logged
/// in" account-takeover-adjacent bug: `applySession(B)` used to land on top
/// of account A's still-live session with no teardown (A's caches, sockets
/// carrying A's JWT, and E2EE session keys all survived the switch).
///
/// `validateMagicLinkToken` is a private function body inside a SwiftUI
/// `App` struct — not independently invocable from a unit test host (same
/// constraint as `MeeshyAppLogoutTests`). We pin the fix via source
/// inspection: `authManager.logout()` (full teardown) must run, gated on
/// `authManager.isAuthenticated`, strictly BEFORE `authManager.validateMagicLink`.
@MainActor
final class MeeshyAppMagicLinkGuardTests: XCTestCase {

    private func meeshyAppSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // MeeshyAppMagicLinkGuardTests.swift -> Services
            .deletingLastPathComponent() // Services -> Unit
            .deletingLastPathComponent() // Unit -> MeeshyTests
            .deletingLastPathComponent() // MeeshyTests -> apps/ios
            .appendingPathComponent("Meeshy/MeeshyApp.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func validateMagicLinkTokenBody(from source: String) -> String? {
        guard let start = source.range(of: "private func validateMagicLinkToken(_ token: String) {"),
              let end = source.range(of: "\n    }\n}", range: start.upperBound..<source.endIndex) else {
            return nil
        }
        return String(source[start.upperBound..<end.lowerBound])
    }

    func test_validateMagicLinkToken_logsOutFullSessionBeforeValidating_whenAlreadyAuthenticated() throws {
        let source = try meeshyAppSource()
        guard let body = validateMagicLinkTokenBody(from: source) else {
            XCTFail("Could not locate validateMagicLinkToken(_:) in MeeshyApp.swift")
            return
        }
        XCTAssertTrue(
            body.contains("authManager.isAuthenticated") && body.contains("await authManager.logout()"),
            "A magic link must trigger a full authManager.logout() teardown when already authenticated, " +
            "before applying the new session — otherwise the outgoing account's caches/sockets/E2EE keys leak."
        )
    }

    func test_validateMagicLinkToken_logoutRunsBeforeValidateMagicLink() throws {
        let source = try meeshyAppSource()
        guard let body = validateMagicLinkTokenBody(from: source),
              let logoutRange = body.range(of: "await authManager.logout()"),
              let validateRange = body.range(of: "await authManager.validateMagicLink(token: token)") else {
            XCTFail("Could not locate both logout() and validateMagicLink(token:) in validateMagicLinkToken(_:)")
            return
        }
        XCTAssertTrue(
            logoutRange.lowerBound < validateRange.lowerBound,
            "logout() must run BEFORE validateMagicLink(token:) — applying the new session on top of a " +
            "still-live one (even briefly) is the account-takeover-adjacent bug this guards against."
        )
    }

    // MARK: - Router.swift mirror (in-app Link taps while authenticated)

    private func routerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Navigation/Router.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func handleMagicLinkTokenBody(from source: String) -> String? {
        guard let start = source.range(of: "private func handleMagicLinkToken(_ token: String) async {"),
              let end = source.range(of: "\n    }\n", range: start.upperBound..<source.endIndex) else {
            return nil
        }
        return String(source[start.upperBound..<end.lowerBound])
    }

    func test_router_handleMagicLinkToken_logsOutBeforeValidating_whenAlreadyAuthenticated() throws {
        // `RootView`/`iPadRootView` only mount while authenticated, so this
        // path (reached e.g. via the `openURL` environment override on an
        // in-app tappable Link) ALWAYS runs already-logged-in — same bug
        // class as the MeeshyApp.swift path above, independent call site.
        let source = try routerSource()
        guard let body = handleMagicLinkTokenBody(from: source) else {
            XCTFail("Could not locate handleMagicLinkToken(_:) in Router.swift")
            return
        }
        XCTAssertTrue(
            body.contains("AuthManager.shared.isAuthenticated") && body.contains("await AuthManager.shared.logout()"),
            "Router's magic-link handler must also log out fully before validating a new magic link."
        )
        guard let logoutRange = body.range(of: "await AuthManager.shared.logout()"),
              let validateRange = body.range(of: "await AuthManager.shared.validateMagicLink(token: token)") else {
            XCTFail("Could not locate both logout() and validateMagicLink(token:) in handleMagicLinkToken(_:)")
            return
        }
        XCTAssertTrue(
            logoutRange.lowerBound < validateRange.lowerBound,
            "logout() must run BEFORE validateMagicLink(token:) in Router.handleMagicLinkToken too."
        )
    }
}
