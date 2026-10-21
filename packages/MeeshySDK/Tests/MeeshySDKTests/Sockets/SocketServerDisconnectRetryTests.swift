import XCTest
@testable import MeeshySDK

/// **La passerelle a fermé la connexion : l'app la rouvre.**
///
/// `socket.disconnect(true)` côté passerelle (erreur passagère à
/// l'authentification, jeton expiré, redémarrage) arrive en `"Got Disconnect"`,
/// que Socket.IO-Swift ne rattrape pas. Rien ne réarmait l'échelle de
/// reconnexion : un iPad laissé au premier plan restait « reconnexion… » jusqu'au
/// prochain retour d'arrière-plan ou changement de réseau.
final class SocketServerDisconnectRetryTests: XCTestCase {

    func test_policy_retriesOnlyWhatTheServerDecided() {
        XCTAssertTrue(SocketDisconnectPolicy.retries(afterReason: "Got Disconnect"))
        XCTAssertTrue(SocketDisconnectPolicy.retries(afterReason: "Reconnect Failed"))
        XCTAssertFalse(SocketDisconnectPolicy.retries(afterReason: "Namespace leave"), "mise en arrière-plan, déconnexion")
        XCTAssertFalse(SocketDisconnectPolicy.retries(afterReason: "Disconnect"))
        XCTAssertFalse(SocketDisconnectPolicy.retries(afterReason: nil))
        XCTAssertEqual(SocketDisconnectPolicy.reason(in: ["Got Disconnect"]), "Got Disconnect")
        XCTAssertNil(SocketDisconnectPolicy.reason(in: []))
    }

    func test_bothSocketManagers_armTheirRetryOnAServerDisconnect() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets")
        for file in ["MessageSocketManager.swift", "SocialSocketManager.swift"] {
            let source = try String(contentsOf: root.appendingPathComponent(file), encoding: .utf8)
            let handler = try XCTUnwrap(source.range(of: "socket.on(clientEvent: .disconnect)"), file)
            let body = String(source[handler.upperBound...].prefix(1_200))
            XCTAssertTrue(body.contains("SocketDisconnectPolicy.retries(afterReason:"), file)
            XCTAssertTrue(body.contains("self.scheduleReconnectWithBackoff()"), file)
            XCTAssertTrue(body.contains("socket === self.socket"), "seul le socket courant réarme — \(file)")
        }
    }
}

/// Un `forceReconnect` retire le transport courant ; s'il était déjà dans sa
/// boucle de reconnexion (réseau coupé), elle continuait sans fin. Les tests
/// scellent le transport (`SocketConfig.isTransportSealed`) : aucun socket ne
/// s'y construit, la règle se lit donc à la source.
final class SocketRetiredTransportTests: XCTestCase {

    func test_retiredTransport_losesItsReconnectLoop_andClosesAfterTheGrace() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets")
        let retireDeclarations = [
            "SocketTransportRetirement.swift": "func retire(_ transport: SocketManager?) {",
        ]
        for (file, declaration) in retireDeclarations {
            let source = try String(contentsOf: root.appendingPathComponent(file), encoding: .utf8)
            let start = try XCTUnwrap(source.range(of: declaration), file)
            let body = String(source[start.upperBound...].prefix(1_400))
            XCTAssertTrue(body.contains("retiring.reconnects = false"), file)
            XCTAssertTrue(body.contains(".forEach { $0.disconnect() }"), file)
        }
    }
}
