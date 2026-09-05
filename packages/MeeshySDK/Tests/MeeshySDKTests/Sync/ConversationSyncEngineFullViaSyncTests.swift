import XCTest
@testable import MeeshySDK

/// LE PLEIN PAR `/sync` (#4172, seconde moitié du critère 1) — et les DEUX
/// témoins que l'issue nomme :
///
///  - **5a, le compteur de requêtes** : sur un compte à 10 000 conversations,
///    le démarrage à froid passait par ≈ 100 requêtes de rang ; la voie
///    `/sync` en fait UNE PAR PAGE D'ANCRE. Un témoin qui vérifierait
///    seulement « l'état final est correct » resterait vert avec l'ancien
///    chemin — celui-ci COMPTE, et vérifie que l'ancien chemin n'a pas servi.
///  - **5b, le repli NOMMÉ** : un déploiement qui ne sert pas la collection
///    (`UNSUPPORTED_COLLECTION`, mesuré en production le 2026-09-04) ramène
///    le chemin historique ENTIER — la condition est le REFUS du serveur,
///    jamais un `try?` qui fondrait ce refus dans une panne.
final class ConversationSyncEngineFullViaSyncTests: XCTestCase {

    /// Un mock SÉQUENTIEL : une réponse PAR APPEL — la forme qu'exige une
    /// pagination (le mock à réponse unique du delta ne peut pas dire « la
    /// page 2 diffère de la page 1 »).
    final class MockSyncSequentiel: SyncDeltaClientProviding, @unchecked Sendable {
        enum Reponse { case muet, inchange, refuse(statut: Int, code: String?), delta(json: String) }
        var reponses: [Reponse] = []
        private(set) var demandes: [SyncDeltaRequest] = []

        func demandeLeDelta<Row: Decodable & Sendable>(
            _ demande: SyncDeltaRequest,
            creance _: SyncDeltaCredential,
            rangeant _: Row.Type
        ) async -> SyncDeltaOutcome<Row> {
            demandes.append(demande)
            guard !reponses.isEmpty else { return .muet }
            switch reponses.removeFirst() {
            case .muet: return .muet
            case .inchange: return .inchange
            case let .refuse(statut, code): return .refuse(statut: statut, code: code)
            case let .delta(json):
                let delta = try! APIClient.makeAPIPayloadDecoder().decode(SyncDelta<Row>.self, from: Data(json.utf8))
                return .delta(delta, validateur: nil)
            }
        }
    }

