import XCTest
@testable import MeeshySDK

/// #10442 — la passerelle termine la session d'un invité de lien par
/// `403 SHARE_LINK_EXPIRED` (REST, et `error { code }` avant de couper le
/// socket) ou par `410 GUEST_ACCESS_REVOKED`. Ces refus ne se retentent pas :
/// le transport les signale, le socket arrête ses reconnexions. Tout autre
/// refus passe sans bruit.
final class GuestSessionEndTests: XCTestCase {

    /// #10854 — les sockets de cette suite s'arment contre le loopback, dont
    /// le sondage tombe sous le sceau réseau : aucune ne joint un serveur.
    override func invokeTest() {
        SocketConfig.$loopbackOrigin.withValue(URL(string: "http://127.0.0.1:9")) { super.invokeTest() }
    }

    private final class Received: @unchecked Sendable {
        var notifications: [Notification] = []
    }

    private func observe(_ center: NotificationCenter) -> (Received, NSObjectProtocol) {
        let received = Received()
        let token = center.addObserver(forName: .meeshyGuestSessionEnded, object: nil, queue: nil) { note in
            received.notifications.append(note)
        }
        return (received, token)
    }

    private func body(_ json: String) -> Data { Data(json.utf8) }

    // MARK: - La loi

    func test_fromCode_theTwoGuestCodes_endTheSession() {
        XCTAssertEqual(GuestSessionEnd.from(code: "SHARE_LINK_EXPIRED"), .linkExpired)
        XCTAssertEqual(GuestSessionEnd.from(code: "GUEST_ACCESS_REVOKED"), .accessRevoked)
    }

    func test_fromCode_anyOtherCode_endsNothing() {
        XCTAssertNil(GuestSessionEnd.from(code: nil))
        XCTAssertNil(GuestSessionEnd.from(code: ""))
        XCTAssertNil(GuestSessionEnd.from(code: "AGE_BELOW_MINIMUM"))
        XCTAssertNil(GuestSessionEnd.from(code: "LINK_DEACTIVATED"))
        XCTAssertNil(GuestSessionEnd.from(code: "share_link_expired"))
    }

