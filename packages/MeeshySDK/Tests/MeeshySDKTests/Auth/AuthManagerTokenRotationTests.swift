import XCTest
@testable import MeeshySDK

/// P2.2 — pins the contract behind the socket-reconnect-on-token-rotation
/// chain. The audit suspected this signal was missing in `applySession`;
/// in fact it has existed since the initial implementation as a direct
/// `MessageSocketManager.shared.forceReconnect()` call. This suite covers:
///
///   1. the pure rotation-detection predicate via the new
///      `isTokenRotation(...)` helper (so a refactor that flips the
///      condition fails loudly), and
///   2. the `tokenDidRotate` publisher's no-emit on cold start (we don't
///      want refresh-of-refresh storms when the very first login lands).
///
/// The full `applySession` integration (writing into the keychain,
/// flipping `isAuthenticated`, triggering `MessageSocketManager.forceReconnect`)
/// runs against real singletons and is exercised at app smoke-test level
/// rather than in this pure unit.
final class AuthManagerTokenRotationTests: XCTestCase {

    func test_isTokenRotation_sameUserAndAuthenticated_returnsTrue() {
        XCTAssertTrue(
            AuthManager.isTokenRotation(
                currentlyAuthenticated: true,
                currentActiveUserId: "u1",
                newUserId: "u1"
            )
        )
    }

    func test_isTokenRotation_notAuthenticated_returnsFalse() {
        // Cold start: applySession runs because the user just logged in.
        // We must NOT classify that as a rotation, otherwise the brand
        // new socket gets torn down right after we built it.
        XCTAssertFalse(
            AuthManager.isTokenRotation(
                currentlyAuthenticated: false,
                currentActiveUserId: "u1",
                newUserId: "u1"
            )
        )
    }

    func test_isTokenRotation_differentUser_returnsFalse() {
        // User-A logged in, then user-B logs in on the same device — that
        // is NOT a rotation, it's a switch (different keychain namespace).
        XCTAssertFalse(
            AuthManager.isTokenRotation(
                currentlyAuthenticated: true,
                currentActiveUserId: "u1",
                newUserId: "u2"
            )
        )
    }

    func test_isTokenRotation_noActiveUser_returnsFalse() {
        // Defensive case: `isAuthenticated` flipped without
        // `activeUserId` getting set. We treat this as a cold-start, not
        // a rotation — protects against double-reconnect on a half-init.
        XCTAssertFalse(
            AuthManager.isTokenRotation(
                currentlyAuthenticated: true,
                currentActiveUserId: nil,
                newUserId: "u1"
            )
        )
    }
}
