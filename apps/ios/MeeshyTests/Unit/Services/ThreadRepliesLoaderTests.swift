import XCTest
@testable import Meeshy
import MeeshySDK

/// F2 follow-up to PR #280 — covers the small service that lifted the
/// `APIClient.shared.request` paginated call out of `ThreadView`.
@MainActor
final class ThreadRepliesLoaderTests: XCTestCase {

    private static let conversationId = "conv-1"
    private static let parentId = "msg-parent"
    private static let currentUserId = "u-self"

    private func makeAPIMessage(
        id: String,
        senderId: String,
        content: String = "hello"
    ) -> String {
        """
        {
          "id":"\(id)",
          "conversationId":"\(Self.conversationId)",
          "senderId":"\(senderId)",
          "content":"\(content)",
          "replyToId":"\(Self.parentId)",
          "createdAt":"2026-05-21T12:00:00.000Z",
          "sender":{"id":"\(senderId)","username":"bob","displayName":"Bob"}
        }
        """
    }

    private func makePaginatedReplies(
        count: Int = 3
    ) -> OffsetPaginatedAPIResponse<[APIMessage]> {
        let items = (0..<count).map { i in
            makeAPIMessage(
                id: "reply-\(i)",
                senderId: i.isMultiple(of: 2) ? Self.currentUserId : "u-other",
                content: "reply \(i)"
            )
        }
        return JSONStub.decode("""
        {
          "success": true,
          "data": [\(items.joined(separator: ","))],
          "pagination": {"total": \(count), "hasMore": false, "limit": 50, "offset": 0},
          "error": null
        }
        """)
    }

    private func makeSUT() -> (sut: ThreadRepliesLoader, api: MockAPIClientForApp) {
        let api = MockAPIClientForApp()
        let sut = ThreadRepliesLoader(api: api)
        return (sut, api)
    }

    // MARK: - Success

    func test_loadReplies_success_returnsConvertedMessages() async throws {
        let (sut, api) = makeSUT()
        let endpoint = "/conversations/\(Self.conversationId)/messages"
        api.stub(endpoint, result: makePaginatedReplies(count: 4))

        let replies = try await sut.loadReplies(
            conversationId: Self.conversationId,
            parentMessageId: Self.parentId,
            currentUserId: Self.currentUserId,
            currentUsername: nil
        )

        XCTAssertEqual(replies.count, 4)
        XCTAssertEqual(api.requestCount, 1)
        XCTAssertEqual(api.requestMethods.last, "GET")
    }

    func test_loadReplies_marksOwnRepliesAsIsMe() async throws {
        let (sut, api) = makeSUT()
        let endpoint = "/conversations/\(Self.conversationId)/messages"
        api.stub(endpoint, result: makePaginatedReplies(count: 4))

        let replies = try await sut.loadReplies(
            conversationId: Self.conversationId,
            parentMessageId: Self.parentId,
            currentUserId: Self.currentUserId,
            currentUsername: nil
        )

        let mine = replies.filter { $0.isMe }
        XCTAssertEqual(mine.count, 2)
        XCTAssertEqual(Set(mine.map(\.id)), ["reply-0", "reply-2"])
    }

    // MARK: - Failure

    func test_loadReplies_apiFailure_propagatesError() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 503)

        do {
            _ = try await sut.loadReplies(
                conversationId: Self.conversationId,
                parentMessageId: Self.parentId,
                currentUserId: Self.currentUserId,
                currentUsername: nil
            )
            XCTFail("Loader must rethrow so callers can decide UI fallback")
        } catch { }
    }

    func test_loadReplies_emptyData_returnsEmptyArray() async throws {
        let (sut, api) = makeSUT()
        let endpoint = "/conversations/\(Self.conversationId)/messages"
        api.stub(endpoint, result: makePaginatedReplies(count: 0))

        let replies = try await sut.loadReplies(
            conversationId: Self.conversationId,
            parentMessageId: Self.parentId,
            currentUserId: Self.currentUserId,
            currentUsername: nil
        )
        XCTAssertTrue(replies.isEmpty)
    }
}
