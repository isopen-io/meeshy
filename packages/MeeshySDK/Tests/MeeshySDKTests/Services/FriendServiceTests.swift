import XCTest
@testable import MeeshySDK

final class FriendServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: FriendService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = FriendService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeFriendRequest(id: String = "fr-1", status: String = "pending") -> FriendRequest {
        let json: [String: Any] = [
            "id": id,
            "senderId": "user-1",
            "receiverId": "user-2",
            "status": status,
            "createdAt": "2026-01-01T00:00:00Z"
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(FriendRequest.self, from: data)
    }

    // MARK: - sendFriendRequest

    func test_sendFriendRequest_success_callsPostEndpoint() async throws {
        let fr = makeFriendRequest()
        let response = APIResponse<FriendRequest>(success: true, data: fr, error: nil)
        mock.stub("/directory/friend-requests", result: response)

        let result = try await service.sendFriendRequest(receiverId: "user-2", message: "Hi!")

        XCTAssertEqual(mock.requestCount, 1)
        // L'unique chemin d'envoi (#4162) : celui que ce site appelait était le
        // plus faible des deux qui coexistaient — ni auto-envoi, ni
        // désactivation, ni blocage.
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.id, "fr-1")
        XCTAssertEqual(result.status, "pending")
    }

    func test_sendFriendRequest_withoutMessage_succeeds() async throws {
        let fr = makeFriendRequest()
        let response = APIResponse<FriendRequest>(success: true, data: fr, error: nil)
        mock.stub("/directory/friend-requests", result: response)

        let result = try await service.sendFriendRequest(receiverId: "user-2")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(result.senderId, "user-1")
    }

    // MARK: - receivedRequests

    func test_receivedRequests_success_callsCorrectEndpoint() async throws {
        let fr = makeFriendRequest()
        let pagination = OffsetPagination(total: 1, hasMore: false, limit: 20, offset: 0)
        let response = OffsetPaginatedAPIResponse<[FriendRequest]>(
            success: true, data: [fr], pagination: pagination, error: nil
        )
        mock.stub("/friend-requests/received", result: response)

        let result = try await service.receivedRequests()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/friend-requests/received")
        XCTAssertEqual(result.data.count, 1)
    }

    // MARK: - sentRequests

    func test_sentRequests_success_callsCorrectEndpoint() async throws {
        let fr = makeFriendRequest()
        let pagination = OffsetPagination(total: 1, hasMore: false, limit: 20, offset: 0)
        let response = OffsetPaginatedAPIResponse<[FriendRequest]>(
            success: true, data: [fr], pagination: pagination, error: nil
        )
        mock.stub("/friend-requests/sent", result: response)

        let result = try await service.sentRequests()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/friend-requests/sent")
        XCTAssertEqual(result.data.count, 1)
    }

    // MARK: - allFriendRequests

    func test_allFriendRequests_callsUsersEndpoint_withStatusFilter() async throws {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[FriendRequest]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mock.stub("/users/friend-requests", result: response)

        _ = try await service.allFriendRequests(status: "accepted", offset: 0, limit: 100)

        XCTAssertEqual(
            mock.lastRequest?.endpoint, "/users/friend-requests",
            "les deux sens ne sont rendus que par /users/friend-requests — /friend-requests/received filtre pending en dur"
        )
        XCTAssertTrue(
            mock.lastRequest?.queryItems?.contains(URLQueryItem(name: "status", value: "accepted")) ?? false,
            "le statut doit voyager en query item, jamais concatene dans l'endpoint (perdu par components.queryItems = ... dans APIClient)"
        )
    }

    // MARK: - respond

    func test_respond_accepted_callsPatchEndpoint() async throws {
        let fr = makeFriendRequest(id: "fr-5", status: "accepted")
        let response = APIResponse<FriendRequest>(success: true, data: fr, error: nil)
        mock.stub("/directory/friend-requests/fr-5", result: response)

        let result = try await service.respond(requestId: "fr-5", accepted: true)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests/fr-5")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
        XCTAssertEqual(result.status, "accepted")
    }

    func test_respond_rejected_callsPatchEndpoint() async throws {
        let fr = makeFriendRequest(id: "fr-6", status: "rejected")
        let response = APIResponse<FriendRequest>(success: true, data: fr, error: nil)
        mock.stub("/directory/friend-requests/fr-6", result: response)

        let result = try await service.respond(requestId: "fr-6", accepted: false)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests/fr-6")
        XCTAssertEqual(result.status, "rejected")
    }

    // MARK: - deleteRequest

    func test_deleteRequest_dismissesThroughTheSingleVerb() async throws {
        // Un geste, un verbe (#4162) : le `DELETE` séparé disparaît au profit
        // de `PATCH … {action: "dismiss"}`. La réponse porte `{id, deleted,
        // message}` — décodée comme telle, et non en dictionnaire de booléens :
        // un type trop STRICT transforme un succès serveur en échec client.
        let response = APIResponse<FriendRequestActionResult>(
            success: true,
            data: FriendRequestActionResult(id: "fr-9", deleted: true, message: "Demande d'ami supprimee"),
            error: nil
        )
        mock.stub("/directory/friend-requests/fr-9", result: response)

        try await service.deleteRequest(requestId: "fr-9")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests/fr-9")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    // MARK: - sendEmailInvitation

    func test_sendEmailInvitation_success_callsPostEndpoint() async throws {
        let invResponse: [String: Any] = ["email": "test@example.com"]
        let invData = try! JSONSerialization.data(withJSONObject: invResponse)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let inv = try! decoder.decode(EmailInvitationResponse.self, from: invData)
        let response = APIResponse<EmailInvitationResponse>(success: true, data: inv, error: nil)
        mock.stub("/invitations/email", result: response)

        try await service.sendEmailInvitation(email: "test@example.com")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/invitations/email")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Error handling

    func test_sendFriendRequest_networkError_throws() async {
        mock.errorToThrow = MeeshyError.network(.timeout)

        do {
            _ = try await service.sendFriendRequest(receiverId: "x")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.timeout) = error { } else {
                XCTFail("Expected network timeout, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    func test_deleteRequest_authError_throws() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            try await service.deleteRequest(requestId: "fr-1")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error { } else {
                XCTFail("Expected auth sessionExpired, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }
}

// MARK: - Lecture par CURSEUR (#4254)

/**
 Le listing par CURSEUR — l'adresse canonique, et la SECONDE page.

 Un témoin posé sur la seule PREMIÈRE page ne verrait aucune différence entre
 les deux modèles de pagination : la première page se demande sans `offset` et
 sans `cursor`. C'est la SECONDE qui les sépare, et c'est donc la seule que le
 critère 4 de #4254 accepte comme preuve.
 */
final class FriendServiceCursorListingTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: FriendService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = FriendService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    private func page(
        _ demandes: [FriendRequest] = [],
        nextCursor: String? = nil,
        hasMore: Bool = false
    ) -> PaginatedAPIResponse<[FriendRequest]> {
        PaginatedAPIResponse(
            success: true,
            data: demandes,
            pagination: CursorPagination(nextCursor: nextCursor, hasMore: hasMore, limit: 20),
            error: nil
        )
    }

    private func query(_ nom: String) -> String? {
        mock.lastRequest?.queryItems?.first(where: { $0.name == nom })?.value
    }

    func test_friendRequests_visesLAdresseCanonique_etPorteLaDirection() async throws {
        mock.stub("/directory/friend-requests", result: page())

        _ = try await service.friendRequests(direction: .any, status: "accepted", q: nil, cursor: nil, limit: 100)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(query("direction"), "any")
        XCTAssertEqual(query("status"), "accepted")
        XCTAssertEqual(query("limit"), "100")
    }

    func test_friendRequests_premierePage_neporteAucunCurseur() async throws {
        mock.stub("/directory/friend-requests", result: page(nextCursor: "2026-08-01T00:00:00.000Z", hasMore: true))

        _ = try await service.friendRequests(direction: .received, status: nil, q: nil, cursor: nil, limit: 20)

        XCTAssertNil(query("cursor"), "la première page ne borne rien — un curseur vide n'est pas un curseur")
        XCTAssertNil(query("status"), "un statut absent ne doit pas voyager en chaîne vide")
    }

    /// LE témoin du critère 4 : la seconde page part avec le `nextCursor` de la
    /// première, et JAMAIS avec un `offset`.
    func test_friendRequests_secondePage_partAvecLeNextCursorDeLaPremiere_jamaisUnOffset() async throws {
        let curseur = "2026-08-01T00:00:00.000Z"
        mock.stub("/directory/friend-requests", result: page(nextCursor: curseur, hasMore: true))

        let premiere = try await service.friendRequests(
            direction: .any, status: "accepted", q: nil, cursor: nil, limit: 100
        )
        XCTAssertEqual(premiere.pagination?.hasMore, true)
        let suivant = try XCTUnwrap(premiere.pagination?.nextCursor)

        _ = try await service.friendRequests(
            direction: .any, status: "accepted", q: nil, cursor: suivant, limit: 100
        )

        XCTAssertEqual(mock.requestCount, 2)
        XCTAssertEqual(query("cursor"), curseur)
        // La route à décalage repayait un `count()` complet par page, et son
        // `offset` sautait des lignes dès qu'une demande était créée pendant la
        // pagination. Aucun appel ne doit plus en porter.
        XCTAssertNil(query("offset"))
        XCTAssertFalse(
            mock.requests.contains(where: { $0.endpoint.hasPrefix("/users/friend-requests") }),
            "aucune des deux pages ne doit repasser par une adresse historique"
        )
    }

    /// La DISPATCH dynamique — ce que le protocole promet à ses hôtes.
    ///
    /// Les hôtes injectent `FriendServiceProviding`, jamais `FriendService`.
    /// Si la lecture par curseur cessait d'être une EXIGENCE du protocole pour
    /// n'être plus qu'une méthode d'extension, un appel à travers le protocole
    /// choisirait le PONT — donc une adresse historique — et l'appelant croirait
    /// paginer par curseur en tapant `/friend-requests/received`. Le compilateur
    /// ne dirait rien : c'est le seul témoin qui peut voir cette régression.
    func test_friendRequests_àTraversLeProtocole_atteintLAdresseCanonique() async throws {
        mock.stub("/directory/friend-requests", result: page())
        let parLeProtocole: FriendServiceProviding = service

        _ = try await parLeProtocole.friendRequests(
            direction: .received, status: nil, q: nil, cursor: nil, limit: 20
        )

        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests")
        XCTAssertNil(
            mock.requests.first(where: { $0.endpoint == "/friend-requests/received" }),
            "un appel protocolaire tombé sur le pont taperait l'adresse historique"
        )
    }

    func test_friendRequests_recherche_voyageEnParametreServeur() async throws {
        mock.stub("/directory/friend-requests", result: page())

        _ = try await service.friendRequests(direction: .any, status: nil, q: "ali", cursor: nil, limit: 20)

        XCTAssertEqual(query("q"), "ali", "sans `q` serveur, un hôte draine la liste entière pour filtrer en mémoire")
    }

    func test_friendRequests_rechercheVide_neVoyagePas() async throws {
        mock.stub("/directory/friend-requests", result: page())

        _ = try await service.friendRequests(direction: .any, status: nil, q: "   ", cursor: nil, limit: 20)

        XCTAssertNil(query("q"))
    }

    /// Le PONT du protocole : un conformant par décalage répond quand même —
    /// et ne prétend PAS savoir paginer par curseur.
    func test_pontParDecalage_premierePage_passeParLaMethodeHistoriqueDuSens() async throws {
        let double = DoubleParDecalage()

        let recue = try await double.friendRequests(direction: .received, status: nil, q: nil, cursor: nil, limit: 20)
        let envoyee = try await double.friendRequests(direction: .sent, status: nil, q: nil, cursor: nil, limit: 20)
        let toutes = try await double.friendRequests(direction: .any, status: "accepted", q: nil, cursor: nil, limit: 20)

        XCTAssertEqual(recue.data.first?.id, "recue")
        XCTAssertEqual(envoyee.data.first?.id, "envoyee")
        XCTAssertEqual(toutes.data.first?.id, "toutes")
        XCTAssertEqual(double.statutVu, "accepted")
    }

    func test_pontParDecalage_surUnCurseur_renduneursPageVide_pourQueLaBoucleSArrete() async throws {
        let double = DoubleParDecalage()

        let suite = try await double.friendRequests(
            direction: .received, status: nil, q: nil, cursor: "2026-08-01T00:00:00.000Z", limit: 20
        )

        XCTAssertTrue(suite.data.isEmpty)
        XCTAssertEqual(suite.pagination?.hasMore, false)
        XCTAssertEqual(double.appelsParDecalage, 0, "un pont qui ignorerait le curseur redemanderait la PREMIÈRE page indéfiniment")
    }
}

/// Un conformant qui ne sait lire que par décalage — la forme exacte des deux
/// doubles du dépôt (`MockFriendService`, `ThrowingFriendService`), qu'ajouter
/// une exigence au protocole aurait cassés.
private final class DoubleParDecalage: FriendServiceProviding, @unchecked Sendable {
    var appelsParDecalage = 0
    var statutVu: String?

    private func page(_ id: String) -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        appelsParDecalage += 1
        let json: [String: Any] = [
            "id": id, "senderId": "a", "receiverId": "b", "status": "pending",
            "createdAt": "2026-01-01T00:00:00Z"
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let demande = try! decoder.decode(FriendRequest.self, from: data)
        return OffsetPaginatedAPIResponse(
            success: true, data: [demande],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 20, offset: 0),
            error: nil
        )
    }

    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest {
        fatalError("hors sujet")
    }
    func receivedRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        page("recue")
    }
    func sentRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        page("envoyee")
    }
    func allFriendRequests(status: String?, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        statutVu = status
        return page("toutes")
    }
    func respond(requestId: String, accepted: Bool) async throws -> FriendRequest { fatalError("hors sujet") }
    func deleteRequest(requestId: String) async throws {}
    func sendEmailInvitation(email: String) async throws {}
}
