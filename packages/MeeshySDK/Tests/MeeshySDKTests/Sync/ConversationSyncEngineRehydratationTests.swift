import XCTest
@testable import MeeshySDK

/// LA LIGNE DE LISTE APRÈS UN RÉVEIL (#7787).
///
/// `/sync` sert des lignes MAIGRES : `lastMessageAt` avance, mais ni l'aperçu,
/// ni sa carte du Prisme, ni les non-lus. Une conversation qui a reçu des
/// messages pendant l'arrière-plan remontait donc en tête avec l'ANCIEN texte,
/// et le watermark avançait par-dessus : la fenêtre n'était jamais relue.
///
/// Ces témoins opposent au moteur ce que la route RICHE (`GET /conversations`)
/// sert, et lisent le cache après coup.
final class ConversationSyncEngineRehydratationTests: XCTestCase {

    private typealias MockSync = ConversationSyncEngineDeltaViaSyncTests.MockSyncDeltaClient

    private var mockAPI: MockAPIClient!
    private var mockSync: MockSync!
    private var mockService: MockConversationService!
    private var engine: ConversationSyncEngine!
    private var watermarkAvant: Date!

    private static let depart = Date(timeIntervalSince1970: 1_788_512_400)

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClient()
        mockAPI.authToken = "jeton-de-test"
        mockSync = MockSync()
        mockService = MockConversationService()
        engine = ConversationSyncEngine(
            cache: .shared,
            conversationService: mockService,
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: mockAPI,
            syncDelta: mockSync
        )
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")
        watermarkAvant = engine.lastSyncTimestamp
        engine.lastSyncTimestamp = Self.depart
    }

    override func tearDown() {
        engine.lastSyncTimestamp = watermarkAvant
        mockAPI.reset()
        super.tearDown()
    }

    // MARK: - Fabriques

    private static func date(_ iso: String) -> Date {
        WireDate.date(from: iso)!
    }

    private func semeLAncienEtat() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        var ancienne = MeeshyConversation(
            id: "c1", identifier: "equipe-lagos", type: .group,
            lastMessageAt: Self.date("2026-09-04T10:00:00.000Z"), unreadCount: 5
        )
        ancienne.title = "Équipe Lagos"
        ancienne.lastMessagePreview = "On se cale à 15 h ?"
        ancienne.lastMessageTranslations = ["es": "¿Nos vemos a las 15?"]
        try? await CacheCoordinator.shared.conversations.save([ancienne], for: "list")
    }

    private func ligneMaigreJSON(lastMessageAt: String = "2026-09-04T11:59:00.000Z") -> String {
        """
        {
          "id": "c1",
          "type": "group",
          "identifier": "equipe-lagos",
          "title": "Équipe Lagos",
          "isActive": true,
          "memberCount": 5,
          "lastMessageAt": "\(lastMessageAt)",
          "createdAt": "2026-08-01T10:00:00.000Z",
          "updatedAt": "2026-09-04T11:59:30.000Z"
        }
        """
    }

    private func deltaJSON(ligne: String, cle: String = "modified") -> String {
        """
        {
          "checkpoint": "2026-09-04T12:00:00.000Z",
          "checkpointSeq": 42,
          "hasGap": false,
          "hasMore": false,
          "collections": {
            "conversations": {
              "added": [\(cle == "added" ? ligne : "")],
              "modified": [\(cle == "modified" ? ligne : "")],
              "deleted": []
            }
          }
        }
        """
    }

    private func ligneRiche() -> APIConversation {
        let json = """
        {
          "id": "c1",
          "type": "group",
          "identifier": "equipe-lagos",
          "title": "Équipe Lagos",
          "isActive": true,
          "memberCount": 5,
          "lastMessageAt": "2026-09-04T11:59:00.000Z",
          "createdAt": "2026-08-01T10:00:00.000Z",
          "updatedAt": "2026-09-04T11:59:30.000Z",
          "unreadCount": 7,
          "lastMessageOriginalLanguage": "fr",
          "lastMessageTranslations": { "es": "El tren sale a las 16" },
          "lastMessage": {
            "id": "m9",
            "content": "Le train part à 16 h",
            "createdAt": "2026-09-04T11:59:00.000Z",
            "sender": { "id": "p2", "userId": "u2", "displayName": "Awa" }
          }
        }
        """
        return try! APIClient.makeAPIPayloadDecoder().decode(APIConversation.self, from: Data(json.utf8))
    }

    private func pageRiche() -> OffsetPaginatedAPIResponse<[APIConversation]> {
        OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [ligneRiche()],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0),
            error: nil
        )
    }

    private func c1() async -> MeeshyConversation? {
        let liste = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        return liste.first(where: { $0.id == "c1" })
    }

    // MARK: - Le delta du réveil

    func test_delta_activiteAvancee_laLigneMontreLeDernierMessageEtSesNonLus() async {
        await semeLAncienEtat()
        mockSync.scripte = .delta(json: deltaJSON(ligne: ligneMaigreJSON()), validateur: nil)
        mockAPI.stub("/conversations", result: pageRiche())

        let succes = await engine.syncSinceLastCheckpoint()

        XCTAssertTrue(succes)
        let ligne = await c1()
        XCTAssertEqual(ligne?.lastMessagePreview, "Le train part à 16 h",
            "la conversation remontée doit dire son DERNIER message, pas celui d'avant l'arrière-plan")
        XCTAssertEqual(ligne?.lastMessageTranslations?["es"], "El tren sale a las 16",
            "la carte du Prisme voyage avec l'aperçu")
        XCTAssertEqual(ligne?.userState.unreadCount, 7, "le compteur suit les messages reçus")
        let since = mockAPI.lastRequest?.queryItems?.first(where: { $0.name == "updatedSince" })?.value
        XCTAssertNotNil(since, "la réhydratation passe par la route riche, bornée par une fenêtre")
        XCTAssertLessThan(WireDate.date(from: since ?? "")!, Self.date("2026-09-04T11:59:30.000Z"),
            "la fenêtre doit couvrir la ligne réhydratée (borne serveur STRICTE)")
    }

    func test_delta_conversationInconnue_arriveAvecSonApercu() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        try? await CacheCoordinator.shared.conversations.save(
            [MeeshyConversation(id: "c0", identifier: "autre", type: .group, lastMessageAt: Self.depart, unreadCount: 0)],
            for: "list"
        )
        mockSync.scripte = .delta(json: deltaJSON(ligne: ligneMaigreJSON(), cle: "added"), validateur: nil)
        mockAPI.stub("/conversations", result: pageRiche())

        _ = await engine.syncSinceLastCheckpoint()

        let ligne = await c1()
        XCTAssertEqual(ligne?.lastMessagePreview, "Le train part à 16 h",
            "une conversation née pendant l'arrière-plan ne s'affiche pas sans aperçu")
    }

    func test_delta_sansActivite_neRappellePasLaRouteRiche() async {
        await semeLAncienEtat()
        mockSync.scripte = .delta(
            json: deltaJSON(ligne: ligneMaigreJSON(lastMessageAt: "2026-09-04T10:00:00.000Z")),
            validateur: nil
        )

        _ = await engine.syncSinceLastCheckpoint()

        XCTAssertEqual(mockAPI.requestCount, 0, "un renommage seul n'a rien à réhydrater")
        let ligne = await c1()
        XCTAssertEqual(ligne?.lastMessagePreview, "On se cale à 15 h ?")
    }

    func test_delta_rehydratationEnEchec_laFenetreResteRejouable() async {
        await semeLAncienEtat()
        mockSync.scripte = .delta(json: deltaJSON(ligne: ligneMaigreJSON()), validateur: nil)
        mockAPI.stubError("/conversations", error: URLError(.networkConnectionLost))

        let succes = await engine.syncSinceLastCheckpoint()

        XCTAssertFalse(succes, "un aperçu resté périmé n'est pas un rattrapage réussi")
        XCTAssertEqual(engine.lastSyncTimestamp, Self.depart,
            "le watermark ne doit pas passer par-dessus une fenêtre dont les aperçus n'ont pas été lus")
    }

    func test_deltaEnEchec_leSignalSuivantRetenteSansAttendreLAntiRafale() async {
        await semeLAncienEtat()
        mockSync.scripte = .delta(json: deltaJSON(ligne: ligneMaigreJSON()), validateur: nil)
        mockAPI.stubError("/conversations", error: URLError(.networkConnectionLost))
        _ = await engine.syncSinceLastCheckpoint()

        mockAPI.reset()
        mockAPI.authToken = "jeton-de-test"
        mockAPI.stub("/conversations", result: pageRiche())
        let succes = await engine.syncSinceLastCheckpoint()

        XCTAssertTrue(succes,
            "au réveil, le premier essai tombe souvent sur un réseau pas encore rétabli : le signal suivant doit retenter")
        let ligne = await c1()
        XCTAssertEqual(ligne?.lastMessagePreview, "Le train part à 16 h")
    }

    // MARK: - Les messages préchargés par l'extension de notification

    func test_messagesPrecharges_peignentLaLigneDesLeReveil_sansReseau() async {
        await semeLAncienEtat()
        let recu = TestFactories.makeAPIMessage(
            id: "m9", conversationId: "c1", senderId: "u2",
            content: "Le train part à 16 h", createdAt: Self.date("2026-09-04T11:59:00.000Z")
        )
        let plusAncien = TestFactories.makeAPIMessage(
            id: "m8", conversationId: "c1", senderId: "u2",
            content: "J'arrive", createdAt: Self.date("2026-09-04T11:58:00.000Z")
        )

        await engine.peintLesMessagesPrecharges([recu, plusAncien])

        let ligne = await c1()
        XCTAssertEqual(ligne?.lastMessagePreview, "Le train part à 16 h",
            "le DERNIER des messages préchargés peint la ligne, quel que soit l'ordre du lot")
        XCTAssertEqual(ligne?.lastMessageAt, Self.date("2026-09-04T11:59:00.000Z"))
        XCTAssertEqual(mockAPI.requestCount, 0, "aucun réseau : la ligne est juste dès l'ouverture")
    }

    func test_messagesPrecharges_conversationInconnue_attendLaRouteRiche() async {
        await semeLAncienEtat()
        let recu = TestFactories.makeAPIMessage(
            id: "m1", conversationId: "c-neuve", senderId: "u2",
            content: "Salut", createdAt: Self.date("2026-09-04T11:59:00.000Z")
        )

        await engine.peintLesMessagesPrecharges([recu])

        let liste = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertFalse(liste.contains { $0.id == "c-neuve" },
            "une ligne n'entre que riche : pas de conversation fabriquée depuis un seul message")
    }

    // MARK: - Le plein

    func test_pleinAFroid_lesLignesPortentLeurApercu() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        mockSync.scripte = .delta(json: deltaJSON(ligne: ligneMaigreJSON(), cle: "added"), validateur: nil)
        mockService.listResult = .success(pageRiche())

        let succes = await engine.fullSync()

        XCTAssertTrue(succes)
        let ligne = await c1()
        XCTAssertEqual(ligne?.lastMessagePreview, "Le train part à 16 h",
            "une installation neuve ne peint pas une liste sans aperçus")
        XCTAssertEqual(ligne?.userState.unreadCount, 7)
    }

    func test_pleinAChaud_activiteAvancee_rehydrateLaLigne() async {
        await semeLAncienEtat()
        mockSync.scripte = .delta(json: deltaJSON(ligne: ligneMaigreJSON()), validateur: nil)
        mockAPI.stub("/conversations", result: pageRiche())

        let succes = await engine.fullSync()

        XCTAssertTrue(succes)
        let ligne = await c1()
        XCTAssertEqual(ligne?.lastMessagePreview, "Le train part à 16 h",
            "la réconciliation par /sync ne doit pas figer l'ancien aperçu d'une conversation active")
    }
}
