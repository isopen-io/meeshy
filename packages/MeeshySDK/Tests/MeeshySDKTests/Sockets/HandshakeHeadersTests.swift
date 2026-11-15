import XCTest
@testable import MeeshySDK

/// Le handshake porte le jeton de SESSION, pas seulement le JWT (#4213).
///
/// Un socket inscrit s'authentifiait au JWT SEUL. `UserSession.sessionToken`
/// stocke le hash d'un jeton opaque que rien n'obligeait à transmettre : le
/// serveur n'avait donc AUCUN moyen de dire quel socket appartient à quelle
/// session. Révoquer une session passait la ligne à `isValid: false` et
/// l'appareil continuait de tout recevoir — `message:new`,
/// `conversation:updated` — indéfiniment, un socket n'étant authentifié qu'une
/// fois, au connect, et jamais revérifié.
final class HandshakeHeadersTests: XCTestCase {

    func test_carriesTheJWT_asItAlwaysDid() {
        let headers = MessageSocketManager.handshakeHeaders(token: "jwt-123", sessionToken: nil)

        XCTAssertEqual(headers["Authorization"], "Bearer jwt-123")
    }

    func test_carriesTheSessionToken_soARevocationCanTargetThisSocket() {
        let headers = MessageSocketManager.handshakeHeaders(token: "jwt-123", sessionToken: "sess-abc")

        // En MINUSCULES : le serveur lit `x-session-token`, la même clé que les
        // appels REST, via `extractSessionToken`.
        XCTAssertEqual(headers["x-session-token"], "sess-abc")
        XCTAssertEqual(headers["Authorization"], "Bearer jwt-123")
    }

    func test_omitsTheKeyEntirely_whenThereIsNoSession() {
        // Jamais une clé vide : côté serveur, `extractSessionToken` rendrait une
        // chaîne vide, dont le hash ne correspond à aucune ligne — une lecture
        // pour rien à chaque connexion.
        XCTAssertNil(MessageSocketManager.handshakeHeaders(token: "jwt", sessionToken: nil)["x-session-token"])
        XCTAssertNil(MessageSocketManager.handshakeHeaders(token: "jwt", sessionToken: "")["x-session-token"])
    }
}
