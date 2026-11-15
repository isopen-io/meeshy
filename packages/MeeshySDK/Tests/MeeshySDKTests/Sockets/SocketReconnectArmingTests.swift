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

    /// La PAIRE, pas le seul JWT (#16750). Les deux jetons sont des champs
    /// distincts, et depuis que la reconstruction route sur le credential, un
    /// `anonymousSessionToken` laissé par une suite voisine ferait de
    /// « sans session » un invité — ces témoins cesseraient de dire ce que leur
    /// intitulé promet, sans rien signaler.
    private var savedTokens: (auth: String?, anon: String?) = (nil, nil)

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
        savedTokens = APIClient.shared.currentTokens()
        MessageSocketManager.shared.isCallActiveGuard = nil
        SocialSocketManager.shared.isCallActiveGuard = nil
        MessageSocketManager.shared.disconnect()
        SocialSocketManager.shared.disconnect()
        APIClient.shared.setTokens(auth: Self.expiredJWT(), anonymous: nil)
    }

    override func tearDown() {
        // disconnect() → suspendTransport() cancels any armed retry, so no test
        // leaves a self-rescheduling task running into the next suite.
        MessageSocketManager.shared.disconnect()
        SocialSocketManager.shared.disconnect()
        APIClient.shared.setTokens(auth: savedTokens.auth, anonymous: savedTokens.anon)
        super.tearDown()
    }

    // MARK: - connect() reports what it actually did

    func test_establishTransport_withExpiredToken_reportsNotArmed() {
        XCTAssertEqual(
            MessageSocketManager.shared.establishTransport(), .notArmed,
            "A connect that builds no socket must say so — the caller has to arm a retry"
        )
    }

    /// Sans AUCUN credential. La paire se pose d'un seul tenant (#16750) : un
    /// `anonymousSessionToken` résiduel ferait de ce témoin un témoin d'INVITÉ,
    /// qui bâtit un transport et rendrait `.armed` — vert ou rouge selon
    /// l'ordre des suites, ce qui est pire que les deux.
    func test_establishTransport_withoutAnyCredential_reportsNotArmed() {
        APIClient.shared.setTokens(auth: nil, anonymous: nil)
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
        // AUCUN credential : ni compte, ni invité. C'est ce que « sans session »
        // veut dire, et le poser explicitement est ce qui garde ce témoin de
        // dériver vers « sans JWT » (#16750).
        APIClient.shared.setTokens(auth: nil, anonymous: nil)
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

/// Un salon de publication se tient par ÉCRAN : la feuille de commentaires fermée par-dessus un réel ne doit pas
/// faire quitter le salon que le réel, resté visible, tient encore.
@MainActor
final class SocialPostRoomHoldingTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        SocialSocketManager.shared.disconnect()
    }

    override func tearDown() async throws {
        SocialSocketManager.shared.disconnect()
        try await super.tearDown()
    }

    func test_aRoomHeldByTwoScreens_survivesTheFirstLeave() {
        let sut = SocialSocketManager.shared
        sut.joinPostRoom(postId: "reel-1")       // le lecteur de réels
        sut.joinPostRoom(postId: "reel-1")       // la feuille de commentaires
        sut.leavePostRoom(postId: "reel-1")      // la feuille se ferme
        XCTAssertEqual(sut.postRoomsToRejoinOnConnect(), ["reel-1"], "le réel visible tient toujours son salon")
        sut.leavePostRoom(postId: "reel-1")
        XCTAssertEqual(sut.postRoomsToRejoinOnConnect(), [])
    }

    func test_anUnheldRoom_leavesNothingBehind() {
        let sut = SocialSocketManager.shared
        sut.leavePostRoom(postId: "ghost")
        sut.joinPostRoom(postId: "a")
        sut.leavePostRoom(postId: "a")
        sut.leavePostRoom(postId: "a")
        XCTAssertEqual(sut.postRoomsToRejoinOnConnect(), [])
    }
}
