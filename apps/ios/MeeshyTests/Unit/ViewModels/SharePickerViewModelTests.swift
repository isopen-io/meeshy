import XCTest
@testable import Meeshy
import MeeshySDK

/// P4.1 — `SharePickerView` used to call `APIClient.shared.offsetPaginated
/// Request` and `APIClient.shared.post` straight from the SwiftUI body.
/// `SharePickerViewModel` lifts those calls out and exposes the seed /
/// cache / refresh flow as `loadConversations(seededFrom:)` plus a
/// `send(_:to:forwardedMessageId:)` action. These tests pin both flows.
@MainActor
final class SharePickerViewModelTests: XCTestCase {

    private func makeSUT(
        currentUserId: String = "u-self",
        isOnline: Bool = true,
        offlineQueue: FakeOfflineMessageQueue = FakeOfflineMessageQueue()
    ) -> (sut: SharePickerViewModel, api: MockAPIClientForApp, offlineQueue: FakeOfflineMessageQueue) {
        let api = MockAPIClientForApp()
        let sut = SharePickerViewModel(
            api: api,
            currentUserIdProvider: { currentUserId },
            networkMonitor: FakeNetworkMonitor(isOnline: isOnline),
            offlineQueue: offlineQueue
        )
        return (sut, api, offlineQueue)
    }

    private static func makeConversation(id: String) -> Conversation {
        let api: APIConversation = JSONStub.decode("""
        {
          "id": "\(id)",
          "type": "direct",
          "title": null,
          "isActive": true,
          "createdAt": "2026-05-21T12:00:00.000Z",
          "updatedAt": "2026-05-21T12:00:00.000Z",
          "members": []
        }
        """)
        return api.toConversation(currentUserId: "u-self")
    }

    private static func makePaginatedResponse(
        conversations: [(id: String, type: String)]
    ) -> OffsetPaginatedAPIResponse<[APIConversation]> {
        let items = conversations.map { c in
            """
            {"id":"\(c.id)","type":"\(c.type)","title":null,"isActive":true,"createdAt":"2026-05-21T12:00:00.000Z","updatedAt":"2026-05-21T12:00:00.000Z","members":[]}
            """
        }
        return JSONStub.decode("""
        {
          "success": true,
          "data": [\(items.joined(separator: ","))],
          "pagination": {"total": \(conversations.count), "hasMore": false, "limit": 50, "offset": 0},
          "error": null
        }
        """)
    }

    private static func makeSendResponse() -> APIResponse<SendMessageResponseData> {
        JSONStub.decode("""
        {
          "success": true,
          "data": {
            "id": "msg-1",
            "conversationId": "conv-1",
            "content": "hello",
            "senderId": "u-self",
            "createdAt": "2026-05-21T12:00:00.000Z"
          },
          "error": null
        }
        """)
    }

    private static func makeShareResult(shortUrl: String?) -> APIResponse<PostShareResult> {
        JSONStub.decode("""
        {
          "success": true,
          "data": {"shared": true, "shareCount": 1, "shortUrl": \(shortUrl.map { "\"\($0)\"" } ?? "null"), "token": "tok-1"},
          "error": null
        }
        """)
    }

    // MARK: - resolveStoryShareLink (lien tracké /l/<token>)

    func test_resolveStoryShareLink_online_returnsTrackedShortUrl() async {
        let (sut, api, _) = makeSUT()
        api.stub("/posts/story-1/share", result: Self.makeShareResult(shortUrl: "https://meeshy.me/l/abc123"))

        let link = await sut.resolveStoryShareLink(storyId: "story-1")

        XCTAssertEqual(link, "https://meeshy.me/l/abc123")
        XCTAssertEqual(api.requestEndpoints.last, "/posts/story-1/share")
        XCTAssertEqual(api.requestMethods.last, "POST")
    }

    /// Hors-ligne : aucun appel réseau, `nil` — l'appelant retombe sur l'URL
    /// directe et le partage n'est jamais bloqué.
    func test_resolveStoryShareLink_offline_returnsNilWithoutNetwork() async {
        let (sut, api, _) = makeSUT(isOnline: false)

        let link = await sut.resolveStoryShareLink(storyId: "story-1")

        XCTAssertNil(link)
        XCTAssertEqual(api.postCount, 0, "hors-ligne : aucun POST ne doit partir")
    }

