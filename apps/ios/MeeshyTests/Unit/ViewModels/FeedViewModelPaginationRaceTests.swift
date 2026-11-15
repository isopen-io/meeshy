import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le fil ne perd plus les pages chargées, et ne saute plus celles du milieu.**
///
/// - Revenir sur le fil (réabonnement) ou une reconnexion du socket relisait la
///   page 1 et REMPLAÇAIT la liste : après trois pages, il en restait une, la
///   carte lue disparaissait et le curseur repartait de la page 2.
/// - Une page « suivante » demandée avant un « tirer pour rafraîchir » et
///   revenue après se collait derrière la nouvelle page 1 : les pages du milieu
///   n'étaient plus jamais montrées.
@MainActor
final class FeedViewModelPaginationRaceTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: "main-feed")
    }

    private func makeSUT(api: MockAPIClientForApp, socket: MockSocialSocket = MockSocialSocket()) -> FeedViewModel {
        FeedViewModel(
            api: api,
            socialSocket: socket,
            postService: MockPostService(),
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            offlineQueue: MockOfflineQueue(),
            feedCache: SharedFeedCache()
        )
    }

    /// Des posts aux dates DÉCROISSANTES : `first` est le plus récent.
    private static func page(_ ids: ClosedRange<Int>, prefix: String = "p", nextCursor: String?) -> PaginatedAPIResponse<[APIPost]> {
        let items = ids.map { index in
            let minute = String(format: "%02d", 59 - index)
            return """
            {"id":"\(prefix)\(index)","type":"POST","content":"post \(index)","createdAt":"2026-01-15T12:\(minute):00.000Z","likeCount":0,"commentCount":0,"author":{"id":"a","username":"alice"}}
            """
        }
        let pagination = nextCursor.map { #"{"nextCursor":"\#($0)","hasMore":true,"limit":20}"# } ?? "null"
        return JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"pagination":\(pagination),"error":null}
        """)
    }

    func test_silentHeadRefresh_keepsTheLoadedPages_andTheirCursor() async throws {
        let api = MockAPIClientForApp()
        let sut = makeSUT(api: api)

        api.stub("/posts/feed", result: Self.page(0...9, nextCursor: "c2"))
        await sut.loadFeed(forceRefresh: true)
        api.stub("/posts/feed", result: Self.page(10...19, nextCursor: "c3"))
        await sut.loadMoreIfNeeded(currentPost: try XCTUnwrap(sut.posts.last))
        XCTAssertEqual(sut.posts.count, 20)

        // Retour sur l'écran / reconnexion : la page 1 relue, rien de neuf.
        api.stub("/posts/feed", result: Self.page(0...9, nextCursor: "c2"))
        await sut.refreshHeadKeepingLoadedPages()

        XCTAssertEqual(sut.posts.map(\.id), (0...19).map { "p\($0)" },
                       "la relecture silencieuse de la tête ne doit pas jeter les pages déjà chargées")

        // La page suivante reprend APRÈS la page 2, pas à la page 2.
        api.stub("/posts/feed", result: Self.page(20...29, nextCursor: nil))
        await sut.loadMoreIfNeeded(currentPost: try XCTUnwrap(sut.posts.last))
        XCTAssertEqual(api.paginatedCursors.last, "c3")
        XCTAssertEqual(sut.posts.count, 30)
    }

    func test_socketReconnect_keepsTheLoadedPages() async throws {
        let api = MockAPIClientForApp()
        let socket = MockSocialSocket()
        let sut = makeSUT(api: api, socket: socket)

        api.stub("/posts/feed", result: Self.page(0...9, nextCursor: "c2"))
        await sut.loadFeed(forceRefresh: true)
        api.stub("/posts/feed", result: Self.page(10...19, nextCursor: "c3"))
        await sut.loadMoreIfNeeded(currentPost: try XCTUnwrap(sut.posts.last))
        sut.subscribeToSocketEvents()

        api.stub("/posts/feed", result: Self.page(0...9, nextCursor: "c2"))
        let before = api.requestCount
        socket.didReconnect.send(())
        try await waitForCondition(timeout: 5) { api.requestCount > before }
        try await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(sut.posts.count, 20)
    }

    func test_pullToRefresh_discardsANextPageThatComesBackAfterIt() async throws {
        let api = MockAPIClientForApp()
        let sut = makeSUT(api: api)

        api.stub("/posts/feed", result: Self.page(0...9, nextCursor: "c2"))
        await sut.loadFeed(forceRefresh: true)

        // La page 2 part, et reste en vol.
        let release = AsyncStream<Void>.makeStream()
        let started = AsyncStream<Void>.makeStream()
        api.paginatedGate = { cursor in
            guard cursor == "c2" else { return }
            started.continuation.yield()
            for await _ in release.stream { break }
        }
        api.stub("/posts/feed", result: Self.page(10...19, nextCursor: "c3"))
        let anchor = try XCTUnwrap(sut.posts.last)
        let loadMore = Task { await sut.loadMoreIfNeeded(currentPost: anchor) }
        for await _ in started.stream { break }

        // Tirer pour rafraîchir : une page 1 neuve.
        api.stub("/posts/feed", result: Self.page(0...9, prefix: "n", nextCursor: "d2"))
        await sut.refresh()

        release.continuation.yield()
        await loadMore.value

        XCTAssertEqual(sut.posts.map(\.id), (0...9).map { "n\($0)" },
                       "la page 2 de l'ANCIENNE liste ne se colle pas derrière la nouvelle page 1")
    }
}
