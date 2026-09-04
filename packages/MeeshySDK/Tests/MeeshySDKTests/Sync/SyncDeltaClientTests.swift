import XCTest
@testable import MeeshySDK

/// LE CLIENT `/sync` (#5089) — l'URL, les créances, et les TROIS issues, jamais
/// fondues l'une dans l'autre. Chaque forme opposée ici est celle que
/// `routes/sync/index.ts` sert, et l'ordre des paramètres celui du client web
/// (`delta-client.ts`) : deux clients, UNE forme.
final class SyncDeltaClientTests: XCTestCase {

    // MARK: - Mock (pattern maison : Result stubé + appels capturés)

    final class MockSyncDeltaTransport: SyncDeltaTransporting, @unchecked Sendable {
        var resultat: Result<(Data, HTTPURLResponse), Error> = .failure(URLError(.notConnectedToInternet))
        private(set) var requetes: [URLRequest] = []

        func executer(_ requete: URLRequest) async throws -> (Data, HTTPURLResponse) {
            requetes.append(requete)
            return try resultat.get()
        }
    }

    struct LigneDeTest: Decodable, Sendable, Equatable {
        let id: String
        let lastMessageAt: String?
    }

    private func reponse(_ statut: Int, entetes: [String: String] = [:]) -> HTTPURLResponse {
        HTTPURLResponse(
            url: URL(string: "https://gate.test/api/v1/sync")!,
            statusCode: statut,
            httpVersion: nil,
            headerFields: entetes
        )!
    }

    private func corpsDeDelta() -> Data {
        Data("""
        {
          "success": true,
          "data": {
            "checkpoint": "2026-09-04T08:00:00.000Z",
            "checkpointSeq": 42,
            "hasGap": true,
            "hasMore": false,
            "collections": {
              "conversations": {
                "added": [{ "id": "c1", "lastMessageAt": "2026-09-04T07:59:00.000Z" }],
                "modified": [],
                "deleted": ["c9"]
              }
            }
          }
        }
        """.utf8)
    }

    private func demande(
        _ transport: MockSyncDeltaTransport,
        requete: SyncDeltaRequest = SyncDeltaRequest(since: "2026-09-04T07:00:00.000Z", collections: ["conversations"]),
        creance: SyncDeltaCredential = .membre(jeton: "JWT.sonde")
    ) async -> SyncDeltaOutcome<LigneDeTest> {
        let client = SyncDeltaClient(baseURL: "https://gate.test", transport: transport)
        return await client.demandeLeDelta(requete, creance: creance, rangeant: LigneDeTest.self)
    }

    private func urlEnvoyee(_ transport: MockSyncDeltaTransport) -> URLComponents {
        URLComponents(url: transport.requetes[0].url!, resolvingAgainstBaseURL: false)!
    }

    private func parametre(_ transport: MockSyncDeltaTransport, _ nom: String) -> String? {
        urlEnvoyee(transport).queryItems?.first(where: { $0.name == nom })?.value
    }

    // MARK: - L'URL

    func test_url_porteSinceEtCollections_surLAdresseTypee() async {
        let transport = MockSyncDeltaTransport()
        transport.resultat = .success((corpsDeDelta(), reponse(200)))

        _ = await demande(transport)

        XCTAssertEqual(urlEnvoyee(transport).path, "/api/v1/sync")
        XCTAssertEqual(parametre(transport, "since"), "2026-09-04T07:00:00.000Z")
        XCTAssertEqual(parametre(transport, "collections"), "conversations")
    }

    func test_url_ometSeqScopeEtFields_quandLAppelantNEnAPas() async {
        let transport = MockSyncDeltaTransport()
        transport.resultat = .success((corpsDeDelta(), reponse(200)))

        _ = await demande(transport)

        XCTAssertNil(parametre(transport, "seq"))
        XCTAssertNil(parametre(transport, "scope"))
        XCTAssertNil(parametre(transport, "fields"))
    }

    func test_url_porteSeqScopeEtFields_quandLAppelantLesNomme() async {
        let transport = MockSyncDeltaTransport()
        transport.resultat = .success((corpsDeDelta(), reponse(200)))

        _ = await demande(
            transport,
            requete: SyncDeltaRequest(
                since: "s",
                collections: ["conversations", "messages"],
                scope: "c1",
                seq: 42,
                fields: ["conversations.id", "conversations.lastMessageAt"]
            )
        )

        XCTAssertEqual(parametre(transport, "collections"), "conversations,messages")
        XCTAssertEqual(parametre(transport, "scope"), "c1")
        XCTAssertEqual(parametre(transport, "seq"), "42")
        XCTAssertEqual(parametre(transport, "fields"), "conversations.id,conversations.lastMessageAt")
    }

