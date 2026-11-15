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

    func test_bothSocketManagers_handOverTheServerDisconnectDecisionToTheirLifecycleMethod() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets")
        for file in ["MessageSocketManager.swift", "SocialSocketManager.swift"] {
            let source = try String(contentsOf: root.appendingPathComponent(file), encoding: .utf8)
            let handler = try XCTUnwrap(source.range(of: "socket.on(clientEvent: .disconnect)"), file)
            let body = String(source[handler.upperBound...].prefix(1_200))
            XCTAssertTrue(body.contains("SocketDisconnectPolicy.retries(afterReason:"), file)
            XCTAssertTrue(body.contains("self.handleTransportDisconnected(retries: retries)"), "l'armement se prouve par `SocketConnectionLifecycleTests` — \(file)")
            XCTAssertTrue(body.contains("socket === self.socket"), "seul le socket courant réarme — \(file)")
        }
    }
}
