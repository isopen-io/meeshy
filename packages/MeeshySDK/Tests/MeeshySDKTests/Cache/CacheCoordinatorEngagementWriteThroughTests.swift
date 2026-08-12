import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// P1 (revue local-first 2026-08-01, fiche stores-07) — le CacheCoordinator ne
/// répercutait que `post:liked`/`post:unliked` dans le store feed. Les autres
/// événements d'engagement (commentaire ajouté/supprimé, bookmark, post
/// supprimé) n'étaient appliqués qu'aux collections RAM des ViewModels
/// abonnés : toute clé cache non affichée gardait l'ancien état — y compris un
/// post supprimé qui ressuscitait au prochain cold start.
///
/// Tous ces événements portent des compteurs ABSOLUS : le cache est la
/// projection du serveur, jamais une somme de deltas locaux.
final class CacheCoordinatorEngagementWriteThroughTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: dateStr) { return date }
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(
                in: container, debugDescription: "Invalid date: \(dateStr)"
            )
        }
        return d
    }()

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeSUT() throws -> (CacheCoordinator, MockSocialSocket) {
        let socialSocket = MockSocialSocket()
        let coordinator = CacheCoordinator(
            messageSocket: MockMessageSocket(),
            socialSocket: socialSocket,
            db: try makeDB()
        )
        return (coordinator, socialSocket)
    }

    private func makePost(id: String, commentCount: Int = 1) -> FeedPost {
        var post = FeedPost(id: id, author: "Alice", type: "REEL", content: "hello")
        post.commentCount = commentCount
        return post
    }

    /// Attend que le prédicat devienne vrai : le relais socket saute sur
    /// l'actor, donc l'écriture n'est pas synchrone avec le `send`.
    private func waitFor(
        _ coordinator: CacheCoordinator, key: String, postId: String,
        timeout: TimeInterval = 2,
        until predicate: @escaping (FeedPost?) -> Bool
    ) async -> FeedPost? {
        let deadline = Date().addingTimeInterval(timeout)
        var last: FeedPost?
        while Date() < deadline {
            last = await coordinator.feed.load(for: key).snapshot()?
                .first(where: { $0.id == postId })
            if predicate(last) { return last }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return last
    }

    private func makeCommentAdded(postId: String, commentCount: Int) throws -> SocketCommentAddedData {
        try decoder.decode(SocketCommentAddedData.self, from: Data("""
        {
            "postId": "\(postId)",
            "comment": {
                "id": "c1",
                "content": "Nice post",
                "createdAt": "2026-03-06T11:00:00.000Z",
                "author": {"id": "author2", "username": "bob"}
            },
            "commentCount": \(commentCount)
        }
        """.utf8))
    }

    func test_commentAdded_patchesAbsoluteCommentCountEverywhere() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        try await coordinator.feed.save([makePost(id: "p1", commentCount: 1),
                                         makePost(id: "p2", commentCount: 9)], for: "main-feed")
        try await coordinator.feed.save([makePost(id: "p1", commentCount: 1)], for: "p1")

        socket.commentAdded.send(try makeCommentAdded(postId: "p1", commentCount: 5))

        for key in ["main-feed", "p1"] {
            let post = await waitFor(coordinator, key: key, postId: "p1") { $0?.commentCount == 5 }
            XCTAssertEqual(post?.commentCount, 5,
                           "la clé \(key) doit porter le compteur absolu du serveur")
        }
        let untouched = await coordinator.feed.load(for: "main-feed").snapshot()?
            .first(where: { $0.id == "p2" })?.commentCount
        XCTAssertEqual(untouched, 9, "les autres posts ne doivent pas bouger")
    }

    func test_commentDeleted_patchesAbsoluteCommentCountEverywhere() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        try await coordinator.feed.save([makePost(id: "p1", commentCount: 5)], for: "main-feed")
        try await coordinator.feed.save([makePost(id: "p1", commentCount: 5)], for: "p1")

        socket.commentDeleted.send(SocketCommentDeletedData(
            postId: "p1", commentId: "c1", commentCount: 4
        ))

        for key in ["main-feed", "p1"] {
            let post = await waitFor(coordinator, key: key, postId: "p1") { $0?.commentCount == 4 }
            XCTAssertEqual(post?.commentCount, 4,
                           "la clé \(key) doit porter le compteur absolu du serveur")
        }
    }

    /// `post:bookmarked` n'est émis QUE vers l'utilisateur qui a bookmarké
    /// (événement personnel, vérifié côté gateway) : réécrire
    /// `isBookmarkedByMe` sans filtre d'acteur est donc sûr.
    func test_postBookmarked_patchesBookmarkStateEverywhere() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        try await coordinator.feed.save([makePost(id: "p1")], for: "main-feed")
        try await coordinator.feed.save([makePost(id: "p1")], for: "p1")

        socket.postBookmarked.send(SocketPostBookmarkedData(
            postId: "p1", bookmarked: true, bookmarkCount: 3
        ))

        for key in ["main-feed", "p1"] {
            let post = await waitFor(coordinator, key: key, postId: "p1") { $0?.isBookmarkedByMe == true }
            XCTAssertEqual(post?.isBookmarkedByMe, true,
                           "la clé \(key) doit refléter le bookmark de l'utilisateur courant")
            XCTAssertEqual(post?.bookmarkCount, 3)
        }
    }

    func test_postDeleted_removesPostFromEveryCacheKey() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        try await coordinator.feed.save([makePost(id: "p1"),
                                         makePost(id: "p2")], for: "main-feed")
        try await coordinator.feed.save([makePost(id: "p1")], for: "p1")

        socket.postDeleted.send("p1")

        for key in ["main-feed", "p1"] {
            let post = await waitFor(coordinator, key: key, postId: "p1") { $0 == nil }
            XCTAssertNil(post, "un post supprimé ne doit plus exister sous la clé \(key)")
        }
        let survivor = await coordinator.feed.load(for: "main-feed").snapshot()?
            .first(where: { $0.id == "p2" })
        XCTAssertNotNil(survivor, "les autres posts survivent à la suppression")
    }
}
