import XCTest
@testable import Meeshy
import MeeshySDK

/// The comment session of the story being read (#13135): its thread, its
/// live count, the pulse that reopens the rail once the opening count is
/// reconciled, the reply target and the hearts — one owner, out of the view.
@MainActor
final class StoryCommentSessionTests: XCTestCase {

    private final class Fakes {
        var cached: [String: CacheResult<[FeedComment]>] = [:]
        var viewed: String? = "s1"
        var hearts: [(wasLiked: Bool, commentId: String, postId: String)] = []
        var heartDelivered = true
    }

    private func makeSUT() -> (StoryCommentSession, MockPostService, Fakes) {
        let mock = MockPostService()
        let fakes = Fakes()
        let sut = StoryCommentSession(
            postService: mock,
            store: CommentThreadStore(load: { fakes.cached[$0] ?? .empty }, save: { _, _ in }),
            transport: CommentSendTransport(publish: { _, _ in nil }, entrust: { _, _, _ in }),
            preferredLanguages: { ["fr"] },
            deliverHeart: { wasLiked, commentId, postId in
                fakes.hearts.append((wasLiked, commentId, postId))
                return fakes.heartDelivered
            },
            staleZeroDwell: .zero)
        return (sut, mock, fakes)
    }

    private static func comment(_ id: String, replies: Int = 0, likes: Int = 0, parentId: String? = nil) -> FeedComment {
        FeedComment(id: id, author: "bob", authorId: "u2", content: "c-\(id)", timestamp: Date(),
                    likes: likes, replies: replies, parentId: parentId)
    }

    private static func page(_ ids: [(String, Int)]) -> PaginatedAPIResponse<[APIPostComment]> {
        let data = ids.map {
            "{\"id\":\"\($0.0)\",\"content\":\"c\",\"replyCount\":\($0.1),\"createdAt\":\"2026-01-01T00:00:00.000Z\",\"author\":{\"id\":\"a1\",\"username\":\"alice\"}}"
        }.joined(separator: ",")
        return JSONStub.decode("""
        {"success":true,"data":[\(data)],"pagination":null,"error":null}
        """)
    }

