import XCTest
import MeeshySDK

/// `ShareSender` n'exécute aucune requête : il CONSTRUIT la requête et DÉCIDE
/// de l'issue à partir du couple (statut, erreur). Les deux sont des fonctions
/// pures, donc testables sans réseau ni serveur.
final class ShareSenderTests: XCTestCase {

    private let session = ShareSession(
        userId: "u1",
        token: "jwt-abc",
        apiBaseURL: "https://gate.meeshy.me"
    )

    // MARK: - clientMessageId

    /// Le gateway dédoublonne sur `clientMessageId` via index unique (contrat
    /// Phase 4). Un format non conforme casserait ce dédoublonnage, donc le
    /// rejeu d'un envoi différé produirait un doublon.
    func test_makeClientMessageId_matchesTheCanonicalFormat() {
        for _ in 0..<20 {
            let cmid = ShareSender.makeClientMessageId()
            XCTAssertTrue(
                ClientMessageId.isValid(cmid),
                "\(cmid) doit valider le regex partagé cid_<uuid v4 lowercase>"
            )
        }
    }

    func test_makeClientMessageId_isUniquePerCall() {
        let ids = Set((0..<50).map { _ in ShareSender.makeClientMessageId() })
        XCTAssertEqual(ids.count, 50)
    }

    // MARK: - Composition du contenu

    func test_composeContent_urlOnly_usesTheURL() {
        XCTAssertEqual(
            ShareSender.composeContent(text: nil, url: URL(string: "https://exemple.fr/a")),
            "https://exemple.fr/a"
        )
    }

    func test_composeContent_textOnly_usesTheText() {
        XCTAssertEqual(ShareSender.composeContent(text: "une note", url: nil), "une note")
    }

    /// Safari fournit le titre de la page ET son URL : les deux portent une
    /// information distincte, on ne sacrifie ni l'une ni l'autre.
    func test_composeContent_titleAndURL_keepsBoth() {
        XCTAssertEqual(
            ShareSender.composeContent(text: "Un article", url: URL(string: "https://exemple.fr/a")),
            "Un article\nhttps://exemple.fr/a"
        )
    }

    /// Quand le « texte » n'est que l'URL répétée, ne pas l'écrire deux fois.
    func test_composeContent_textEqualToURL_isNotDuplicated() {
        XCTAssertEqual(
            ShareSender.composeContent(
                text: "https://exemple.fr/a",
                url: URL(string: "https://exemple.fr/a")
            ),
            "https://exemple.fr/a"
        )
    }

    func test_composeContent_blankText_isIgnored() {
        XCTAssertEqual(
            ShareSender.composeContent(text: "   \n ", url: URL(string: "https://exemple.fr/a")),
            "https://exemple.fr/a"
        )
    }

    func test_composeContent_nothingUsable_isNil() {
        XCTAssertNil(ShareSender.composeContent(text: nil, url: nil))
        XCTAssertNil(ShareSender.composeContent(text: "   ", url: nil))
    }

    // MARK: - Requête

    func test_request_targetsTheVersionedMessagesEndpoint() throws {
        let request = try XCTUnwrap(ShareSender.request(
            conversationId: "conv42",
            clientMessageId: "cid_00000000-0000-4000-8000-000000000000",
            content: "bonjour",
            session: session
        ))

        XCTAssertEqual(
            request.url?.absoluteString,
            "https://gate.meeshy.me/api/v1/conversations/conv42/messages"
        )
        XCTAssertEqual(request.httpMethod, "POST")
    }

    func test_request_carriesBearerTokenAndJSONContentType() throws {
        let request = try XCTUnwrap(ShareSender.request(
            conversationId: "conv42",
            clientMessageId: "cid_00000000-0000-4000-8000-000000000000",
            content: "bonjour",
            session: session
        ))

        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt-abc")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
    }

    /// Le corps doit contenir EXACTEMENT les deux champs du contrat, sans
    /// champ parasite : `SendMessageRequest` omet ses optionnels nuls, donc
    /// c'est bien ce que l'app envoie aujourd'hui pour un message texte.
    func test_request_bodyCarriesExactlyClientMessageIdAndContent() throws {
        let request = try XCTUnwrap(ShareSender.request(
            conversationId: "conv42",
            clientMessageId: "cid_00000000-0000-4000-8000-000000000000",
            content: "bonjour",
            session: session
        ))
        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any]
        )

        XCTAssertEqual(Set(json.keys), ["clientMessageId", "content"])
        XCTAssertEqual(json["clientMessageId"] as? String, "cid_00000000-0000-4000-8000-000000000000")
        XCTAssertEqual(json["content"] as? String, "bonjour")
    }

    func test_request_escapesContentRatherThanInterpolatingIt() throws {
        let hostile = "\"quote\" \\backslash\\ \n saut"
        let request = try XCTUnwrap(ShareSender.request(
            conversationId: "conv42",
            clientMessageId: "cid_00000000-0000-4000-8000-000000000000",
            content: hostile,
            session: session
        ))
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any]
        )

        XCTAssertEqual(json["content"] as? String, hostile)
    }

    // MARK: - Issue

    func test_outcome_on2xx_isSent() {
        for status in [200, 201, 202, 204] {
            XCTAssertEqual(ShareSender.outcome(statusCode: status, error: nil), .sent, "statut \(status)")
        }
    }

    /// Un 401 signifie token périmé : différer plutôt que perdre. L'app
    /// rafraîchira la session et l'outbox rejouera.
    func test_outcome_onUnauthorized_isDeferred() {
        XCTAssertEqual(ShareSender.outcome(statusCode: 401, error: nil), .deferred)
    }

    func test_outcome_onServerError_isDeferred() {
        for status in [400, 403, 404, 429, 500, 502, 503] {
            XCTAssertEqual(ShareSender.outcome(statusCode: status, error: nil), .deferred, "statut \(status)")
        }
    }

    func test_outcome_onTransportError_isDeferred() {
        let offline = URLError(.notConnectedToInternet)
        XCTAssertEqual(ShareSender.outcome(statusCode: nil, error: offline), .deferred)
    }

    func test_outcome_withoutResponseOrError_isDeferred() {
        XCTAssertEqual(ShareSender.outcome(statusCode: nil, error: nil), .deferred)
    }

    /// Une erreur de transport prime sur un statut : si les deux sont présents,
    /// la réponse n'est pas digne de confiance.
    func test_outcome_errorWinsOverSuccessStatus() {
        XCTAssertEqual(
            ShareSender.outcome(statusCode: 200, error: URLError(.networkConnectionLost)),
            .deferred
        )
    }
}
