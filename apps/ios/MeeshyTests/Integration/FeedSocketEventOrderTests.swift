import XCTest
import GRDB
import Combine
@testable import MeeshySDK
@testable import Meeshy

/// Caractérisation (#11047) : la conversion de `FeedSocketHandler` vers une file
/// ordonnée ne change aucun effet persisté. Ces témoins sont verts avant ET
/// après — ils sont le filet du refactor, pas la preuve d'un défaut corrigé.
@MainActor
final class FeedSocketEventOrderTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var feedActor: FeedPersistenceActor!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try FeedDatabaseMigrations.runAll(on: dbQueue)
        feedActor = FeedPersistenceActor(dbWriter: dbQueue)
    }

    private func makePost(id: String) -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"POST","content":"texte","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
    }

    private func makeCommentAdded(id: String, postId: String, count: Int) -> SocketCommentAddedData {
        JSONStub.decode("""
        {"postId":"\(postId)","comment":{"id":"\(id)","content":"salut","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}},"commentCount":\(count)}
        """)
    }

    private func makeCommentDeleted(id: String, postId: String, count: Int) -> SocketCommentDeletedData {
        JSONStub.decode("""
        {"postId":"\(postId)","commentId":"\(id)","commentCount":\(count)}
        """)
    }

    func test_postCreatedThenDeleted_endsWithoutThePost() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        defer { handler.disarm() }

        socket.simulatePostCreated(makePost(id: "p1"))
        socket.simulatePostDeleted("p1")
        await handler.awaitPendingEvents()

        let posts = try feedActor.posts(limit: 50)
        XCTAssertFalse(posts.contains { $0.id == "p1" })
    }

    func test_commentAddedThenDeleted_endsWithoutTheCommentAndTheServedCount() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        defer { handler.disarm() }

        socket.simulatePostCreated(makePost(id: "p1"))
        socket.commentAdded.send(makeCommentAdded(id: "c1", postId: "p1", count: 5))
        socket.commentDeleted.send(makeCommentDeleted(id: "c1", postId: "p1", count: 4))
        await handler.awaitPendingEvents()

        let comments = try feedActor.comments(forPostId: "p1", limit: 10)
        let post = try feedActor.posts(limit: 50).first { $0.id == "p1" }
        XCTAssertFalse(comments.contains { $0.id == "c1" })
        XCTAssertEqual(post?.commentCount, 4)
    }

    func test_afterDisarm_aCreatedPostWritesNothing() async throws {
        let socket = MockSocialSocket()
        let handler = FeedSocketHandler(persistence: feedActor, socialSocket: socket)
        handler.arm()
        handler.disarm()

        socket.simulatePostCreated(makePost(id: "p-late"))
        await handler.awaitPendingEvents()
        try await Task.sleep(for: .milliseconds(100))

        let posts = try feedActor.posts(limit: 50)
        XCTAssertFalse(posts.contains { $0.id == "p-late" })
    }
}
