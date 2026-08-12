import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// Un post vit sous plusieurs clés du store `feed` — `main-feed`, `<postId>`
/// (détail), la clé du pager de réels, `bookmarks`. Avant ce câblage, un like
/// n'était appliqué qu'à la collection en mémoire du ViewModel qui l'avait
/// déclenché : rouvrir l'écran voisin ressortait l'ancien compteur, et le
/// détail — qui ne s'abonne pas aux likes — ne voyait jamais rien.
///
/// `post:liked` porte un `likeCount` ABSOLU : le cache est donc la projection
/// du serveur, pas une accumulation de deltas locaux.
final class CacheCoordinatorPostLikeWriteThroughTests: XCTestCase {

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

    private func makePost(id: String, likes: Int) -> FeedPost {
        var post = FeedPost(id: id, author: "Alice", type: "REEL", content: "hello")
        post.likes = likes
        return post
    }

    /// Attend que la valeur cible apparaisse : le relais socket saute sur l'actor,
    /// donc l'écriture n'est pas synchrone avec le `send`.
    private func waitForLikes(
        _ coordinator: CacheCoordinator, key: String, postId: String,
        expected: Int, timeout: TimeInterval = 2
    ) async -> Int? {
        let deadline = Date().addingTimeInterval(timeout)
        var last: Int?
        while Date() < deadline {
            last = await coordinator.feed.load(for: key).snapshot()?
                .first(where: { $0.id == postId })?.likes
            if last == expected { return last }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return last
    }

    func test_postLiked_writesAbsoluteCountToEveryCacheKeyHoldingThePost() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        try await coordinator.feed.save([makePost(id: "p1", likes: 3),
                                         makePost(id: "p2", likes: 9)], for: "main-feed")
        try await coordinator.feed.save([makePost(id: "p1", likes: 3)], for: "p1")
        try await coordinator.feed.save([makePost(id: "p1", likes: 3)], for: "reels")

        socket.postLiked.send(SocketPostLikedData(
            postId: "p1", userId: "someone-else", emoji: "❤️", likeCount: 4, reactionSummary: ["❤️": 4]
        ))

        for key in ["main-feed", "p1", "reels"] {
            let likes = await waitForLikes(coordinator, key: key, postId: "p1", expected: 4)
            XCTAssertEqual(likes, 4, "la clé \(key) doit porter le compteur absolu du serveur")
        }
        let untouched = await coordinator.feed.load(for: "main-feed").snapshot()?
            .first(where: { $0.id == "p2" })?.likes
        XCTAssertEqual(untouched, 9, "les autres posts ne doivent pas bouger")
    }

    func test_postUnliked_writesAbsoluteCountToEveryCacheKey() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        try await coordinator.feed.save([makePost(id: "p1", likes: 5)], for: "main-feed")
        try await coordinator.feed.save([makePost(id: "p1", likes: 5)], for: "p1")

        socket.postUnliked.send(SocketPostUnlikedData(
            postId: "p1", userId: "someone-else", likeCount: 4, reactionSummary: ["❤️": 4]
        ))

        for key in ["main-feed", "p1"] {
            let likes = await waitForLikes(coordinator, key: key, postId: "p1", expected: 4)
            XCTAssertEqual(likes, 4, "la clé \(key) doit porter le compteur absolu du serveur")
        }
    }

    /// `isLiked` est l'état de l'utilisateur COURANT : le like d'un tiers monte
    /// le compteur sans allumer le cœur. Sans cette distinction, un post aimé
    /// par n'importe qui s'afficherait comme aimé par soi au prochain cold start.
    func test_postLiked_byAnotherUser_doesNotFlipIsLikedForCurrentUser() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        try await coordinator.feed.save([makePost(id: "p1", likes: 3)], for: "main-feed")

        socket.postLiked.send(SocketPostLikedData(
            postId: "p1", userId: "someone-else", emoji: "❤️", likeCount: 4, reactionSummary: ["❤️": 4]
        ))

        _ = await waitForLikes(coordinator, key: "main-feed", postId: "p1", expected: 4)
        let post = await coordinator.feed.load(for: "main-feed").snapshot()?.first
        XCTAssertEqual(post?.isLiked, false)
    }

    func test_postLiked_onAnAbsentPost_isNoOp() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        try await coordinator.feed.save([makePost(id: "p1", likes: 3)], for: "main-feed")

        socket.postLiked.send(SocketPostLikedData(
            postId: "ghost", userId: "u", emoji: "❤️", likeCount: 99, reactionSummary: [:]
        ))

        try? await Task.sleep(nanoseconds: 200_000_000)
        let likes = await coordinator.feed.load(for: "main-feed").snapshot()?.first?.likes
        XCTAssertEqual(likes, 3)
    }
}