    private var mockAPI: MockAPIClient!
    private var mockSync: MockSyncSequentiel!
    private var mockService: MockConversationService!
    private var engine: ConversationSyncEngine!

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClient()
        mockAPI.authToken = "jeton-de-test"
        mockSync = MockSyncSequentiel()
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
    }

    override func tearDown() {
        mockAPI.reset()
        super.tearDown()
    }

    /// La fabrique du fichier voisin est `fileprivate` — la ligne se DÉCODE
    /// ici, par le décodeur maison, comme les pages du mock.
    private func conversationAPI(id: String) -> APIConversation {
        try! APIClient.makeAPIPayloadDecoder().decode(
            APIConversation.self,
            from: Data(ligneJSON(id: id).utf8)
        )
    }

    private func ligneJSON(id: String) -> String {
        """
        {
          "id": "\(id)",
          "type": "group",
          "identifier": "conv-\(id)",
          "title": "Conversation \(id)",
          "isActive": true,
          "memberCount": 3,
          "lastMessageAt": "2026-09-04T11:00:00.000Z",
          "createdAt": "2026-08-01T10:00:00.000Z",
          "updatedAt": "2026-09-04T11:00:00.000Z"
        }
        """
    }

    private func lignesJSON(prefixe: String, de: Int, a: Int) -> String {
        (de...a).map { indice in
            """
            {
              "id": "\(prefixe)\(indice)",
              "type": "group",
              "identifier": "conv-\(prefixe)\(indice)",
              "title": "Conversation \(indice)",
              "isActive": true,
              "memberCount": 3,
              "lastMessageAt": "2026-09-04T11:00:00.000Z",
              "createdAt": "2026-08-01T10:00:00.000Z",
              "updatedAt": "2026-09-04T11:00:00.000Z"
            }
            """
        }.joined(separator: ",")
    }

    private func pageJSON(lignes: String, nextCursor: String?, truncated: Bool, checkpoint: String = "2026-09-04T12:00:00.000Z") -> String {
        """
        {
          "checkpoint": "\(checkpoint)",
          "hasGap": false,
          "hasMore": \(truncated),
          "collections": {
            "conversations": {
              "added": [\(lignes)],
              "modified": [],
              "deleted": []\(nextCursor.map { ", \"nextCursor\": \"\($0)\"" } ?? ""),
              "truncated": \(truncated)
            }
          }
        }
        """
    }

    // MARK: - 5a : le compteur

    func test_leFroidDe10000Conversations_faitUneRequeteParPageDAncre_etAucuneAuCheminHistorique() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        // 10 000 conversations en 20 pages de 500 — le mock chaîne les ancres.
        for page in 0..<20 {
            let debut = page * 500 + 1
            let fin = debut + 499
            let derniere = page == 19
            mockSync.reponses.append(.delta(json: pageJSON(
                lignes: lignesJSON(prefixe: "c", de: debut, a: fin),
                nextCursor: derniere ? nil : "ancre-p\(page + 1)",
                truncated: !derniere
            )))
        }

        let succes = await engine.fullSync()

        XCTAssertTrue(succes)
        // LE compteur : 20 pages d'ancre — plus jamais ≈ 100 requêtes de rang.
        XCTAssertEqual(mockSync.demandes.count, 20)
        // L'ancien chemin n'a pas servi UNE SEULE fois.
        XCTAssertEqual(mockService.listCallCount, 0)
        // L'ancre est relayée VERBATIM, page après page.
        XCTAssertNil(mockSync.demandes[0].cursor)
        XCTAssertEqual(mockSync.demandes[1].cursor, "ancre-p1")
        XCTAssertEqual(mockSync.demandes[19].cursor, "ancre-p19")
        // Le plein est un delta depuis l'ÉPOQUE — même canal, même fusion.
        XCTAssertTrue(mockSync.demandes.allSatisfy { $0.since.hasPrefix("1970-01-01") })

        let liste = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(liste.count, 10_000)
    }

    // MARK: - 5b : le repli nommé

    func test_unDeploiementSansLaCollection_rameneLeCheminHistoriqueEntier() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        mockSync.reponses = [.refuse(statut: 400, code: "UNSUPPORTED_COLLECTION")]
        mockService.listResult = .success(OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true,
            data: [conversationAPI(id: "h1")],
            pagination: OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0),
            error: nil
        ))

        let succes = await engine.fullSync()

        XCTAssertTrue(succes)
        // La voie `/sync` a été TENTÉE une fois, puis l'historique a TOUT servi.
        XCTAssertEqual(mockSync.demandes.count, 1)
        XCTAssertGreaterThan(mockService.listCallCount, 0)
        let liste = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(liste.map(\.id), ["h1"])
    }

    // MARK: - Une panne au milieu n'est PAS un repli

    func test_unePanneEnCoursDePagination_rendLaMain_sansRejouerLHistorique() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        mockSync.reponses = [
            .delta(json: pageJSON(
                lignes: lignesJSON(prefixe: "c", de: 1, a: 2),
                nextCursor: "ancre-p1",
                truncated: true
            )),
            .muet,
        ]

        let succes = await engine.fullSync()

        XCTAssertFalse(succes)
        // Deux appels `/sync`, AUCUN à l'historique : retenter la voie douce
        // coûte moins que rejouer ≈ 100 requêtes de rang.
        XCTAssertEqual(mockSync.demandes.count, 2)
        XCTAssertEqual(mockService.listCallCount, 0)
    }
}
