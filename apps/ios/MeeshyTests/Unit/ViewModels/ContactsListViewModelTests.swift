import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ContactsListViewModelTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        FriendshipCache.shared.clear()
        await CacheCoordinator.shared.friends.invalidate(for: "friends_list")
    }

    override func tearDown() async throws {
        FriendshipCache.shared.clear()
        await CacheCoordinator.shared.friends.invalidate(for: "friends_list")
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        friendService: MockFriendService = MockFriendService(),
        currentUserId: String = "me"
    ) -> (sut: ContactsListViewModel, friendService: MockFriendService) {
        let sut = ContactsListViewModel(
            friendService: friendService,
            currentUserId: currentUserId,
            friendshipCache: .shared
        )
        return (sut, friendService)
    }

    // MARK: - Cache observation

    /// Removal-driven update: when another screen drops a friend from the
    /// cache (block, unfriend, profile sheet removal), the contacts list
    /// must reflect it without a manual refresh.
    ///
    /// We prime the cache *before* instantiating the SUT so the observer's
    /// `lastObservedFriendIds` starts with alice already present — that
    /// isolates the test to the removal path and prevents the addition
    /// path from triggering an async network refetch.
    func test_friendshipCacheRemoval_removesContactFromList() async {
        FriendshipCache.shared.didAcceptRequest(from: "alice")
        await yieldMainActor()

        let (sut, _) = makeSUT()
        let alice = FriendRequestFixture.make(senderId: "alice", receiverId: "me").sender!
        sut.friends = [alice]

        FriendshipCache.shared.didRemoveFriend("alice")
        await yieldMainActor()

        XCTAssertTrue(
            sut.friends.isEmpty,
            "Removing a friend from the cache must drop them from the contacts list"
        )
    }

    /// Acceptance from another screen triggers a network refetch — the
    /// new contact arrives with full FriendRequestUser details (name,
    /// avatar, presence) that the cache alone can't provide.
    func test_friendshipCacheAddition_triggersBackgroundRefetch() async {
        // `sut` is bound (not `_`) on purpose: the ViewModel owns the Combine
        // subscription to `FriendshipCache.$version`. Discarding it releases the
        // ViewModel immediately, tearing down the subscription before the cache
        // mutation propagates — so the refetch never fires. `withExtendedLifetime`
        // below keeps it alive across the awaits without an "unused" warning.
        let (sut, friendService) = makeSUT()
        let newFriend = FriendRequestFixture.make(
            id: "req-new",
            senderId: "eve",
            receiverId: "me",
            status: "accepted"
        )
        friendService.allFriendRequestsResult = .success(
            FriendRequestFixture.makePaginated(requests: [newFriend])
        )

        FriendshipCache.shared.didAcceptRequest(from: "eve")
        await yieldMainActor()
        // Give the dispatched refetch a moment to land.
        for _ in 0..<5 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 50_000_000)

        withExtendedLifetime(sut) {
            XCTAssertGreaterThanOrEqual(
                friendService.allFriendRequestsCallCount,
                1,
                "Cache addition must trigger a SWR refetch to hydrate the user record"
            )
        }
    }

    // MARK: - Fresh cache + lag detection

    /// Guarantee: even when the GRDB cache reports `.fresh`, if the in-memory
    /// FriendshipCache disagrees (because another screen flipped the state
    /// while this ViewModel was asleep), we must force a background fetch.
    /// Otherwise a freshly-accepted friend from Discover would never reach
    /// the Contacts list until the 5-minute staleTTL elapses.
    func test_loadFriends_freshCacheLaggingBehindFriendshipCache_triggersRevalidate() async {
        let knownFriend = FriendRequestFixture.make(senderId: "old", receiverId: "me").sender!
        try? await CacheCoordinator.shared.friends.save([knownFriend], for: FriendshipCache.PersistenceKeys.friendsList)

        // FriendshipCache has TWO friends (one of which the GRDB cache
        // doesn't know about yet) — that's the "lag" we want detected.
        FriendshipCache.shared.didAcceptRequest(from: "old")
        FriendshipCache.shared.didAcceptRequest(from: "new")
        await yieldMainActor()

        let (sut, friendService) = makeSUT()
        friendService.allFriendRequestsResult = .success(
            FriendRequestFixture.makePaginated(requests: [])
        )

        await sut.loadFriends()
        // Yield enough times for the background revalidate Task to land.
        for _ in 0..<10 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertGreaterThanOrEqual(
            friendService.allFriendRequestsCallCount,
            1,
            "A fresh cache that lags behind FriendshipCache must trigger a background revalidate"
        )
    }

    // MARK: - Load Friends

    func test_loadFriends_filtersAcceptedOnly() async {
        let (sut, mock) = makeSUT()
        let accepted = FriendRequestFixture.make(id: "r1", senderId: "other1", receiverId: "me", status: "accepted", senderUsername: "alice")
        let pending = FriendRequestFixture.make(id: "r2", senderId: "other2", receiverId: "me", status: "pending", senderUsername: "bob")
        mock.allFriendRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [accepted, pending]))

        await sut.loadFriends()

        XCTAssertEqual(sut.friends.count, 1)
        XCTAssertEqual(sut.friends.first?.username, "alice")
    }

    func test_loadFriends_mergesSentAndReceived() async {
        let (sut, mock) = makeSUT()
        let received = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice")
        let sent = FriendRequestFixture.make(id: "r2", senderId: "me", receiverId: "bob", status: "accepted", receiverUsername: "bob")
        mock.allFriendRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [received, sent]))

        await sut.loadFriends()

        XCTAssertEqual(sut.friends.count, 2)
        let usernames = Set(sut.friends.map(\.username))
        XCTAssertTrue(usernames.contains("alice"))
        XCTAssertTrue(usernames.contains("bob"))
    }

    func test_loadFriends_deduplicates() async {
        let (sut, mock) = makeSUT()
        let fromReceived = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice")
        let fromSent = FriendRequestFixture.make(id: "r2", senderId: "me", receiverId: "alice", status: "accepted", receiverUsername: "alice")
        mock.allFriendRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [fromReceived, fromSent]))

        await sut.loadFriends()

        XCTAssertEqual(sut.friends.count, 1)
    }

    /// La régression que ce chantier corrige : `/friend-requests/received`
    /// filtre `pending` en dur côté serveur, donc une relation acceptée où
    /// je suis le RECEVEUR n'y apparaissait jamais. `allFriendRequests`
    /// couvre les deux sens via `/users/friend-requests`.
    func test_loadFriends_includesAcceptedRequestsWhereUserIsReceiver() async {
        let (sut, friendService) = makeSUT(currentUserId: "me")
        friendService.allFriendRequestsResult = .success(
            FriendRequestFixture.makePaginated(requests: [
                FriendRequestFixture.make(id: "r1", senderId: "other", receiverId: "me", status: "accepted")
            ])
        )

        await sut.loadFriends(forceNetwork: true)

        XCTAssertEqual(
            sut.friends.map(\.id), ["other"],
            "une relation acceptée où je suis le receveur DOIT apparaître dans mes contacts"
        )
    }

    // MARK: - Pagination

    /// `MockFriendService.allFriendRequestsResult` est un `Result` FIXE : il ne
    /// peut pas varier d'un appel à l'autre. Ces tests utilisent
    /// `allFriendRequestsResults` (séquence dépilée appel par appel) pour
    /// exercer réellement la boucle `while true` de `fetchFriendsFromNetwork` —
    /// sans ça, aucun test n'exerce la pagination au-delà du premier tour.
    ///
    /// Bâtit une page dont `pagination.hasMore` peut être ABSENT (`nil`), ce que
    /// `FriendRequestFixture.makePaginated` ne permet pas (elle sérialise
    /// toujours la clé). Réplique sa sérialisation JSON en omettant la clé
    /// `hasMore` quand `hasMore == nil`, pour exercer le repli
    /// `page.pagination?.hasMore ?? (page.data.count == pageSize)`.
    private func makePage(
        requests: [FriendRequest],
        hasMore: Bool?,
        total: Int? = nil,
        limit: Int = 100,
        offset: Int = 0
    ) -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        let now = ISO8601DateFormatter().string(from: Date())
        let requestsJson = requests.map { req -> String in
            let messageJson = req.message.map { "\"\($0)\"" } ?? "null"
            let senderJson = req.sender.map { s in
                """
                {"id":"\(s.id)","username":"\(s.username)","firstName":null,"lastName":null,"displayName":"\(s.name)","avatar":null,"isOnline":\(s.isOnline ?? false),"lastActiveAt":"\(now)"}
                """
            } ?? "null"
            let receiverJson = req.receiver.map { r in
                """
                {"id":"\(r.id)","username":"\(r.username)","firstName":null,"lastName":null,"displayName":"\(r.name)","avatar":null,"isOnline":\(r.isOnline ?? false),"lastActiveAt":"\(now)"}
                """
            } ?? "null"
            return """
            {"id":"\(req.id)","senderId":"\(req.senderId)","receiverId":"\(req.receiverId)","message":\(messageJson),"status":"\(req.status)","sender":\(senderJson),"receiver":\(receiverJson),"respondedAt":null,"createdAt":"\(now)","updatedAt":"\(now)"}
            """
        }.joined(separator: ",")

        let resolvedTotal = total ?? requests.count
        let hasMoreField = hasMore.map { "\"hasMore\": \($0)," } ?? ""
        let json = """
        {
            "success": true,
            "data": [\(requestsJson)],
            "pagination": {
                "total": \(resolvedTotal),
                \(hasMoreField)
                "limit": \(limit),
                "offset": \(offset)
            }
        }
        """
        return JSONStub.decode(json)
    }

    /// Cœur de la Task 2 : pagine jusqu'à épuisement. Page 1 (`hasMore: true`,
    /// pleine) doit enchaîner sur la page 2 (`hasMore: false`) avec `offset: 100`,
    /// et la liste finale doit contenir l'union des deux pages.
    func test_loadFriends_paginatesAcrossTwoPagesUntilExhausted() async {
        let (sut, friendService) = makeSUT(currentUserId: "me")
        let firstPage = (1...100).map {
            FriendRequestFixture.make(id: "p1-\($0)", senderId: "friend-\($0)", receiverId: "me", status: "accepted")
        }
        let secondPage = [
            FriendRequestFixture.make(id: "p2-1", senderId: "friend-101", receiverId: "me", status: "accepted")
        ]
        friendService.allFriendRequestsResults = [
            .success(makePage(requests: firstPage, hasMore: true, total: 101, offset: 0)),
            .success(makePage(requests: secondPage, hasMore: false, total: 101, offset: 100))
        ]

        await sut.loadFriends(forceNetwork: true)

        XCTAssertEqual(sut.friends.count, 101, "la liste finale doit contenir l'union des deux pages")
        let ids = Set(sut.friends.map(\.id))
        XCTAssertTrue(ids.contains("friend-1") && ids.contains("friend-100") && ids.contains("friend-101"))
        XCTAssertEqual(friendService.allFriendRequestsCallCount, 2)
        XCTAssertEqual(
            friendService.allFriendRequestsOffsets, [0, 100],
            "le second appel doit recevoir offset: 100, pas rejouer offset: 0"
        )
    }

    /// Repli pour un gateway antérieur à la Task 1 (`hasMore` absent du bloc
    /// `pagination`) : une page PLEINE (`data.count == limit`) doit être
    /// interprétée comme « il en reste » — la boucle continue.
    func test_loadFriends_missingHasMoreWithFullPage_continuesPagination() async {
        let (sut, friendService) = makeSUT(currentUserId: "me")
        let firstPage = (1...100).map {
            FriendRequestFixture.make(id: "p1-\($0)", senderId: "friend-\($0)", receiverId: "me", status: "accepted")
        }
        let secondPage = [
            FriendRequestFixture.make(id: "p2-1", senderId: "friend-101", receiverId: "me", status: "accepted")
        ]
        friendService.allFriendRequestsResults = [
            .success(makePage(requests: firstPage, hasMore: nil, offset: 0)),
            .success(makePage(requests: secondPage, hasMore: false, offset: 100))
        ]

        await sut.loadFriends(forceNetwork: true)

        XCTAssertEqual(
            friendService.allFriendRequestsCallCount, 2,
            "hasMore absent + page pleine (== limit) doit être traité comme 'il en reste', pas comme la fin"
        )
    }

    /// Même absence de `hasMore`, mais une page PARTIELLE (`data.count < limit`)
    /// doit être interprétée comme la fin — un seul appel, pas de boucle infinie.
    func test_loadFriends_missingHasMoreWithPartialPage_stopsAfterOneCall() async {
        let (sut, friendService) = makeSUT(currentUserId: "me")
        let onlyPage = [
            FriendRequestFixture.make(id: "p1-1", senderId: "friend-1", receiverId: "me", status: "accepted"),
            FriendRequestFixture.make(id: "p1-2", senderId: "friend-2", receiverId: "me", status: "accepted"),
            FriendRequestFixture.make(id: "p1-3", senderId: "friend-3", receiverId: "me", status: "accepted")
        ]
        friendService.allFriendRequestsResults = [
            .success(makePage(requests: onlyPage, hasMore: nil, offset: 0))
        ]

        await sut.loadFriends(forceNetwork: true)

        XCTAssertEqual(
            friendService.allFriendRequestsCallCount, 1,
            "hasMore absent + page partielle (< limit) doit être traité comme la fin — un seul appel"
        )
        XCTAssertEqual(sut.friends.count, 3)
    }

    /// Résidu de chantier : le jumeau de `fetchContactsFromNetwork`
    /// (`NewConversationViewModel`) partage la même boucle `while true` non
    /// bornée. Même double, même sémantique : 6 pages PLEINES à
    /// `hasMore: true` (une de plus que les 5 que la borne de 500 autorise),
    /// puis repli naturel sur une page vide une fois la file épuisée — la
    /// boucle termine dans tous les cas, le test échoue par un écart de
    /// compteur, jamais par un blocage infini.
    func test_loadFriends_stopsAtSafetyCapEvenWhenGatewayAlwaysReportsHasMore() async {
        let (sut, friendService) = makeSUT(currentUserId: "me")
        friendService.allFriendRequestsResults = (0..<6).map { page in
            .success(FriendRequestFixture.makePaginated(
                requests: (1...100).map {
                    FriendRequestFixture.make(
                        id: "p\(page)-\($0)", senderId: "friend-\(page)-\($0)", receiverId: "me",
                        status: "accepted", senderUsername: "friend\(page)-\($0)"
                    )
                },
                total: 10_000, hasMore: true, limit: 100, offset: page * 100
            ))
        }

        await sut.loadFriends(forceNetwork: true)

        XCTAssertEqual(
            friendService.allFriendRequestsCallCount, 5,
            "la pagination doit s'arrêter à la borne de sécurité (500 relations / page 100), pas suivre indéfiniment un hasMore qui ne retombe jamais"
        )
    }

    // MARK: - Filtering

    func test_filterOnline_showsOnlyOnlineUsers() async {
        let (sut, mock) = makeSUT()
        let online = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice", senderIsOnline: true)
        let offline = FriendRequestFixture.make(id: "r2", senderId: "bob", receiverId: "me", status: "accepted", senderUsername: "bob", senderIsOnline: false)
        mock.allFriendRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [online, offline]))

        await sut.loadFriends()
        sut.setFilter(.online)

        XCTAssertEqual(sut.filteredFriends.count, 1)
        XCTAssertEqual(sut.filteredFriends.first?.username, "alice")
    }

    func test_filterOffline_showsOnlyOfflineUsers() async {
        let (sut, mock) = makeSUT()
        let online = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice", senderIsOnline: true)
        let offline = FriendRequestFixture.make(id: "r2", senderId: "bob", receiverId: "me", status: "accepted", senderUsername: "bob", senderIsOnline: false)
        mock.allFriendRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [online, offline]))

        await sut.loadFriends()
        sut.setFilter(.offline)

        XCTAssertEqual(sut.filteredFriends.count, 1)
        XCTAssertEqual(sut.filteredFriends.first?.username, "bob")
    }

    // MARK: - Search

    func test_search_filtersLocallyByUsername() async {
        let (sut, mock) = makeSUT()
        let alice = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice")
        let bob = FriendRequestFixture.make(id: "r2", senderId: "bob", receiverId: "me", status: "accepted", senderUsername: "bob")
        mock.allFriendRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [alice, bob]))

        await sut.loadFriends()
        sut.search("ali")

        XCTAssertEqual(sut.filteredFriends.count, 1)
        XCTAssertEqual(sut.filteredFriends.first?.username, "alice")
    }

    // MARK: - Sorting

    func test_sorting_onlineFirst() async {
        let (sut, mock) = makeSUT()
        let offline = FriendRequestFixture.make(id: "r1", senderId: "alice", receiverId: "me", status: "accepted", senderUsername: "alice", senderIsOnline: false)
        let online = FriendRequestFixture.make(id: "r2", senderId: "bob", receiverId: "me", status: "accepted", senderUsername: "bob", senderIsOnline: true)
        mock.allFriendRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [offline, online]))

        await sut.loadFriends()

        XCTAssertEqual(sut.filteredFriends.first?.username, "bob")
    }

    // MARK: - Helper

    private func yieldMainActor() async {
        for _ in 0..<5 { await Task.yield() }
    }
}
