import XCTest
import MeeshySDK
@testable import Meeshy

/// La vérification de fraîcheur d'un appel VoIP interroge la passerelle hors
/// `APIClient`. Tant qu'elle écrivait sa requête à la main, elle ne portait
/// que `Authorization` et `Accept` : ni la porte de version (`X-App-*`), ni la
/// locale, ni `X-Canvas-Caps` — la passerelle ne la reconnaissait pas comme
/// l'app (#7817).
final class VoIPFreshnessRequestTests: XCTestCase {

    private func makeRequest(
        callId: String = "65f0c0ffee0000000000abcd",
        headers: [String: String] = ClientInfoProvider.identityHeaders()
    ) -> URLRequest? {
        VoIPFreshnessRequest.make(
            callId: callId,
            token: "jwt-de-test",
            baseURL: "https://gate.meeshy.me/api/v1",
            clientHeaders: headers,
            timeout: 4
        )
    }

    func test_make_annonceLeNiveauDeCanvasQueLAppSaitLire() {
        XCTAssertEqual(makeRequest()?.value(forHTTPHeaderField: "X-Canvas-Caps"), "3")
    }

    func test_make_porteLIdentiteClienteValeurPourValeur() throws {
        let headers = ClientInfoProvider.identityHeaders()
        let request = try XCTUnwrap(makeRequest(headers: headers))
        XCTAssertFalse(headers.isEmpty)
        for (key, value) in headers {
            XCTAssertEqual(request.value(forHTTPHeaderField: key), value, "En-tête absent ou divergent : \(key)")
        }
    }

    func test_make_porteLeJetonEtLeFormat() throws {
        let request = try XCTUnwrap(makeRequest())
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt-de-test")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.timeoutInterval, 4)
    }

    func test_make_leJetonDuClientNeSeLaissePasEcraserParUnEnTeteFourni() throws {
        let request = try XCTUnwrap(makeRequest(headers: ["Authorization": "Bearer autre"]))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt-de-test")
    }

    func test_make_viseLAppelDemande() throws {
        let request = try XCTUnwrap(makeRequest())
        XCTAssertEqual(request.url?.absoluteString, "https://gate.meeshy.me/api/v1/calls/65f0c0ffee0000000000abcd")
    }

    func test_leReveilVoIP_passeLIdentiteDeLAppAuConstructeur() throws {
        let path = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Call/Services/CallCollaborators/CallIncomingRing.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: path, encoding: .utf8))
        let call = try XCTUnwrap(code.range(of: "VoIPFreshnessRequest.make("), "La vérification ne passe plus par le constructeur")
        let tail = code[call.upperBound...]
        let closing = try XCTUnwrap(tail.range(of: ") else {"))
        let arguments = tail[..<closing.lowerBound]
        XCTAssertTrue(
            arguments.contains("clientHeaders: await ClientInfoProvider.shared.buildHeaders()"),
            "La requête de fraîcheur doit porter l'identité de l'app"
        )
        XCTAssertFalse(code.contains("URLRequest(url"), "Une requête écrite à la main contourne l'identité cliente")
    }
}
