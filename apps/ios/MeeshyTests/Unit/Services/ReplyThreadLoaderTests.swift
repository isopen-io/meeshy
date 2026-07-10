import XCTest
@testable import Meeshy
import MeeshySDK

/// F1 follow-up to PR #280 — covers the small service that lifted the
/// `APIClient.shared.request` call out of `ReplyThreadOverlay`. The
/// loader now owns:
///   - the endpoint shape
///   - the APIMessage → MeeshyMessage conversion
///   - propagating errors so the view layer can decide UI fallback
@MainActor
final class ReplyThreadLoaderTests: XCTestCase {

    private static let conversationId = "conv-1"
    private static let parentId = "msg-parent"
    private static let currentUserId = "u-self"

    private func makeAPIMessage(
        id: String,
        senderId: String,
        content: String = "hello",
        replyToId: String? = nil
    ) -> String {
        let reply = replyToId.map { "\"replyToId\":\"\($0)\"," } ?? ""
        return """
        {
          "id":"\(id)",
          "conversationId":"\(Self.conversationId)",
          "senderId":"\(senderId)",
          "content":"\(content)",
          \(reply)
          "createdAt":"2026-05-21T12:00:00.000Z",
          "sender":{"id":"\(senderId)","username":"bob","displayName":"Bob"}
        }
        """
    }

    private func makeThreadResponse(replyCount: Int = 2) -> APIResponse<ThreadData> {
        let parent = makeAPIMessage(id: Self.parentId, senderId: "u-other", content: "parent")
        let replies = (0..<replyCount).map { i in
            makeAPIMessage(
                id: "reply-\(i)",
                senderId: i.isMultiple(of: 2) ? Self.currentUserId : "u-other",
                content: "reply \(i)",
                replyToId: Self.parentId
            )
        }
        return JSONStub.decode("""
        {
          "success": true,
          "data": {
            "parent": \(parent),
            "replies": [\(replies.joined(separator: ","))],
            "totalCount": \(replyCount)
          },
          "error": null
        }
        """)
    }

    private func makeSUT() -> (sut: ReplyThreadLoader, api: MockAPIClientForApp) {
        let api = MockAPIClientForApp()
        let sut = ReplyThreadLoader(api: api)
        return (sut, api)
    }

    // MARK: - Success

    func test_loadThread_success_returnsParentAndReplies() async throws {
        let (sut, api) = makeSUT()
        let endpoint = "/conversations/\(Self.conversationId)/threads/\(Self.parentId)"
        api.stub(endpoint, result: makeThreadResponse(replyCount: 3))

        let result = try await sut.loadThread(
            conversationId: Self.conversationId,
            parentMessageId: Self.parentId,
            currentUserId: Self.currentUserId,
            currentUsername: "alice"
        )

        XCTAssertEqual(result.parent.id, Self.parentId)
        XCTAssertEqual(result.replies.count, 3)
        XCTAssertEqual(api.requestCount, 1)
        XCTAssertEqual(api.requestEndpoints.last, endpoint)
    }

    func test_loadThread_marksOwnMessagesAsIsMe() async throws {
        let (sut, api) = makeSUT()
        let endpoint = "/conversations/\(Self.conversationId)/threads/\(Self.parentId)"
        api.stub(endpoint, result: makeThreadResponse(replyCount: 4))

        let result = try await sut.loadThread(
            conversationId: Self.conversationId,
            parentMessageId: Self.parentId,
            currentUserId: Self.currentUserId,
            currentUsername: nil
        )

        // Replies 0 and 2 use Self.currentUserId in the fixture (`i.isMultiple(of: 2)`),
        // so .toMessage(currentUserId:) must flip them to isMe = true.
        let ownReplies = result.replies.filter { $0.isMe }
        XCTAssertEqual(ownReplies.count, 2)
        XCTAssertTrue(ownReplies.allSatisfy { ["reply-0", "reply-2"].contains($0.id) })
    }

    // MARK: - Failure

    func test_loadThread_apiFailure_propagatesError() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 503)

        do {
            _ = try await sut.loadThread(
                conversationId: Self.conversationId,
                parentMessageId: Self.parentId,
                currentUserId: Self.currentUserId,
                currentUsername: nil
            )
            XCTFail("Loader must rethrow so the view can render loadError")
        } catch {
            // expected
        }
    }

    func test_loadThread_emptyReplies_returnsParentOnly() async throws {
        let (sut, api) = makeSUT()
        let endpoint = "/conversations/\(Self.conversationId)/threads/\(Self.parentId)"
        api.stub(endpoint, result: makeThreadResponse(replyCount: 0))

        let result = try await sut.loadThread(
            conversationId: Self.conversationId,
            parentMessageId: Self.parentId,
            currentUserId: Self.currentUserId,
            currentUsername: nil
        )

        XCTAssertEqual(result.parent.id, Self.parentId)
        XCTAssertTrue(result.replies.isEmpty)
    }
}
