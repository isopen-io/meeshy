import XCTest
import Combine
import GRDB
@testable import MeeshySDK

final class CacheCoordinatorPostEngagementOrderTests: XCTestCase {

    private static let eventCount = 200

    private func makeSUT() throws -> (CacheCoordinator, MockSocialSocket) {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        let socket = MockSocialSocket()
        let coordinator = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: socket, db: db)
        return (coordinator, socket)
    }

    private func likes(_ coordinator: CacheCoordinator) async -> Int? {
        await coordinator.feed.load(for: "main-feed").snapshot()?.first?.likes
    }

    private func settledLikes(_ coordinator: CacheCoordinator, expected: Int) async -> Int? {
        let deadline = Date().addingTimeInterval(5)
        var last = await likes(coordinator)
        while last != expected, Date() < deadline {
            _ = await cancellableSleep(for: .milliseconds(20))
            last = await likes(coordinator)
        }
        _ = await cancellableSleep(for: .milliseconds(100))
        return await likes(coordinator)
    }

    private func runOnce() async throws {
        let (coordinator, socket) = try makeSUT()
        await coordinator.start()
        var post = FeedPost(id: "p1", author: "Alice", type: "REEL", content: "hello")
        post.likes = -1
        try await coordinator.feed.save([post], for: "main-feed")

        for index in 0..<Self.eventCount {
            if index.isMultiple(of: 2) {
                socket.postLiked.send(SocketPostLikedData(
                    postId: "p1", userId: "other", emoji: "❤️", likeCount: index, reactionSummary: [:]
                ))
            } else {
                socket.postUnliked.send(SocketPostUnlikedData(
                    postId: "p1", userId: "other", likeCount: index, reactionSummary: [:]
                ))
            }
        }

        let settled = await settledLikes(coordinator, expected: Self.eventCount - 1)
        XCTAssertEqual(settled, Self.eventCount - 1, "le dernier événement émis s'applique en dernier")
    }

    func test_alternatingLikesAndUnlikes_applyInEmissionOrder() async throws {
        for _ in 0..<20 { try await runOnce() }
    }
}
