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

    /// Un salon `public` tel que le rend `GET /conversations/search` : la route
    /// le retourne même si l'appelant n'en est PAS membre (`search.ts:131-137`).
    private func makePublicAPIConv(_ id: String, memberUserIds: [String]) -> APIConversation {
        APIConversation(
            id: id,
            type: "public",
            title: "Salon \(id)",
            participants: memberUserIds.map { uid in
                APIParticipant(
                    id: "p-\(uid)",
                    conversationId: id,
                    type: .user,
                    userId: uid,
                    displayName: "User \(uid)",
                    role: "MEMBER"
                )
            },
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

    /// La garde anti-boucle « zero-progress » protège une PAGE : elle doit la
    /// CONSERVER, pas l'abandonner. L'implémentation de référence
    /// (`ConversationListViewModel.loadMore`) appelle `appendConversations`
    /// AVANT la garde identique. Sans cet ordre, une réponse privée de
    /// `cursorPagination` — l'incident de mai 2026 que le commentaire de la
    /// garde cite lui-même — fait afficher « Aucune conversation » au sélecteur
    /// pendant que la liste principale montre sa page 1.
    func test_loadInitial_whenCursorNeverAdvances_keepsTheProtectedPage() async {
        let (sut, service) = makeSUT()
        service.listPageResult = .success(ConversationPage(items: [makeConv("c1")], rawItems: [], nextCursor: nil, hasMore: true))

        await sut.loadInitial()

        XCTAssertEqual(sut.targets.map(\.id), ["conv:c1"],
                       "la page que la garde protège doit rester affichée")
        XCTAssertFalse(sut.hasMore, "la garde force bien l'épuisement pour casser la boucle")
        XCTAssertEqual(sut.paginationState, .exhausted)
    }

    func test_loadInitial_passesRealCurrentUserId() async {
        let (sut, service) = makeSUT(currentUserId: "me")
        service.listPageResult = .success(ConversationPage(items: [], rawItems: [], nextCursor: nil, hasMore: false))
        await sut.loadInitial()
        XCTAssertEqual(service.lastListPageCurrentUserId, "me",
                       "un id vide annule participantUserId, donc la déduplication par personne")
    }

    // MARK: - Search

    /// Déduplication PAR PERSONNE de bout en bout : `u1` est à la fois un ami
    /// et l'interlocuteur de la conversation directe `c9` — il ne doit
    /// apparaître qu'UNE fois, absorbé par sa conversation.
    ///
    /// Le pseudo de l'ami DOIT correspondre à la requête (« alice » ⊃ « ali ») :
    /// depuis l'ajout du filtre client des amis, un ami qui ne correspond pas
    /// est écarté AVANT d'atteindre la fusion, et le témoin passait alors sans
    /// jamais exercer l'absorption. Retirer la ligne d'absorption de
    /// `ForwardTargetMerge.merge` fait bien tomber ce test (vérifié par
    /// mutation) : `targets` y devient `[conv:c9, user:u1, user:u2]`.
    func test_search_absorbsAContactAlreadyJoinedByADirectConversation() async {
        let (sut, service) = makeSUT()
        service.searchResult = .success([makeAPIConv("c9", participantUserId: "u1")])
        friendService.allFriendRequestsResult = .success(pageOf([makeAccepted(otherId: "u1", username: "alice")]))
        directoryService.listResult = .success(pageOf([makeDirectoryContact(userId: "u2")]))

        await sut.search("ali")

        XCTAssertEqual(sut.targets.map(\.id), ["conv:c9", "user:u2"],
                       "u1 est absorbé par sa conversation directe ; u2 reste")
    }

    /// Effacer la recherche doit RENDRE la liste de navigation. La sentinelle
    /// de pagination est le seul autre écrivain de `targets`, et elle est gatée
    /// sur `hasMore` : le témoin exige donc une liste SANS page suivante
    /// (`hasMore == false`, le cas de tout compte de moins de 50 conversations),
    /// sinon il passerait par accident. Sans restauration, le sélecteur reste
    /// figé sur les résultats d'une recherche effacée jusqu'à la fermeture de
    /// la feuille.
    func test_search_clearedBackToEmpty_restoresConversationTargets() async {
        let (sut, service) = makeSUT()
        service.listPageResult = .success(ConversationPage(items: [makeConv("c1")], rawItems: [], nextCursor: "cur1", hasMore: false))
        await sut.loadInitial()
        XCTAssertFalse(sut.hasMore, "sans cette précondition, la sentinelle réécrirait targets et le test passerait par accident")
        XCTAssertEqual(sut.targets.map(\.id), ["conv:c1"])

        service.searchResult = .success([makeAPIConv("c9", participantUserId: "u9")])
        await sut.search("ali")
        XCTAssertEqual(sut.targets.map(\.id), ["conv:c9"], "la recherche remplace bien la liste")

        await sut.search("")

        XCTAssertEqual(sut.targets.map(\.id), ["conv:c1"],
                       "effacer la recherche doit restaurer les cibles de navigation")
    }

    /// `GET /conversations/search` retourne DÉLIBÉRÉMENT les conversations
    /// `public`/`global` dont l'appelant n'est pas membre — elle sert aussi la
    /// recherche globale. Les offrir comme cible de transfert produit
    /// « Permissions insuffisantes pour envoyer des messages » : une cible qui
    /// ne peut jamais fonctionner. Le sélecteur ne retient donc que celles dont
    /// l'utilisateur est membre.
    func test_search_dropsPublicRoomWhereUserIsNotAMember() async {
        let (sut, service) = makeSUT(currentUserId: "me")
        service.searchResult = .success([
            makePublicAPIConv("cPublic", memberUserIds: ["u1", "u2"]),
            makePublicAPIConv("cJoined", memberUserIds: ["u1", "me"])
        ])

        await sut.search("photo")

        XCTAssertEqual(sut.targets.map(\.id), ["conv:cJoined"],
                       "un salon public dont on n'est pas membre ne doit jamais être offert comme cible")
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

    /// « N'importe quel contact » : `GET /users/friend-requests` n'a AUCUNE
    /// recherche texte serveur, le filtre est donc CLIENT — tant qu'une seule
    /// page est chargée, un ami au-delà de la première page reste inatteignable
    /// depuis le sélecteur (un utilisateur de 60 amis ne pouvait pas joindre le
    /// 55ᵉ avec l'ancienne limite de 50). On pagine jusqu'à épuisement.
    func test_search_paginatesFriendsUntilExhausted_findsFriendBeyondTheFirstPage() async {
        let (sut, _) = makeSUT()
        let firstPage = (1...100).map { makeAccepted(otherId: "u\($0)", username: "bob\($0)") }
        let secondPage = [makeAccepted(otherId: "u101", username: "alice")]
        friendService.allFriendRequestsResults = [
            .success(FriendRequestFixture.makePaginated(requests: firstPage, total: 101, hasMore: true, limit: 100, offset: 0)),
            .success(FriendRequestFixture.makePaginated(requests: secondPage, total: 101, hasMore: false, limit: 100, offset: 100))
        ]

        await sut.search("ali")

        XCTAssertEqual(sut.targets.map(\.id), ["user:u101"],
                       "un ami de la SECONDE page doit être atteignable depuis le sélecteur")
        XCTAssertEqual(friendService.allFriendRequestsOffsets, [0, 100],
                       "le second appel doit recevoir offset: 100, pas rejouer offset: 0")
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
