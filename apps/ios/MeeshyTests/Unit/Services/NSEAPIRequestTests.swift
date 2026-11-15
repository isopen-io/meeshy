import XCTest
import MeeshySDK
@testable import Meeshy

/// La NSE précharge un post ou un message pour que le tap d'une notification
/// s'ouvre sur des données locales. Ce qu'elle dépose est ce que l'app PEINT :
/// si sa requête ne se présente pas comme l'app, la passerelle lui sert une
/// autre forme du contenu — la sentinelle « Mets à jour Meeshy » à la place du
/// canvas d'une story (#7804).
final class NSEAPIRequestTests: XCTestCase {

    private func makeRequest(method: String = "GET") -> URLRequest {
        NSEAPIRequest.make(
            url: URL(string: "https://gate.meeshy.me/api/v1/posts/65f0c0ffee0000000000abcd")!,
            token: "jwt-de-test",
            method: method
        )
    }

    func test_make_annonceLeNiveauDeCanvasQueLAppSaitLire() {
        XCTAssertEqual(makeRequest().value(forHTTPHeaderField: "X-Canvas-Caps"), "3")
    }

    func test_make_porteLIdentiteClienteValeurPourValeur() {
        let request = makeRequest()
        for (key, value) in ClientInfoProvider.identityHeaders() {
            XCTAssertEqual(request.value(forHTTPHeaderField: key), value, "En-tête absent ou divergent : \(key)")
        }
    }

    func test_make_porteLeJetonEtLeFormat() {
        let request = makeRequest()
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt-de-test")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
    }

    func test_make_post_declareSonCorpsJSON() {
        let request = makeRequest(method: "POST")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Canvas-Caps"), "3")
    }
}
