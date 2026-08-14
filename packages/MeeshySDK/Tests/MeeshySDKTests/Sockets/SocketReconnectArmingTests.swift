import XCTest
@testable import MeeshySDK

/// Pins the recovery contract between `forceReconnect()` and `connect()`.
///
/// `forceReconnect()` tears the current socket down UNCONDITIONALLY
/// (`suspendTransport()`), and that teardown also destroys Socket.IO's own
/// infinite retry loop. The rebuild that follows is CONDITIONAL: `connect()`
/// bails without building anything when the token is missing or expired, or
/// when there is no base URL. Nothing used to bridge that gap, so the app could
/// be left with no transport, no retry loop, a valid session in the keychain
/// and a permanent "Reconnexion…" banner — recoverable only by an unrelated
/// external nudge (app backgrounded and refocused, or another network flip).
///
/// The realistic trigger is an outage long enough to expire the JWT: the
/// network comes back, `forceReconnect()` fires, `connect()` sees the expired
/// token and defers to `AuthManager.handleUnauthorized()`, and that refresh —
/// fire-and-forget, and very likely to hit a transient network error moments
/// after a restore — gives up silently without telling the realtime layer.
final class SocketReconnectArmingTests: XCTestCase {

    private var savedToken: String?

    /// A syntactically valid JWT whose `exp` is far in the past, so
    /// `isJWTExpired` takes the "expired" branch — the post-outage state this
    /// suite is about. The signature is irrelevant: the client only base64-decodes
    /// the payload to read `exp`, it never verifies.
    private static func expiredJWT() -> String {
        let payload = #"{"exp":1000000000}"# // 2001-09-09
        let encoded = Data(payload.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "header.\(encoded).signature"
    }

    override func setUp() {
        super.setUp()
        savedToken = APIClient.shared.authToken
        MessageSocketManager.shared.isCallActiveGuard = nil
        SocialSocketManager.shared.isCallActiveGuard = nil
        MessageSocketManager.shared.disconnect()
        SocialSocketManager.shared.disconnect()
        APIClient.shared.authToken = Self.expiredJWT()
    }

    override func tearDown() {
        // disconnect() → suspendTransport() cancels any armed retry, so no test
        // leaves a self-rescheduling task running into the next suite.
        MessageSocketManager.shared.disconnect()
        SocialSocketManager.shared.disconnect()
        APIClient.shared.authToken = savedToken
        super.tearDown()
    }

    // MARK: - connect() reports what it actually did

    func test_establishTransport_withExpiredToken_reportsNotArmed() {
        XCTAssertEqual(
            MessageSocketManager.shared.establishTransport(), .notArmed,
            "A connect that builds no socket must say so — the caller has to arm a retry"
        )
    }

    func test_establishTransport_withoutToken_reportsNotArmed() {
        APIClient.shared.authToken = nil
        XCTAssertEqual(MessageSocketManager.shared.establishTransport(), .notArmed)
    }

    func test_socialEstablishTransport_withExpiredToken_reportsNotArmed() {
        XCTAssertEqual(SocialSocketManager.shared.establishTransport(), .notArmed)
    }

    // MARK: - forceReconnect() covers a rebuild that produced nothing

    func test_forceReconnect_whenRebuildProducesNoTransport_armsRetry() {
        let sut = MessageSocketManager.shared
        XCTAssertFalse(sut.hasPendingReconnect, "Clean slate: nothing armed yet")

        sut.forceReconnect()

        XCTAssertTrue(
            sut.hasPendingReconnect,
            "The teardown already destroyed Socket.IO's retry loop; with no socket built, "
            + "the backoff ladder is the only thing left that can bring the app back"
        )
    }

    func test_socialForceReconnect_whenRebuildProducesNoTransport_armsRetry() {
        let sut = SocialSocketManager.shared
        XCTAssertFalse(sut.hasPendingReconnect)

        sut.forceReconnect()

        XCTAssertTrue(sut.hasPendingReconnect)
    }

    /// The retry ladder must not spin on a session the server already invalidated:
    /// `requireReauthentication` clears the token, and only a fresh login helps.
    func test_forceReconnect_withoutSession_doesNotArmRetry() {
        APIClient.shared.authToken = nil
        let sut = MessageSocketManager.shared

        sut.forceReconnect()

        XCTAssertFalse(
            sut.hasPendingReconnect,
            "A logged-out app must not schedule reconnect attempts that cannot succeed"
        )
    }

    // MARK: - Suppression during a call is not abandonment

    /// `forceReconnect()` is suppressed while a call is live so a token rotation
    /// never tears down the socket carrying WebRTC signaling. That is right while
    /// the socket is UP — but when it is already down, suppressing without arming
    /// a retry strands the very socket the call depends on.
    func test_forceReconnect_suppressedByActiveCall_whileDisconnected_stillArmsRetry() {
        let sut = MessageSocketManager.shared
        sut.isCallActiveGuard = { true }
        defer { sut.isCallActiveGuard = nil }

        XCTAssertFalse(sut.isConnected, "Precondition: disconnect() left us down")
        sut.forceReconnect()

        XCTAssertTrue(sut.hasPendingReconnect)
    }

    // MARK: - A successful connection clears the ladder

    func test_connectionEstablished_disarmsPendingRetry() {
        let sut = MessageSocketManager.shared
        sut.forceReconnect()
        XCTAssertTrue(sut.hasPendingReconnect)

        sut.handleConnectionEstablished()

        XCTAssertFalse(
            sut.hasPendingReconnect,
            "A landed connection must cancel the retry it no longer needs"
        )
    }
}