    /// Échec réseau : `nil` (jamais throw) pour ne pas casser le partage.
    func test_resolveStoryShareLink_failure_returnsNil() async {
        let (sut, api, _) = makeSUT()
        api.errorToThrow = NSError(domain: "test", code: 1)

        let link = await sut.resolveStoryShareLink(storyId: "story-1")

        XCTAssertNil(link)
    }

    // MARK: - loadConversations / seed

    func test_loadConversations_withNonEmptySeed_skipsNetwork() async {
        let (sut, api, _) = makeSUT()
        let seed = [Self.makeConversation(id: "c1"), Self.makeConversation(id: "c2")]

        await sut.loadConversations(seededFrom: seed)

        XCTAssertEqual(sut.conversations.map(\.id), ["c1", "c2"])
        XCTAssertFalse(sut.isLoading)
        XCTAssertEqual(api.requestCount, 0,
                       "An already-populated seed must short-circuit the network entirely")
    }

    // MARK: - send (online)

    func test_send_success_marksSentAndDropsSendingId() async {
        let (sut, api, _) = makeSUT()
        api.stub("/conversations/conv-1/messages", result: Self.makeSendResponse())

        let ok = await sut.send(
            "hello",
            to: "conv-1",
            forwardedMessageId: nil
        )

        XCTAssertTrue(ok)
        XCTAssertTrue(sut.sentToIds.contains("conv-1"))
        XCTAssertNil(sut.sendingToId)
        XCTAssertEqual(api.postCount, 1)
    }

    func test_send_failure_returnsFalseAndDoesNotMarkSent() async {
        let (sut, api, _) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 500)

        let ok = await sut.send(
            "hello",
            to: "conv-fail",
            forwardedMessageId: nil
        )

        XCTAssertFalse(ok)
        XCTAssertFalse(sut.sentToIds.contains("conv-fail"))
        XCTAssertNil(sut.sendingToId)
    }

    // MARK: - send (offline — Wave 4 outbox routing)
    //
    // Before this fix, `send` always POSTed directly regardless of
    // connectivity — an offline share threw straight into the failure
    // branch and the shared content was lost. It now gates on
    // `networkMonitor.isOnline` and durably enqueues instead, mirroring
    // `ConversationViewModel.sendMessage`'s offline branch.

    func test_send_offline_enqueuesDurablyInsteadOfPosting() async {
        let (sut, api, offlineQueue) = makeSUT(isOnline: false)

        let ok = await sut.send(
            "hello offline",
            to: "conv-1",
            forwardedMessageId: "msg-42"
        )

        XCTAssertTrue(ok)
        XCTAssertTrue(sut.sentToIds.contains("conv-1"))
        XCTAssertEqual(api.postCount, 0, "Offline send must never attempt the direct REST POST")
        let enqueued = await offlineQueue.enqueuedItems
        XCTAssertEqual(enqueued.count, 1)
        XCTAssertEqual(enqueued.first?.conversationId, "conv-1")
        XCTAssertEqual(enqueued.first?.content, "hello offline")
        XCTAssertEqual(enqueued.first?.forwardedFromId, "msg-42")
    }

    func test_send_offline_enqueueFailure_returnsFalse() async {
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)
        let (sut, _, _) = makeSUT(isOnline: false, offlineQueue: queue)

        let ok = await sut.send("hello", to: "conv-1", forwardedMessageId: nil)

        XCTAssertFalse(ok)
        XCTAssertFalse(sut.sentToIds.contains("conv-1"))
    }

    func test_markSent_externalHandlerPath_addsId() {
        let (sut, _, _) = makeSUT()
        sut.markSent("conv-external")
        XCTAssertTrue(sut.sentToIds.contains("conv-external"))
    }
}

// MARK: - Test helpers on FakeOfflineMessageQueue
//
// `shouldThrow` is an actor-isolated stored property (no `nonisolated`) —
// external code cannot assign to it directly, with or without `await`
// (Swift forbids cross-actor mutation of stored state). This file-private
// setter is the same workaround `ConversationViewModelOfflineQueueTests`
// already uses on the same mock.

private extension FakeOfflineMessageQueue {
    func setShouldThrow(_ value: Bool) {
        shouldThrow = value
    }
}