    // MARK: - Les créances et le validateur

    func test_creanceDuMembre_partEnBearer_etLInviteEnSessionToken() async {
        let membre = MockSyncDeltaTransport()
        membre.resultat = .success((corpsDeDelta(), reponse(200)))
        _ = await demande(membre)
        XCTAssertEqual(membre.requetes[0].value(forHTTPHeaderField: "authorization"), "Bearer JWT.sonde")
        XCTAssertNil(membre.requetes[0].value(forHTTPHeaderField: "x-session-token"))

        let invite = MockSyncDeltaTransport()
        invite.resultat = .success((corpsDeDelta(), reponse(200)))
        _ = await demande(invite, creance: .invite(session: "session-tolu"))
        XCTAssertEqual(invite.requetes[0].value(forHTTPHeaderField: "x-session-token"), "session-tolu")
        XCTAssertNil(invite.requetes[0].value(forHTTPHeaderField: "authorization"))
    }

    func test_validateurDetenu_partEnIfNoneMatch_etSonAbsenceNEnvoieRien() async {
        let avec = MockSyncDeltaTransport()
        avec.resultat = .success((corpsDeDelta(), reponse(200)))
        _ = await demande(
            avec,
            requete: SyncDeltaRequest(since: "s", collections: ["conversations"], validateur: "\"v1\"")
        )
        XCTAssertEqual(avec.requetes[0].value(forHTTPHeaderField: "if-none-match"), "\"v1\"")

        let sans = MockSyncDeltaTransport()
        sans.resultat = .success((corpsDeDelta(), reponse(200)))
        _ = await demande(sans)
        XCTAssertNil(sans.requetes[0].value(forHTTPHeaderField: "if-none-match"))
    }

    // MARK: - Les trois issues

    func test_304_rendInchange_jamaisUnePanne() async {
        let transport = MockSyncDeltaTransport()
        transport.resultat = .success((Data(), reponse(304)))

        guard case .inchange = await demande(transport) else {
            return XCTFail("un 304 est « inchangé » — le fondre dans les pannes rend le cas invisible")
        }
    }

    func test_reseauTombe_refus_etCorpsIllisible_rendentMuet() async {
        let tombe = MockSyncDeltaTransport()
        guard case .muet = await demande(tombe) else { return XCTFail("réseau tombé ⇒ muet") }

        let refus = MockSyncDeltaTransport()
        refus.resultat = .success((Data("{\"success\":false}".utf8), reponse(401)))
        guard case .muet = await demande(refus) else { return XCTFail("401 ⇒ muet") }

        let illisible = MockSyncDeltaTransport()
        illisible.resultat = .success((Data("pas du json".utf8), reponse(200)))
        guard case .muet = await demande(illisible) else { return XCTFail("corps illisible ⇒ muet") }

        let sansSucces = MockSyncDeltaTransport()
        sansSucces.resultat = .success((Data("{\"success\":false,\"data\":null}".utf8), reponse(200)))
        guard case .muet = await demande(sansSucces) else { return XCTFail("success:false ⇒ muet") }
    }

    func test_200_rendLeDelta_cadreEtLignesTypees_etLitLeValidateurServi() async {
        let transport = MockSyncDeltaTransport()
        transport.resultat = .success((corpsDeDelta(), reponse(200, entetes: ["Etag": "\"v2\""])))

        guard case let .delta(delta, validateur) = await demande(transport) else {
            return XCTFail("un 200 décodable rend le delta")
        }

        XCTAssertEqual(delta.checkpoint, "2026-09-04T08:00:00.000Z")
        XCTAssertEqual(delta.checkpointSeq, 42)
        XCTAssertTrue(delta.hasGap)
        XCTAssertFalse(delta.hasMore)
        XCTAssertEqual(
            delta.collections["conversations"]?.added,
            [LigneDeTest(id: "c1", lastMessageAt: "2026-09-04T07:59:00.000Z")]
        )
        XCTAssertEqual(delta.collections["conversations"]?.deleted, ["c9"])
        XCTAssertEqual(validateur, "\"v2\"")
    }
}
