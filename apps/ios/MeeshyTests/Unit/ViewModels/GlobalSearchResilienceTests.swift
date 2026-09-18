import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

/// La recherche GARDE ce qu'elle affiche pendant qu'elle cherche, et DIT
/// pourquoi elle ne rend rien quand le réseau tombe (#7007).
///
/// Deux défauts distincts, deux familles de témoins :
/// 1. `loadState = .loading` était posé à CHAQUE frappe (debounce 300 ms), donc
///    la vue remplaçait la liste par un spinner toutes les 300 ms — un
///    clignotement, et une violation directe de « jamais de spinner sur un
///    cache non vide ». Le cas `.cachedStale` existait mais ne servait qu'au
///    cache LRU, jamais aux résultats DÉJÀ À L'ÉCRAN.
/// 2. Les trois volets réseau rendaient `[]` dans leur `catch` : une panne
///    s'affichait « Aucun résultat ». Un vide de panne et un vide légitime
///    sont indiscernables tant que personne ne publie la différence.
@MainActor
final class GlobalSearchResilienceTests: XCTestCase {

    private let defaultsKey = "globalSearch.recentSearches"

    override func setUp() async throws {
        try await super.setUp()
        UserDefaults.standard.removeObject(forKey: defaultsKey)
        await SearchIndex.shared.clearAll()
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: defaultsKey)
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT() throws -> (
        sut: GlobalSearchViewModel,
        mockAPI: MockAPIClientForApp,
        mockUserService: MockUserService,
        mockAuthManager: MockAuthManager
    ) {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let mockAPI = MockAPIClientForApp()
        let mockUserService = MockUserService()
        let mockAuthManager = MockAuthManager()
        let sut = GlobalSearchViewModel(
            api: mockAPI,
            userService: mockUserService,
            authManager: mockAuthManager,
            searchService: MessageSearchService(reader: pool),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket()
        )
        return (sut, mockAPI, mockUserService, mockAuthManager)
    }

    private func makeCurrentUser() -> MeeshyUser {
        MeeshyUser(id: "user-001", username: "testuser", displayName: "Test User")
    }

    private func stubEmptyConversationSearch(on mockAPI: MockAPIClientForApp) {
        let response: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: response)
    }

    // MARK: - La liste ne clignote plus

    /// Le témoin qui attrape le clignotement : on enregistre TOUS les états
    /// traversés par la seconde recherche. `.loading` remplacerait la liste par
    /// un spinner — il ne doit jamais apparaître tant que des résultats sont à
    /// l'écran. `.cachedStale` est l'état attendu : la vue garde ses lignes et
    /// pose un indicateur discret par-dessus.
    func test_performSearch_surDesResultatsAffiches_neRepasseJamaisParLoading() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch(on: mockAPI)
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice", displayName: "Alice", isOnline: true)
        ])

        await sut.performSearch(query: "ali")
        XCTAssertFalse(sut.userResults.isEmpty, "préalable : la première recherche doit peupler la liste")

        var traversed: [LoadState] = []
        let token = sut.$loadState.sink { traversed.append($0) }
        defer { token.cancel() }

        await sut.performSearch(query: "alic")

        XCTAssertFalse(
            traversed.contains(.loading),
            "une recherche par-dessus des résultats affichés ne doit jamais poser .loading — \(traversed)"
        )
        XCTAssertTrue(
            traversed.contains(.cachedStale),
            "elle doit poser .cachedStale, l'état que la vue rend en indicateur discret — \(traversed)"
        )
        XCTAssertFalse(sut.userResults.isEmpty, "les résultats doivent rester à l'écran")
    }

    /// Le démarrage à FROID garde son `.loading` : sans rien à l'écran, un
    /// squelette est la bonne réponse — c'est l'autre moitié de la règle.
    func test_performSearch_surUneListeVide_poseBienLoading() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch(on: mockAPI)
        mockUserService.searchUsersResult = .success([])

        var traversed: [LoadState] = []
        let token = sut.$loadState.sink { traversed.append($0) }
        defer { token.cancel() }

        await sut.performSearch(query: "zzz")

        XCTAssertTrue(
            traversed.contains(.loading),
            "cache vide + liste vide = démarrage à froid, .loading est légitime — \(traversed)"
        )
    }

    // MARK: - Une panne n'est pas un vide

    /// `.error` est le verdict NOMINAL ; `.offline` est son jumeau légitime.
    /// `performSearch` interroge `NetworkMonitor.shared`, c'est-à-dire l'état
    /// réseau RÉEL de la machine qui exécute le témoin — un agent CI sans
    /// interface utilisable rendrait `.offline` sur exactement le même
    /// scénario. Les deux disent « ça n'a pas abouti, l'écran doit le dire » ;
    /// ce que le témoin refuse, c'est `.loaded`, qui présenterait la panne
    /// comme un succès vide.
    private func assertEchecPublie(_ state: LoadState, _ message: String, file: StaticString = #filePath, line: UInt = #line) {
        switch state {
        case .error, .offline:
            break
        default:
            XCTFail("\(message) — \(state)", file: file, line: line)
        }
    }

    func test_performSearch_quandLeReseauTombe_publieUneErreurAvecSonMotif() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        mockAPI.errorToThrow = NSError(domain: "test", code: 500)
        mockUserService.searchUsersResult = .failure(NSError(domain: "test", code: 500))

        await sut.performSearch(query: "panne")

        XCTAssertNotNil(sut.remoteFailure, "le motif de la panne doit être publié, pas avalé")
        assertEchecPublie(sut.loadState, "sans rien à afficher, une panne réseau doit se DIRE")
    }

    func test_performSearch_apresUneReussite_effaceLeMotifDePanne() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        mockAPI.errorToThrow = NSError(domain: "test", code: 500)
        mockUserService.searchUsersResult = .failure(NSError(domain: "test", code: 500))
        await sut.performSearch(query: "panne")
        XCTAssertNotNil(sut.remoteFailure)

        mockAPI.errorToThrow = nil
        stubEmptyConversationSearch(on: mockAPI)
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice")
        ])

        await sut.performSearch(query: "alice")

        XCTAssertNil(sut.remoteFailure, "une recherche qui aboutit efface la panne précédente")
        XCTAssertFalse(sut.userResults.isEmpty)
    }

    /// « Réessayer » ne peut pas être un bouton inerte : il doit rejouer la
    /// DERNIÈRE requête, pas une chaîne vide.
    func test_retryLastSearch_rejoueLaDerniereRequete() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        mockAPI.errorToThrow = NSError(domain: "test", code: 500)
        mockUserService.searchUsersResult = .failure(NSError(domain: "test", code: 500))
        await sut.performSearch(query: "alice")
        XCTAssertNotNil(sut.remoteFailure, "préalable : la première recherche doit échouer")
        XCTAssertTrue(sut.userResults.isEmpty)

        mockAPI.errorToThrow = nil
        stubEmptyConversationSearch(on: mockAPI)
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice")
        ])

        await sut.retryLastSearch()

        XCTAssertEqual(sut.userResults.count, 1, "le réessai doit rejouer « alice »")
        XCTAssertNil(sut.remoteFailure)
    }
}
