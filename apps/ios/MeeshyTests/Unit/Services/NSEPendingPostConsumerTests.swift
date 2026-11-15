import XCTest
@testable import Meeshy
import MeeshySDK

/// #7809 — un post préchargé par la NSE est un INSTANTANÉ pris au moment du
/// push : il doit se peindre tout de suite (cache-first) ET se revalider. Rangé
/// `.fresh`, `PostDetailViewModel.loadPost` s'arrêtait sur lui sans réseau.
@MainActor
final class NSEPendingPostConsumerTests: XCTestCase {

    private static let postId = "nse-seed-7809"

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.feed.invalidate(for: Self.postId)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.feed.invalidate(for: Self.postId)
        try await super.tearDown()
    }

    private func stagePost(createdAt: String) throws -> URL {
        let json = """
        {"id":"\(Self.postId)","type":"POST","content":"instantané NSE","createdAt":"\(createdAt)","author":{"id":"a1","username":"alice"}}
        """
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(Self.postId)-\(UUID().uuidString).json")
        try Data(json.utf8).write(to: url)
        return url
    }

    func test_consume_prefetchedPost_isSeededStaleNotFresh() async throws {
        let url = try stagePost(createdAt: "2026-09-24T09:34:23.563Z")

        await NSEPendingPostConsumer.shared.consume([(url: url, data: try Data(contentsOf: url))])

        guard case .stale(let posts, _) = await CacheCoordinator.shared.feed.load(for: Self.postId) else {
            return XCTFail("un instantané NSE doit entrer en .stale : peint tout de suite, puis revalidé")
        }
        XCTAssertEqual(posts.first?.id, Self.postId)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path),
                       "le fichier préchargé part une fois le post rangé")
    }

    func test_loadPost_afterNSESeed_paintsThenRevalidatesFromNetwork() async throws {
        let url = try stagePost(createdAt: "2026-09-24T09:34:23.563Z")
        await NSEPendingPostConsumer.shared.consume([(url: url, data: try Data(contentsOf: url))])
        let postService = MockPostService()
        postService.getPostResult = .success(JSONStub.decode("""
        {"id":"\(Self.postId)","type":"POST","content":"version réseau","createdAt":"2026-09-24T09:34:23.563Z","author":{"id":"a1","username":"alice"}}
        """))
        let sut = PostDetailViewModel(
            postService: postService,
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            offlineQueue: OfflineQueue.shared,
            socialSocket: MockSocialSocket()
        )

        await sut.loadPost(Self.postId)

        XCTAssertEqual(postService.getPostCallCount, 1,
                       "l'instantané NSE ne dispense pas du réseau : il se revalide")
        XCTAssertEqual(sut.post?.content, "version réseau")
    }

    func test_consume_wireDateWithoutFractions_decodesWithTheAPIClientDecoder() async throws {
        let url = try stagePost(createdAt: "2026-09-24T09:34:23Z")

        await NSEPendingPostConsumer.shared.consume([(url: url, data: try Data(contentsOf: url))])

        guard case .stale(let posts, _) = await CacheCoordinator.shared.feed.load(for: Self.postId) else {
            return XCTFail("une date du fil sans fractions de seconde doit se décoder comme chez l'APIClient")
        }
        XCTAssertEqual(posts.first?.timestamp, WireDate.date(from: "2026-09-24T09:34:23Z"))
    }
}
