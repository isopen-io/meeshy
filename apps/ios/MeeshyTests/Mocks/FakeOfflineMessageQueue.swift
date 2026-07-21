import Foundation
@testable import MeeshySDK

/// Test double for `OfflineMessageQueueing` used by `ConversationViewModel`
/// to enqueue an `OfflineQueueItem` while offline. Lets tests assert the
/// `clientMessageId` / `attachmentIds` / `replyToId` / forwarded metadata
/// were preserved through the queue without spinning up the real GRDB-backed
/// outbox actor.
actor FakeOfflineMessageQueue: OfflineMessageQueueing {

    // MARK: - Call tracking

    private(set) var enqueueCount = 0
    private(set) var enqueuedItems: [OfflineQueueItem] = []
    private(set) var enqueuedEdits: [OfflineEditPayload] = []
    private(set) var enqueuedDeletes: [OfflineDeletePayload] = []
    private(set) var retriedClientMessageIds: [String] = []

    // MARK: - Stubbing

    var shouldThrow = false
    var errorToThrow: Error = NSError(
        domain: "FakeOfflineMessageQueue",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "synthetic enqueue failure"]
    )

    /// Optional artificial latency before the `enqueue` call returns.
    /// Used to exercise the `isSending` debounce window — a second
    /// tap arriving during this delay must exit early.
    var delay: Duration?

    func enqueue(_ item: OfflineQueueItem) async throws {
        if let delay {
            try? await Task.sleep(for: delay)
        }
        if shouldThrow {
            throw errorToThrow
        }
        enqueueCount += 1
        enqueuedItems.append(item)
    }

    func enqueueEdit(_ payload: OfflineEditPayload) async throws {
        if let delay { try? await Task.sleep(for: delay) }
        if shouldThrow { throw errorToThrow }
        enqueuedEdits.append(payload)
    }

    func enqueueDelete(_ payload: OfflineDeletePayload) async throws {
        if let delay { try? await Task.sleep(for: delay) }
        if shouldThrow { throw errorToThrow }
        enqueuedDeletes.append(payload)
    }

    func retryByClientMessageId(_ cmid: String) async throws {
        if let delay { try? await Task.sleep(for: delay) }
        if shouldThrow { throw errorToThrow }
        retriedClientMessageIds.append(cmid)
    }

    // MARK: - Read-only views (convenience for tests)

    var enqueuedContents: [String] {
        enqueuedItems.map(\.content)
    }

    var enqueuedClientMessageIds: [String] {
        enqueuedItems.map(\.clientMessageId)
    }

    var enqueuedAttachmentIds: [[String]] {
        enqueuedItems.map { $0.attachmentIds ?? [] }
    }

    var enqueuedReplyToIds: [String?] {
        enqueuedItems.map(\.replyToId)
    }

    var enqueuedForwardedFromIds: [String?] {
        enqueuedItems.map(\.forwardedFromId)
    }

    var enqueuedForwardedFromConversationIds: [String?] {
        enqueuedItems.map(\.forwardedFromConversationId)
    }
}
