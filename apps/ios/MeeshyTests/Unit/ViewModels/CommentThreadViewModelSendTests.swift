import XCTest
@testable import Meeshy
import MeeshySDK

/// The optimistic send of a comment goes through the one thread model
/// (#13133): the optimistic row, the direct publish and its reconcile, the
/// offline queue when the network fails, and the rollback when nothing can
/// carry the comment — the same for the sheet, the post detail and the story.
@MainActor
final class CommentThreadViewModelSendTests: XCTestCase {

    private final class Spy {
        var published: [CreateCommentPayload] = []
        var entrusted: [CreateCommentPayload] = []
        var publishResult: Result<APIPostComment?, Error> = .success(nil)
        var entrustError: Error?
    }

    private struct Offline: Error {}

    private func makeSUT(_ entity: CommentThreadEntity = .post("p1")) -> (CommentThreadViewModel, Spy) {
        let spy = Spy()
        let sut = CommentThreadViewModel(
            entity: entity, postService: MockPostService(), preferredLanguages: { ["fr"] },
            store: CommentThreadStore(load: { _ in .empty }, save: { _, _ in }),
            transport: CommentSendTransport(
                publish: { payload, _ in
                    spy.published.append(payload)
                    return try spy.publishResult.get()
                },
                entrust: { payload, _, _ in
                    spy.entrusted.append(payload)
                    if let error = spy.entrustError { throw error }
                }))
        return (sut, spy)
    }

    private static func root(_ id: String, replies: Int = 0) -> FeedComment {
        FeedComment(id: id, author: "bob", content: "c-\(id)", replies: replies)
    }

    private static func row(_ id: String, parentId: String? = nil) -> FeedComment {
        FeedComment.optimistic(id: id, by: nil, content: "hi", parentId: parentId,
                               effectFlags: nil, originalLanguage: "fr")
    }

    private static func payload(_ cmid: String, parentId: String? = nil) -> CreateCommentPayload {
        CreateCommentPayload(clientMutationId: cmid, postId: "p1", parentCommentId: parentId,
                             content: "hi", originalLanguage: "fr", authorId: "me")
    }

    private static let served: APIPostComment = JSONStub.decode("""
    {"id":"srv1","content":"hi","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"me","username":"alice"}}
    """)

    // MARK: - The optimistic row

    func test_insertOptimistic_aRoot_goesFirst() {
        let (sut, _) = makeSUT()
        sut.roots = [Self.root("c1")]

        sut.insertOptimistic(Self.row("cmid_1"))

        XCTAssertEqual(sut.roots.map(\.id), ["cmid_1", "c1"])
    }

    func test_insertOptimistic_aReply_goesUnderItsParent_expandsIt_andCountsIt() {
        let (sut, _) = makeSUT()
        sut.roots = [Self.root("c1", replies: 1)]
        sut.replies["c1"] = [FeedComment(id: "r0", author: "a", content: "r", parentId: "c1")]

        sut.insertOptimistic(Self.row("cmid_1", parentId: "c1"))

        XCTAssertEqual(sut.repliesFor("c1").map(\.id), ["cmid_1", "r0"])
        XCTAssertTrue(sut.expandedThreads.contains("c1"))
        XCTAssertEqual(sut.roots.first?.replies, 2)
    }

    func test_insertOptimistic_last_appends() {
        let (sut, _) = makeSUT(.story("s1"))
        sut.roots = [Self.root("c1")]

        sut.insertOptimistic(Self.row("cmid_1"), at: .last)

        XCTAssertEqual(sut.roots.map(\.id), ["c1", "cmid_1"])
    }

    // MARK: - Delivery

    func test_deliver_published_reconcilesTheServedRowInPlace() async {
        let (sut, spy) = makeSUT()
        sut.roots = [Self.root("c1")]
        sut.insertOptimistic(Self.row("cmid_1"))
        spy.publishResult = .success(Self.served)

        let outcome = await sut.deliver(Self.payload("cmid_1"), media: [])

        XCTAssertEqual(outcome, .delivered)
        XCTAssertEqual(sut.roots.map(\.id), ["srv1", "c1"])
        XCTAssertEqual(sut.roots.first?.authorUsername, "alice")
        XCTAssertTrue(spy.entrusted.isEmpty)
    }

    func test_deliver_confirmedWithoutDescription_keepsTheRowForTheEcho() async {
        let (sut, _) = makeSUT()
        sut.insertOptimistic(Self.row("cmid_1"))

        let outcome = await sut.deliver(Self.payload("cmid_1"), media: [])

        XCTAssertEqual(outcome, .delivered)
        XCTAssertEqual(sut.roots.map(\.id), ["cmid_1"])
    }

    func test_deliver_offline_entrustsTheSamePayload_andKeepsTheRow() async {
        let (sut, spy) = makeSUT()
        sut.insertOptimistic(Self.row("cmid_1"))
        spy.publishResult = .failure(Offline())

        let outcome = await sut.deliver(Self.payload("cmid_1"), media: [])

        XCTAssertEqual(outcome, .entrusted)
        XCTAssertEqual(spy.entrusted.map(\.clientMutationId), ["cmid_1"])
        XCTAssertEqual(sut.roots.map(\.id), ["cmid_1"])
    }

    func test_deliver_permanentRefusal_withdrawsTheRow_withoutQueueing() async {
        let (sut, spy) = makeSUT()
        sut.roots = [Self.root("c1", replies: 0)]
        sut.insertOptimistic(Self.row("cmid_1", parentId: "c1"))
        spy.publishResult = .failure(MeeshyError.forbidden(reason: nil, body: nil))

        let outcome = await sut.deliver(Self.payload("cmid_1", parentId: "c1"), media: [])

        guard case .refused = outcome else { return XCTFail("expected a refusal, got \(outcome)") }
        XCTAssertTrue(spy.entrusted.isEmpty)
        XCTAssertTrue(sut.repliesFor("c1").isEmpty)
        XCTAssertEqual(sut.roots.first?.replies, 0)
    }

    func test_deliver_neitherSentNorQueued_withdrawsTheRow() async {
        let (sut, spy) = makeSUT()
        sut.insertOptimistic(Self.row("cmid_1"))
        spy.publishResult = .failure(Offline())
        spy.entrustError = Offline()

        let outcome = await sut.deliver(Self.payload("cmid_1"), media: [])

        XCTAssertEqual(outcome, .unqueued)
        XCTAssertTrue(sut.roots.isEmpty)
    }

    func test_deliver_afterTheSurfaceMovedOn_neverWritesIntoTheNewThread() async {
        let (sut, spy) = makeSUT(.story("s1"))
        sut.insertOptimistic(Self.row("cmid_1"))
        spy.publishResult = .success(Self.served)
        let payload = Self.payload("cmid_1")
        sut.reset(to: .story("s2"))

        _ = await sut.deliver(payload, media: [], for: .story("s1"))

        XCTAssertTrue(sut.roots.isEmpty)
    }
}
