import XCTest
@testable import MeeshySDK

/// LE DELTA PAR `/sync` (#4172 tranche 2b) — le chemin nominal, sa FUSION par
/// champs servis, et le repli NOMMÉ. Chaque scénario pilote le moteur entier
/// (`syncSinceLastCheckpoint`) : ce que le cache contient APRÈS est la seule
/// vérité opposée.
final class ConversationSyncEngineDeltaViaSyncTests: XCTestCase {

    // MARK: - Mock scripté (pattern maison)

    final class MockSyncDeltaClient: SyncDeltaClientProviding, @unchecked Sendable {
        enum Scripte { case muet, inchange, delta(json: String, validateur: String?) }
        var scripte: Scripte = .muet
        private(set) var demandes: [SyncDeltaRequest] = []

        func demandeLeDelta<Row: Decodable & Sendable>(
            _ demande: SyncDeltaRequest,
            creance _: SyncDeltaCredential,
            rangeant _: Row.Type
        ) async -> SyncDeltaOutcome<Row> {
            demandes.append(demande)
            switch scripte {
            case .muet: return .muet
            case .inchange: return .inchange
            case let .delta(json, validateur):
                // Le mock DÉCODE l'enveloppe réelle plutôt que de fabriquer des
                // valeurs : la forme opposée est celle que `routes/sync` sert.
                let delta = try! APIClient.makeAPIPayloadDecoder().decode(SyncDelta<Row>.self, from: Data(json.utf8))
                return .delta(delta, validateur: validateur)
            }
        }
    }

    private var mockAPI: MockAPIClient!
    private var mockSync: MockSyncDeltaClient!
    private var mockService: MockConversationService!
    private var engine: ConversationSyncEngine!

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClient()
        mockAPI.authToken = "jeton-de-test"
        mockSync = MockSyncDeltaClient()
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
        // La réconciliation 24 h ne doit pas s'inviter dans ces scénarios.
        UserDefaults.standard.set(Date(), forKey: "me.meeshy.lastFullReconcileAt")
    }

    override func tearDown() {
        mockAPI.reset()
        super.tearDown()
    }

    private func semeLeCache() async -> MeeshyConversation {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        var riche = MeeshyConversation(
            id: "c1", identifier: "equipe-lagos", type: .group,
            lastMessageAt: Date().addingTimeInterval(-3_600), unreadCount: 5
        )
        riche.title = "Équipe Lagos"
        riche.lastMessagePreview = "On se cale à 15 h ?"
        riche.lastMessageTranslations = ["es": "¿Nos vemos a las 15?"]
        try? await CacheCoordinator.shared.conversations.save([riche], for: "list")
        return riche
    }

    private func deltaJSON(hasGap: Bool = false, hasMore: Bool = false) -> String {
        """
        {
          "checkpoint": "2026-09-04T12:00:00.000Z",
          "checkpointSeq": 42,
          "hasGap": \(hasGap),
          "hasMore": \(hasMore),
          "collections": {
            "conversations": {
              "added": [],
              "modified": [{
                "id": "c1",
                "type": "group",
                "identifier": "equipe-lagos",
                "title": "Lagos — renommée",
                "isActive": true,
                "memberCount": 5,
                "lastMessageAt": "2026-09-04T11:59:00.000Z",
                "createdAt": "2026-08-01T10:00:00.000Z",
                "updatedAt": "2026-09-04T11:59:30.000Z"
              }],
              "deleted": []
            }
          }
        }
        """
    }

    // MARK: - Le chemin nominal et sa fusion

    func test_deltaViaSync_avanceLesChampsServis_etPreserveCeQueLaLigneMaigreNePortePas() async {
        _ = await semeLeCache()
        mockSync.scripte = .delta(json: deltaJSON(), validateur: nil)

        let succes = await engine.syncSinceLastCheckpoint()

        XCTAssertTrue(succes)
        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let c1 = cached.first(where: { $0.id == "c1" })
        XCTAssertEqual(c1?.title, "Lagos — renommée", "le champ SERVI avance")
        XCTAssertEqual(c1?.memberCount, 5)
        XCTAssertEqual(c1?.userState.unreadCount, 5, "le non-lu, que /sync ne sert pas, ne bouge pas")
        XCTAssertEqual(c1?.lastMessagePreview, "On se cale à 15 h ?", "l'aperçu, non servi, ne s'efface pas")
        XCTAssertEqual(c1?.lastMessageTranslations?["es"], "¿Nos vemos a las 15?", "sa carte non plus")
        // Le chemin nominal n'a touché NI /conversations NI quoi que ce soit d'autre.
        XCTAssertEqual(mockAPI.requestCount, 0, "aucun repli, aucune escalade : /sync a suffi")
        XCTAssertEqual(mockSync.demandes.first?.collections, ["conversations"])
        XCTAssertEqual(mockSync.demandes.count, 1)
    }

    func test_inchange_neToucheNiCacheNiReseau() async {
        let riche = await semeLeCache()
        mockSync.scripte = .inchange

        let succes = await engine.syncSinceLastCheckpoint()

        XCTAssertTrue(succes)
        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first(where: { $0.id == "c1" })?.title, riche.title)
        XCTAssertEqual(mockAPI.requestCount, 0)
    }

    // MARK: - Le repli NOMMÉ

    func test_survolMuet_retombeSurLeCheminHistorique_updatedSince() async {
        _ = await semeLeCache()
        mockSync.scripte = .muet
        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0),
            error: nil
        ))

        let succes = await engine.syncSinceLastCheckpoint()

        XCTAssertTrue(succes)
        XCTAssertEqual(mockAPI.lastRequest?.endpoint, "/conversations",
                       "le repli est le chemin historique — jamais un échec avalé")
    }

    func test_creanceAbsente_retombeSansMemeAppelerLeClient() async {
        _ = await semeLeCache()
        mockAPI.authToken = nil
        mockSync.scripte = .delta(json: deltaJSON(), validateur: nil)
        mockAPI.stub("/conversations", result: OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [],
            pagination: OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0),
            error: nil
        ))

        _ = await engine.syncSinceLastCheckpoint()

        XCTAssertTrue(mockSync.demandes.isEmpty, "sans créance, /sync n'est jamais tenté")
        XCTAssertEqual(mockAPI.lastRequest?.endpoint, "/conversations")
    }

    // MARK: - L'escalade

    func test_hasGap_escaladeVersFullSync() async {
        _ = await semeLeCache()
        mockSync.scripte = .delta(json: deltaJSON(hasGap: true), validateur: nil)

        let succes = await engine.syncSinceLastCheckpoint()

        XCTAssertTrue(succes)
        // `fullSync` passe par le SERVICE de conversations, jamais par l'API
        // brute — c'est LUI le témoin de l'escalade.
        XCTAssertGreaterThanOrEqual(mockService.listCallCount, 1,
            "hasGap dit que l'absence dépasse ce que /sync sait rejouer : la vérité serveur reprend la main")
    }

    // MARK: - La fusion, à l'unité

    func test_fusionneLigneDeSync_ligneNeuve_passeTelleQuelle() {
        let recue = MeeshyConversation(
            id: "c9", identifier: "neuve", type: .direct,
            lastMessageAt: Date(), unreadCount: 0
        )
        let fusion = ConversationSyncEngine.fusionneLigneDeSync(existante: nil, recue: recue)
        XCTAssertEqual(fusion.id, "c9")
    }
}
