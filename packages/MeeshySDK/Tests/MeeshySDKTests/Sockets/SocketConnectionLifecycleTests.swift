import XCTest
@testable import MeeshySDK

/// Le cycle de vie d'une socket se lit sans transport vivant : chaque événement client de Socket.IO
/// (`.connect`, `.disconnect`, `.reconnect`, `.reconnectAttempt`) délègue à UNE méthode, qui se pilote ici.
/// L'état publié ne bouge qu'après le saut vers le fil principal, dans l'ordre des événements.
final class SocketConnectionLifecycleTests: XCTestCase {

    private var savedToken: String?

    override func setUp() {
        super.setUp()
        savedToken = APIClient.shared.authToken
        APIClient.shared.authToken = "lifecycle-session-token"
        MessageSocketManager.shared.disconnect()
        SocialSocketManager.shared.disconnect()
    }

    override func tearDown() {
        MessageSocketManager.shared.disconnect()
        SocialSocketManager.shared.disconnect()
        APIClient.shared.authToken = savedToken
        super.tearDown()
    }

    private func settleMainHops() async {
        await MainActor.run {}
        await MainActor.run {}
    }

    // MARK: - MessageSocketManager

    func test_message_transportLost_marksDisconnectedThenReconnecting() async {
        let sut = MessageSocketManager.shared
        sut.handleConnectionEstablished()
        await settleMainHops()
        sut.handleTransportConnected()
        await settleMainHops()
        XCTAssertTrue(sut.isConnected)

        sut.handleTransportLost()
        await settleMainHops()

        XCTAssertFalse(sut.isConnected)
        XCTAssertEqual(sut.connectionState, .reconnecting(attempt: 0))
    }

    func test_message_reconnectAttempt_countsEachAttempt() async {
        let sut = MessageSocketManager.shared

        sut.handleReconnectAttempt()
        sut.handleReconnectAttempt()
        await settleMainHops()

        XCTAssertEqual(sut.connectionState, .reconnecting(attempt: 2))
    }

    func test_message_disconnectedWithRetries_armsTheBackoffLadder() async {
        let sut = MessageSocketManager.shared

        sut.handleTransportDisconnected(retries: true)
        await settleMainHops()

        XCTAssertTrue(sut.hasPendingReconnect)
    }

    func test_message_disconnectedWithoutRetries_armsNothing() async {
        let sut = MessageSocketManager.shared

        sut.handleTransportDisconnected(retries: false)
        await settleMainHops()

        XCTAssertFalse(sut.hasPendingReconnect)
        XCTAssertEqual(sut.connectionState, .disconnected)
    }

    func test_message_disconnectedAfterAPreviousConnection_reportsReconnecting() async {
        let sut = MessageSocketManager.shared
        sut.handleConnectionEstablished()

        sut.handleTransportDisconnected(retries: false)
        await settleMainHops()

        XCTAssertEqual(sut.connectionState, .reconnecting(attempt: 0))
    }

    // MARK: - SocialSocketManager

    func test_social_transportLost_marksDisconnectedThenReconnecting() async {
        let sut = SocialSocketManager.shared
        sut.handleTransportConnected()
        await settleMainHops()
        XCTAssertTrue(sut.isConnected)

        sut.handleTransportLost()
        await settleMainHops()

        XCTAssertFalse(sut.isConnected)
        XCTAssertEqual(sut.connectionState, .reconnecting(attempt: 0))
    }

    func test_social_reconnectAttempt_countsEachAttempt() async {
        let sut = SocialSocketManager.shared

        sut.handleReconnectAttempt()
        sut.handleReconnectAttempt()
        await settleMainHops()

        XCTAssertEqual(sut.connectionState, .reconnecting(attempt: 2))
    }

    func test_social_disconnectedWithRetries_armsTheBackoffLadder() async {
        let sut = SocialSocketManager.shared

        sut.handleTransportDisconnected(retries: true)
        await settleMainHops()

        XCTAssertTrue(sut.hasPendingReconnect)
    }

    func test_social_disconnectedWithoutRetries_armsNothing() async {
        let sut = SocialSocketManager.shared

        sut.handleTransportDisconnected(retries: false)
        await settleMainHops()

        XCTAssertFalse(sut.hasPendingReconnect)
        XCTAssertEqual(sut.connectionState, .disconnected)
    }
}
