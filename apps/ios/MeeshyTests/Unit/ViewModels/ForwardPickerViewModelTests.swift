import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class ForwardPickerViewModelTests: XCTestCase {

    private var friendService: MockFriendService!
    private var directoryService: MockContactDirectoryService!

    override func setUp() {
        super.setUp()
        friendService = MockFriendService()
        directoryService = MockContactDirectoryService()
    }

    override func tearDown() {
        friendService = nil
        directoryService = nil
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(currentUserId: String = "me") -> (sut: ForwardPickerViewModel, service: MockConversationService) {
        let service = MockConversationService()
        let authManager = MockAuthManager()
        authManager.currentUser = MeeshyUser(id: currentUserId, username: "moi")
        let sut = ForwardPickerViewModel(
            conversationService: service,
            friendService: friendService,
            contactDirectoryService: directoryService,
            authManager: authManager
        )
        return (sut, service)
    }

    private func makeConv(_ id: String, participantUserId: String? = nil) -> Conversation {
        Conversation(
            id: id,
            identifier: id,
            type: .direct,
            title: "Conv \(id)",
            participantUserId: participantUserId
        )
    }

    private func makeAPIConv(_ id: String, participantUserId: String) -> APIConversation {
        let participant = APIParticipant(
            id: "p-\(participantUserId)",
            conversationId: id,
            type: .user,
            userId: participantUserId,
            displayName: "User \(participantUserId)",
            role: "MEMBER"
        )
        return APIConversation(
            id: id,
            type: "direct",
            participants: [participant],
            createdAt: Date()
        )
    }

    private func makeAccepted(otherId: String, currentUserId: String = "me", username: String? = nil) -> FriendRequest {
        FriendRequestFixture.make(
            id: "fr-\(otherId)",
            senderId: currentUserId,
            receiverId: otherId,
            status: "accepted",
            receiverUsername: username ?? "user\(otherId)"
        )
    }

    private func makeDirectoryContact(userId: String) -> DirectoryContact {
        DirectoryContact(
            id: "dc-\(userId)",
            contactKey: "key-\(userId)",
            displayName: "Contact \(userId)",
            isOnMeeshy: true,
            matchedUser: MatchedContactUser(id: userId, username: "user\(userId)", displayName: "Contact \(userId)")
        )
    }

    private func pageOf(_ requests: [FriendRequest]) -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        OffsetPaginatedAPIResponse(success: true, data: requests, pagination: nil, error: nil)
    }

    private func pageOf(_ contacts: [DirectoryContact]) -> [DirectoryContact] {
        contacts
    }

    // MARK: - Pagination

    func test_loadMore_passesPreviousCursor_andAppends() async {
        let (sut, service) = makeSUT()
        service.listPageResult = .success(ConversationPage(items: [makeConv("c1")], rawItems: [], nextCursor: "cur1", hasMore: true))
        await sut.loadInitial()
        service.listPageResult = .success(ConversationPage(items: [makeConv("c2")], rawItems: [], nextCursor: "cur2", hasMore: false))

        await sut.loadMore()

        XCTAssertEqual(service.lastListPageCursor, "cur1")
        XCTAssertEqual(sut.targets.map(\.id), ["conv:c1", "conv:c2"])
        XCTAssertFalse(sut.hasMore)
    }

    func test_loadMore_whenHasMoreFalse_doesNotFetch() async {
        let (sut, service) = makeSUT()
        service.listPageResult = .success(ConversationPage(items: [makeConv("c1")], rawItems: [], nextCursor: nil, hasMore: false))
        await sut.loadInitial()
        let before = service.listPageCallCount

        await sut.loadMore()

        XCTAssertEqual(service.listPageCallCount, before)
    }

    func test_loadInitial_passesRealCurrentUserId() async {
        let (sut, service) = makeSUT(currentUserId: "me")
        service.listPageResult = .success(ConversationPage(items: [], rawItems: [], nextCursor: nil, hasMore: false))
        await sut.loadInitial()
        XCTAssertEqual(service.lastListPageCurrentUserId, "me",
                       "un id vide annule participantUserId, donc la déduplication par personne")
    }

    // MARK: - Search

    func test_search_mergesConversationsThenContacts_andDropsStaleResponses() async {
        let (sut, service) = makeSUT()
        service.searchResult = .success([makeAPIConv("c9", participantUserId: "u1")])
        friendService.allFriendRequestsResult = .success(pageOf([makeAccepted(otherId: "u1")]))
        directoryService.listResult = .success(pageOf([makeDirectoryContact(userId: "u2")]))

        await sut.search("ali")

        XCTAssertEqual(sut.targets.map(\.id), ["conv:c9", "user:u2"],
                       "u1 est absorbé par sa conversation directe ; u2 reste")
    }

    func test_search_belowTwoCharacters_doesNotHitTheNetwork() async {
        let (sut, service) = makeSUT()
        await sut.search("a")
        XCTAssertEqual(service.searchCallCount, 0)
    }

    /// `FriendService.allFriendRequests` n'a pas de recherche texte côté
    /// serveur — sans filtre client, taper une requête quelconque au-delà de
    /// 2 caractères remonterait la liste COMPLÈTE des amis mêlée aux vrais
    /// résultats. Deux amis dans la fixture : un seul correspond à « ali ».
    func test_search_filtersFriendsByQuery_excludesNonMatchingFriend() async {
        let (sut, _) = makeSUT()
        friendService.allFriendRequestsResult = .success(pageOf([
            makeAccepted(otherId: "u1", username: "alice"),
            makeAccepted(otherId: "u2", username: "bob")
        ]))

        await sut.search("ali")

        XCTAssertEqual(sut.targets.map(\.id), ["user:u1"],
                       "bob ne correspond pas à « ali » et ne doit pas apparaître")
    }

    /// Une recherche dont la réponse réseau est différée ne doit JAMAIS
    /// écraser les résultats d'une recherche PLUS RÉCENTE arrivée entre
    /// temps. Le double contrôlable (`searchHandler` + `ResponseGate`)
    /// retarde la réponse de la PREMIÈRE requête ("al") jusqu'à ce que la
    /// SECONDE ("ali") ait déjà écrit `targets`.
    func test_search_dropsStaleResponse_whenAnEarlierSearchResolvesLate() async {
        let (sut, service) = makeSUT()
        let staleConv = makeAPIConv("cSTALE", participantUserId: "uStale")
        let freshConv = makeAPIConv("cFresh", participantUserId: "uFresh")
        let gate = ResponseGate()

        service.searchHandler = { query in
            if query == "al" {
                await gate.arriveAndWait()
                return .success([staleConv])
            }
            return .success([freshConv])
        }

        let staleTask = Task { await sut.search("al") }
        // Attend que la première recherche ait RÉELLEMENT posé searchText =
        // "al" et atteint l'appel réseau (bloqué sur la grille) avant de
        // lancer la seconde — élimine toute course avec le spawn du Task.
        await gate.waitForArrival()

        await sut.search("ali")
        XCTAssertEqual(sut.targets.map(\.id), ["conv:cFresh"], "la recherche récente doit déjà être posée")

        await gate.open()
        _ = await staleTask.value

        XCTAssertEqual(sut.targets.map(\.id), ["conv:cFresh"],
                       "la réponse tardive de « al » ne doit jamais écraser celle de « ali »")
    }
}

/// Rendez-vous minimal pour les tests de garde anti-réponse-périmée : la
/// double contrôlable signale son ARRIVÉE (la requête a atteint le réseau)
/// puis se bloque jusqu'à ce que le test l'autorise explicitement à
/// répondre. Élimine tout timing basé sur `Task.sleep`.
private actor ResponseGate {
    private var hasArrived = false
    private var isOpen = false
    private var arrivalContinuation: CheckedContinuation<Void, Never>?
    private var openContinuation: CheckedContinuation<Void, Never>?

    func waitForArrival() async {
        if hasArrived { return }
        await withCheckedContinuation { arrivalContinuation = $0 }
    }

    func arriveAndWait() async {
        hasArrived = true
        arrivalContinuation?.resume()
        arrivalContinuation = nil
        if isOpen { return }
        await withCheckedContinuation { openContinuation = $0 }
    }

    func open() {
        isOpen = true
        openContinuation?.resume()
        openContinuation = nil
    }
}