    private func settle() async {
        for _ in 0..<20 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 30_000_000)
    }

    // MARK: - Beginning a slide

    func test_begin_withoutStory_zeroesTheCountAndTheRoots() async {
        let (sut, _, fakes) = makeSUT()
        fakes.viewed = nil
        sut.thread.roots = [Self.comment("old")]
        sut.count = 4

        sut.begin(storyId: nil, payloadCount: 0, viewing: { fakes.viewed })

        XCTAssertEqual(sut.count, 0)
        XCTAssertTrue(sut.thread.roots.isEmpty)
    }

    func test_begin_dropsTheReplyTargetTheHeartsAndThePreviousThread() async {
        let (sut, _, fakes) = makeSUT()
        sut.replyTarget = Self.comment("r")
        sut.thread.roots = [Self.comment("old")]
        _ = sut.hearts.begin("old")

        sut.begin(storyId: "s1", payloadCount: 2, viewing: { fakes.viewed })

        XCTAssertNil(sut.replyTarget)
        XCTAssertTrue(sut.thread.roots.isEmpty)
        XCTAssertEqual(sut.thread.entity, .story("s1"))
        XCTAssertEqual(sut.hearts, CommentHeartLedger())
        XCTAssertEqual(sut.count, 2, "the payload count is the first approximation")
    }

    // MARK: - Opening reconciliation

    func test_begin_cacheDisagreesWithThePayload_takesTheCacheTotalAndPulses() async {
        let (sut, mock, fakes) = makeSUT()
        fakes.cached["post-s1"] = .fresh([Self.comment("c1", replies: 2), Self.comment("c2")], age: 1)

        sut.begin(storyId: "s1", payloadCount: 0, viewing: { fakes.viewed })
        await settle()

        XCTAssertEqual(sut.count, 4, "roots plus their replies")
        XCTAssertEqual(sut.reconciledCountPulse, 1)
        XCTAssertEqual(mock.getCommentsCallCount, 0, "a cache never waits for the network")
    }

    func test_begin_cacheConfirmsThePayload_staysSilent() async {
        let (sut, _, fakes) = makeSUT()
        fakes.cached["post-s1"] = .stale([Self.comment("c1"), Self.comment("c2")], age: 99)

        sut.begin(storyId: "s1", payloadCount: 2, viewing: { fakes.viewed })
        await settle()

        XCTAssertEqual(sut.count, 2)
        XCTAssertEqual(sut.reconciledCountPulse, 0, "a confirmed count never reopens the rail")
    }

    func test_begin_staleZeroWithoutCache_confirmsAgainstTheNetworkAndPulses() async {
        let (sut, mock, fakes) = makeSUT()
        mock.getCommentsResult = .success(Self.page([("c1", 1), ("c2", 0)]))

        sut.begin(storyId: "s1", payloadCount: 0, viewing: { fakes.viewed })
        await settle()

        XCTAssertEqual(mock.getCommentsCallCount, 1)
        XCTAssertEqual(sut.count, 3)
        XCTAssertEqual(sut.reconciledCountPulse, 1)
    }

    func test_begin_nonZeroPayloadWithoutCache_neverAsksTheNetwork() async {
        let (sut, mock, fakes) = makeSUT()

        sut.begin(storyId: "s1", payloadCount: 3, viewing: { fakes.viewed })
        await settle()

        XCTAssertEqual(mock.getCommentsCallCount, 0)
        XCTAssertEqual(sut.count, 3)
    }

    func test_begin_viewerMovedOnBeforeTheCacheAnswered_writesNothing() async {
        let (sut, _, fakes) = makeSUT()
        fakes.cached["post-s1"] = .fresh([Self.comment("c1")], age: 1)
        fakes.viewed = "s2"

        sut.begin(storyId: "s1", payloadCount: 0, viewing: { fakes.viewed })
        await settle()

        XCTAssertEqual(sut.count, 0)
        XCTAssertEqual(sut.reconciledCountPulse, 0)
    }

    // MARK: - Realtime

    func test_applyAdded_forTheViewedStory_appendsTheRowAndTakesTheServerCount() {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 0, viewing: { fakes.viewed })
        sut.thread.roots = [Self.comment("c0")]
        let data: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"s1","comment":{"id":"c-new","content":"Salut","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"other","username":"other"}},"commentCount":7}
        """)

        sut.applyAdded(data, languages: ["fr"])

        XCTAssertEqual(sut.thread.roots.map(\.id), ["c0", "c-new"])
        XCTAssertEqual(sut.count, 7)
        XCTAssertEqual(sut.reconciledCountPulse, 0, "live activity never pulses the rail")
    }

    func test_applyAdded_forAnotherStory_isIgnored() {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 1, viewing: { fakes.viewed })
        let data: SocketCommentAddedData = JSONStub.decode("""
        {"postId":"other","comment":{"id":"c-new","content":"Salut","createdAt":"2026-01-15T12:00:00.000Z","author":{"id":"other","username":"other"}},"commentCount":7}
        """)

        sut.applyAdded(data, languages: ["fr"])

        XCTAssertTrue(sut.thread.roots.isEmpty)
        XCTAssertEqual(sut.count, 1)
    }

    func test_applyReaction_heartAggregateIsAuthoritativeForARoot() {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 1, viewing: { fakes.viewed })
        sut.thread.roots = [Self.comment("c1", likes: 1)]
        let event: SocketCommentReactionUpdateEvent = JSONStub.decode("""
        {"commentId":"c1","postId":"s1","userId":"u9","emoji":"\u{2764}\u{FE0F}","action":"added","aggregation":{"emoji":"\u{2764}\u{FE0F}","count":3,"userIds":["u8","u9","u7"],"hasCurrentUser":false}}
        """)

        sut.applyReaction(event)

        XCTAssertEqual(sut.thread.roots.first?.likes, 3)
    }

    func test_applyReaction_heartOnAReply_updatesTheReplyRow() {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 1, viewing: { fakes.viewed })
        sut.thread.roots = [Self.comment("c1", replies: 1)]
        sut.thread.replies = ["c1": [Self.comment("r1", parentId: "c1")]]
        let event: SocketCommentReactionUpdateEvent = JSONStub.decode("""
        {"commentId":"r1","postId":"s1","userId":"u9","emoji":"\u{2764}\u{FE0F}","action":"added","aggregation":{"emoji":"\u{2764}\u{FE0F}","count":5,"userIds":["u9"],"hasCurrentUser":false}}
        """)

        sut.applyReaction(event)

        XCTAssertEqual(sut.thread.replies["c1"]?.first?.likes, 5)
    }

    func test_applyReaction_anotherEmoji_isIgnored() {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 1, viewing: { fakes.viewed })
        sut.thread.roots = [Self.comment("c1", likes: 1)]
        let event: SocketCommentReactionUpdateEvent = JSONStub.decode("""
        {"commentId":"c1","postId":"s1","userId":"u9","emoji":"🔥","action":"added","aggregation":{"emoji":"🔥","count":3,"userIds":["u9"],"hasCurrentUser":false}}
        """)

        sut.applyReaction(event)

        XCTAssertEqual(sut.thread.roots.first?.likes, 1)
    }

    // MARK: - Hearts

    func test_toggleLike_undelivered_rollsTheHeartBack() async {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 1, viewing: { fakes.viewed })
        fakes.heartDelivered = false

        await sut.toggleLike(Self.comment("c1"))

        XCTAssertFalse(sut.hearts.isLiked("c1"))
        XCTAssertFalse(sut.hearts.isInFlight("c1"))
        XCTAssertEqual(fakes.hearts.first?.postId, "s1")
    }

    func test_toggleLike_delivered_keepsTheHeart() async {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 1, viewing: { fakes.viewed })

        await sut.toggleLike(Self.comment("c1"))

        XCTAssertTrue(sut.hearts.isLiked("c1"))
    }

    // MARK: - Sending

    func test_insertOptimistic_countsTheRow_andARefusedDeliveryUncountsIt() async {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 0, viewing: { fakes.viewed })
        sut.insertOptimistic(FeedComment.optimistic(id: "cmid", by: nil, content: "hi", parentId: nil,
                                                    effectFlags: nil, originalLanguage: "fr"))
        XCTAssertEqual(sut.count, 1)

        sut.uncountRefused(storyId: "s1")

        XCTAssertEqual(sut.count, 0)
    }

    func test_uncountRefused_afterTheViewerMovedOn_leavesTheNewSlideCountAlone() {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s2", payloadCount: 5, viewing: { fakes.viewed })
        fakes.viewed = "s2"

        sut.uncountRefused(storyId: "s1")

        XCTAssertEqual(sut.count, 5)
    }

    func test_rollBack_withdrawsTheOptimisticRowAndUncountsIt() {
        let (sut, _, fakes) = makeSUT()
        sut.begin(storyId: "s1", payloadCount: 0, viewing: { fakes.viewed })
        sut.insertOptimistic(FeedComment.optimistic(id: "cmid", by: nil, content: "hi", parentId: nil,
                                                    effectFlags: nil, originalLanguage: "fr"))

        sut.rollBack(id: "cmid", parentId: nil)

        XCTAssertTrue(sut.thread.roots.isEmpty)
        XCTAssertEqual(sut.count, 0)
    }
}