    func test_fromResponse_expiredLink_readsTheCodeOfTheForbiddenEnvelope() {
        let end = GuestSessionEnd.from(
            statusCode: 403,
            body: body(#"{"success":false,"error":"This share link has expired","code":"SHARE_LINK_EXPIRED"}"#)
        )
        XCTAssertEqual(end, .linkExpired)
    }

    func test_fromResponse_revokedAccess_readsTheCodeCarriedByError() {
        let end = GuestSessionEnd.from(
            statusCode: 410,
            body: body(#"{"success":false,"error":"GUEST_ACCESS_REVOKED","message":"L'acces de cet invite a ete retire"}"#)
        )
        XCTAssertEqual(end, .accessRevoked)
    }

    func test_fromResponse_aCodeUnderAnotherStatus_endsNothing() {
        XCTAssertNil(GuestSessionEnd.from(statusCode: 410, body: body(#"{"code":"SHARE_LINK_EXPIRED"}"#)))
        XCTAssertNil(GuestSessionEnd.from(statusCode: 403, body: body(#"{"error":"GUEST_ACCESS_REVOKED"}"#)))
        XCTAssertNil(GuestSessionEnd.from(statusCode: 401, body: body(#"{"code":"SHARE_LINK_EXPIRED"}"#)))
    }

    func test_fromResponse_anotherRefusal_endsNothing() {
        XCTAssertNil(GuestSessionEnd.from(statusCode: 403, body: body(#"{"success":false,"error":"Access denied","code":"NOT_A_PARTICIPANT"}"#)))
        XCTAssertNil(GuestSessionEnd.from(statusCode: 410, body: body(#"{"success":false,"error":"LINK_DEACTIVATED"}"#)))
        XCTAssertNil(GuestSessionEnd.from(statusCode: 403, body: nil))
        XCTAssertNil(GuestSessionEnd.from(statusCode: 403, body: body("not json")))
    }

    func test_fromSocketPayload_expiredLinkError_endsTheSession() {
        let payload: [Any] = [["message": "This share link has expired", "code": "SHARE_LINK_EXPIRED"]]
        XCTAssertEqual(GuestSessionEnd.from(socketErrorPayload: payload), .linkExpired)
    }

    func test_fromSocketPayload_anyOtherError_endsNothing() {
        XCTAssertNil(GuestSessionEnd.from(socketErrorPayload: [["message": "Anonymous session not found"]]))
        XCTAssertNil(GuestSessionEnd.from(socketErrorPayload: [["code": "AUTH_FAILED"]]))
        XCTAssertNil(GuestSessionEnd.from(socketErrorPayload: ["Transport error"]))
        XCTAssertNil(GuestSessionEnd.from(socketErrorPayload: []))
    }

    func test_statusCode_isTheOneTheGatewaySends() {
        XCTAssertEqual(GuestSessionEnd.linkExpired.statusCode, 403)
        XCTAssertEqual(GuestSessionEnd.accessRevoked.statusCode, 410)
    }

    // MARK: - Le signal

    func test_signal_recognisedRefusal_postsTheEndAndTheRefusedToken() {
        let center = NotificationCenter()
        let (received, token) = observe(center)
        defer { center.removeObserver(token) }

        let end = GuestSessionEnd.signal(
            statusCode: 410,
            body: body(#"{"success":false,"error":"GUEST_ACCESS_REVOKED"}"#),
            refusedSessionToken: "anon_abc",
            center: center
        )

        XCTAssertEqual(end, .accessRevoked)
        XCTAssertEqual(received.notifications.count, 1)
        let note = received.notifications.first
        XCTAssertEqual(note.flatMap { GuestSessionEnd(notification: $0) }, .accessRevoked)
        XCTAssertEqual(note.flatMap { GuestSessionEnd.refusedSessionToken(in: $0) }, "anon_abc")
    }

    func test_signal_otherRefusal_postsNothing() {
        let center = NotificationCenter()
        let (received, token) = observe(center)
        defer { center.removeObserver(token) }

        let end = GuestSessionEnd.signal(
            statusCode: 403,
            body: body(#"{"code":"NOT_A_PARTICIPANT"}"#),
            refusedSessionToken: "anon_abc",
            center: center
        )

        XCTAssertNil(end)
        XCTAssertTrue(received.notifications.isEmpty)
    }

    func test_signal_withoutToken_namesNoSession() {
        let center = NotificationCenter()
        let (received, token) = observe(center)
        defer { center.removeObserver(token) }

        GuestSessionEnd.linkExpired.signal(center: center)

        let note = received.notifications.first
        XCTAssertEqual(note.flatMap { GuestSessionEnd(notification: $0) }, .linkExpired)
        XCTAssertNil(note.flatMap { GuestSessionEnd.refusedSessionToken(in: $0) })
    }

    func test_initFromNotification_foreignNotification_isNil() {
        XCTAssertNil(GuestSessionEnd(notification: Notification(name: .meeshyAgeBelowMinimum, userInfo: ["end": "linkExpired"])))
        XCTAssertNil(GuestSessionEnd(notification: Notification(name: .meeshyGuestSessionEnded, userInfo: ["end": "nope"])))
    }

    // MARK: - Le socket s'arrête

    func test_socketError_expiredLink_tearsTheTransportDownAndSignals() {
        let center = NotificationCenter()
        let (received, token) = observe(center)
        defer {
            center.removeObserver(token)
            MessageSocketManager.shared.disconnect()
        }
        MessageSocketManager.shared.disconnect()
        MessageSocketManager.shared.connectAnonymous(sessionToken: "anon_expired")
        XCTAssertNotNil(MessageSocketManager.shared.socket, "précondition : un transport invité existe")

        let end = MessageSocketManager.shared.handleSocketError(
            [["message": "This share link has expired", "code": "SHARE_LINK_EXPIRED"]],
            center: center
        )

        XCTAssertEqual(end, .linkExpired)
        XCTAssertNil(MessageSocketManager.shared.socket, "le transport — et la boucle de reconnexion de Socket.IO — est démonté")
        XCTAssertFalse(MessageSocketManager.shared.hasPendingReconnect)
        XCTAssertEqual(received.notifications.compactMap { GuestSessionEnd(notification: $0) }, [.linkExpired])
    }

    func test_socketError_ordinaryError_keepsTheTransportAndSignalsNothing() {
        let center = NotificationCenter()
        let (received, token) = observe(center)
        defer {
            center.removeObserver(token)
            MessageSocketManager.shared.disconnect()
        }
        MessageSocketManager.shared.disconnect()
        MessageSocketManager.shared.connectAnonymous(sessionToken: "anon_live")

        let end = MessageSocketManager.shared.handleSocketError([["message": "Transport error"]], center: center)

        XCTAssertNil(end)
        XCTAssertNotNil(MessageSocketManager.shared.socket)
        XCTAssertTrue(received.notifications.isEmpty)
    }

    // MARK: - Le câblage

    private func source(_ relativePath: String) throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent(relativePath),
            encoding: .utf8
        )
    }

    func test_transport_signalsOnlyARequestThatCarriedAGuestToken() throws {
        let api = try source("Sources/MeeshySDK/Networking/APIClient+Perform.swift")
        XCTAssertTrue(api.contains(#"if let guestToken = urlRequest.value(forHTTPHeaderField: "X-Session-Token") { GuestSessionEnd.signal(statusCode: statusCode, body: data, refusedSessionToken: guestToken) }"#))
    }

    func test_socket_errorEventIsReadByTheGuestLaw() throws {
        let socket = try source("Sources/MeeshySDK/Sockets/MessageSocketManager+EventHandlers.swift")
        XCTAssertTrue(socket.contains("socket.on(clientEvent: .error) { [weak self] data, _ in"))
        XCTAssertTrue(socket.contains("self?.handleSocketError(data)"))
    }
}
