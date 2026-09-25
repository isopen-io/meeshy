import XCTest
@testable import Meeshy
import MeeshySDK

/// #7847 — le magasin des contacts de la liste `@` : cache d'abord, réseau
/// seulement si le cache est vide ou périmé, jamais deux fois en parallèle,
/// et un échec n'efface rien.
@MainActor
final class MentionContactsStoreTests: XCTestCase {

    private final class Spy {
        var cache: CacheResult<[FriendRequestUser]> = .empty
        var saved: [[FriendRequestUser]] = []
        var fetchResult: Result<[FriendRequestUser], Error> = .success([])
        var fetchCount = 0
        var now = Date(timeIntervalSince1970: 1_000)
    }

    private func friend(_ id: String, _ username: String) -> FriendRequestUser {
        FriendRequestUser(id: id, username: username, firstName: nil, lastName: nil,
                          displayName: username.capitalized, avatar: nil, isOnline: nil, lastActiveAt: nil)
    }

    private func makeSUT(currentUserId: String? = "moi") -> (MentionContactsStore, Spy) {
        let spy = Spy()
        let sut = MentionContactsStore(
            loadCache: { spy.cache },
            saveCache: { spy.saved.append($0) },
            fetchFriends: {
                spy.fetchCount += 1
                return try spy.fetchResult.get()
            },
            currentUserId: { currentUserId },
            now: { spy.now }
        )
        return (sut, spy)
    }

    func test_loadCached_staleCache_servesItWithoutNetwork() async {
        let (sut, spy) = makeSUT()
        spy.cache = .stale([friend("c1", "zoe")], age: 999)

        let served = await sut.loadCached()

        XCTAssertEqual(served.map(\.username), ["zoe"])
        XCTAssertEqual(spy.fetchCount, 0)
    }

    func test_refreshIfNeeded_freshCache_makesNoNetworkCall() async {
        let (sut, spy) = makeSUT()
        spy.cache = .fresh([friend("c1", "zoe")], age: 1)

        let served = await sut.refreshIfNeeded()

        XCTAssertEqual(served.map(\.username), ["zoe"])
        XCTAssertEqual(spy.fetchCount, 0)
    }

    func test_refreshIfNeeded_emptyCache_fetchesAndWritesTheCache() async {
        let (sut, spy) = makeSUT()
        spy.fetchResult = .success([friend("c1", "zoe")])

        let served = await sut.refreshIfNeeded()

        XCTAssertEqual(served.map(\.username), ["zoe"])
        XCTAssertEqual(spy.fetchCount, 1)
        XCTAssertEqual(spy.saved.first?.map(\.id), ["c1"])
        XCTAssertEqual(sut.snapshot.map(\.username), ["zoe"])
    }

    func test_refreshIfNeeded_staleCache_servesThenRevalidates() async {
        let (sut, spy) = makeSUT()
        spy.cache = .stale([friend("c1", "zoe")], age: 999)
        spy.fetchResult = .success([friend("c1", "zoe"), friend("c2", "yann")])

        let served = await sut.refreshIfNeeded()

        XCTAssertEqual(spy.fetchCount, 1)
        XCTAssertEqual(served.map(\.username), ["zoe", "yann"])
    }

    func test_refreshIfNeeded_networkFailure_keepsWhatTheCacheServed() async {
        let (sut, spy) = makeSUT()
        spy.cache = .stale([friend("c1", "zoe")], age: 999)
        spy.fetchResult = .failure(NSError(domain: "test", code: 404))

        let served = await sut.refreshIfNeeded()

        XCTAssertEqual(served.map(\.username), ["zoe"], "un échec réseau n'efface pas le cache")
    }

    func test_refreshIfNeeded_afterAFailure_doesNotRetryImmediately() async {
        let (sut, spy) = makeSUT()
        spy.fetchResult = .failure(NSError(domain: "test", code: 404))

        _ = await sut.refreshIfNeeded()
        _ = await sut.refreshIfNeeded()

        XCTAssertEqual(spy.fetchCount, 1, "une route en panne ne coûte pas un aller-retour par `@`")
    }

    func test_refreshIfNeeded_afterASuccess_staysQuietWhileFreshInMemory() async {
        let (sut, spy) = makeSUT()
        spy.fetchResult = .success([friend("c1", "zoe")])

        _ = await sut.refreshIfNeeded()
        _ = await sut.refreshIfNeeded()

        XCTAssertEqual(spy.fetchCount, 1)
    }

    func test_refreshIfNeeded_concurrentCalls_shareOneFetch() async {
        let (sut, spy) = makeSUT()
        spy.fetchResult = .success([friend("c1", "zoe")])

        async let first = sut.refreshIfNeeded()
        async let second = sut.refreshIfNeeded()
        _ = await (first, second)

        XCTAssertEqual(spy.fetchCount, 1)
    }

    func test_snapshot_neverContainsTheCurrentUser() async {
        let (sut, spy) = makeSUT(currentUserId: "moi")
        spy.cache = .fresh([friend("moi", "me"), friend("c1", "zoe")], age: 1)

        _ = await sut.loadCached()

        XCTAssertEqual(sut.snapshot.map(\.id), ["c1"])
    }

    func test_refreshIfNeeded_signedOut_makesNoNetworkCall() async {
        let (sut, spy) = makeSUT(currentUserId: nil)

        _ = await sut.refreshIfNeeded()

        XCTAssertEqual(spy.fetchCount, 0)
    }
}
