import XCTest
import CryptoKit
@testable import Meeshy

@MainActor
final class E2ESessionManagerTests: XCTestCase {

    // The SessionManager is an actor with tight coupling to E2EAPI, E2EEService, and KeychainManager.
    // We test the error types, peer tracking via UserDefaults, and the session error descriptions.

    // MARK: - SessionError

    func test_sessionError_invalidBase64Payload_hasDescription() {
        let error = SessionManager.SessionError.invalidBase64Payload
        XCTAssertEqual(error.errorDescription, "Invalid base64 payload from backend")
    }

    func test_sessionError_missingSession_hasDescription() {
        let error = SessionManager.SessionError.missingSession
        XCTAssertEqual(error.errorDescription, "Session not initialized and senderIdentityPublic missing")
    }

    func test_sessionError_sessionUnavailable_hasDescription() {
        let error = SessionManager.SessionError.sessionUnavailable
        XCTAssertEqual(error.errorDescription,
                       "E2EE session unavailable — establishment recently failed, retry on cooldown")
    }

    func test_sessionError_invalidBase64Payload_isLocalizedError() {
        let error: any LocalizedError = SessionManager.SessionError.invalidBase64Payload
        XCTAssertNotNil(error.errorDescription)
    }

    func test_sessionError_missingSession_isLocalizedError() {
        let error: any LocalizedError = SessionManager.SessionError.missingSession
        XCTAssertNotNil(error.errorDescription)
    }

    // MARK: - SessionError Equatable

    func test_sessionErrors_areDifferent() {
        let error1 = SessionManager.SessionError.invalidBase64Payload
        let error2 = SessionManager.SessionError.missingSession
        XCTAssertNotEqual(error1.errorDescription, error2.errorDescription)
    }

    // MARK: - Shared Instance

    func test_shared_returnsSameInstance() async {
        let a = SessionManager.shared
        let b = SessionManager.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - Negative Cache Cooldown

    func test_isWithinFailureCooldown_noPriorFailure_returnsFalse() {
        let result = SessionManager.isWithinFailureCooldown(
            failedAt: nil, now: Date(), cooldown: 600)
        XCTAssertFalse(result)
    }

    func test_isWithinFailureCooldown_recentFailure_returnsTrue() {
        let now = Date()
        let result = SessionManager.isWithinFailureCooldown(
            failedAt: now.addingTimeInterval(-60), now: now, cooldown: 600)
        XCTAssertTrue(result)
    }

    func test_isWithinFailureCooldown_expiredFailure_returnsFalse() {
        let now = Date()
        let result = SessionManager.isWithinFailureCooldown(
            failedAt: now.addingTimeInterval(-601), now: now, cooldown: 600)
        XCTAssertFalse(result)
    }

    func test_isWithinFailureCooldown_exactlyAtCooldownBoundary_returnsFalse() {
        let now = Date()
        let result = SessionManager.isWithinFailureCooldown(
            failedAt: now.addingTimeInterval(-600), now: now, cooldown: 600)
        XCTAssertFalse(result)
    }

    // MARK: - resolveWipeUserId (P1 — clearSessions() Keychain-namespace fix)
    //
    // `clearSessions()` runs from MeeshyApp's `adaptiveOnChange(of:
    // authManager.isAuthenticated)` `else` branch, which only fires AFTER
    // `AuthManager.logout()` has already nil'd `currentUser`. Reading
    // `currentUserId()` fresh at that point always returns `nil`, so the
    // Keychain wipe silently targeted the wrong (un-namespaced) entry and
    // the outgoing user's E2EE session keys survived on disk.

    func test_resolveWipeUserId_currentAvailable_returnsCurrent() {
        XCTAssertEqual(SessionManager.resolveWipeUserId(current: "userA", cached: "userB"), "userA")
    }

    func test_resolveWipeUserId_currentNil_fallsBackToCached() {
        XCTAssertEqual(SessionManager.resolveWipeUserId(current: nil, cached: "userA"), "userA")
    }

    func test_resolveWipeUserId_bothNil_returnsNil() {
        XCTAssertNil(SessionManager.resolveWipeUserId(current: nil, cached: nil))
    }

    func test_resolveWipeUserId_bothAvailable_prefersCurrentOverCached() {
        // `current` reflects the live AuthManager state and should always
        // win when available — `cached` is only a fallback for the
        // already-wiped case.
        XCTAssertEqual(SessionManager.resolveWipeUserId(current: "freshUser", cached: "staleUser"), "freshUser")
    }
}
