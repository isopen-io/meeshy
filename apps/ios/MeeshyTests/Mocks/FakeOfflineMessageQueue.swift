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
    private(set) var cancelledPendingSendClientMessageIds: [String] = []
    private(set) var clearedSendMessageRowClientMessageIds: [String] = []
    private(set) var enqueuedMediaCalls: [EnqueuedMedia] = []

    struct EnqueuedMedia: Equatable {
        let sourceMediaURLs: [URL]
        let kinds: [String]
        let conversationId: String
        let content: String?
        let clientMessageId: String
        let copyAttachmentsFromClientMessageId: String?
        let deletesSourceFiles: Bool
        let createdAt: Date?
    }

    // MARK: - Stubbing

    var shouldThrow = false
    var errorToThrow: Error = NSError(
        domain: "FakeOfflineMessageQueue",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "synthetic enqueue failure"]
    )

    /// Fait échouer `enqueue`/`enqueueMedia` à partir du N-ième appel
    /// (0-indexé) confondu — utile pour simuler une interruption EN COURS
    /// d'un fan-out multi-cibles, là où `shouldThrow` échoue dès le premier
    /// appel et pour toujours.
    var throwFromCallIndex: Int?
    private var totalCalls = 0

    private func shouldFailNow() -> Bool {
        defer { totalCalls += 1 }
        if let throwFromCallIndex, totalCalls >= throwFromCallIndex { return true }
        return shouldThrow
    }

    /// Optional artificial latency before the `enqueue` call returns.
    /// Used to exercise the `isSending` debounce window — a second
    /// tap arriving during this delay must exit early.
    var delay: Duration?

    func enqueue(_ item: OfflineQueueItem) async throws {
        if let delay {
            try? await Task.sleep(for: delay)
        }
        if shouldFailNow() {
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

    func cancelPendingSend(clientMessageId cmid: String) async {
        if let delay { try? await Task.sleep(for: delay) }
        cancelledPendingSendClientMessageIds.append(cmid)
    }

    func clearSendMessageRow(clientMessageId cmid: String) async {
        if let delay { try? await Task.sleep(for: delay) }
        clearedSendMessageRowClientMessageIds.append(cmid)
    }

    @discardableResult
    func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        copyAttachmentsFromClientMessageId: String?,
        deletesSourceFiles: Bool,
        createdAt: Date?
    ) async throws -> OfflineQueue.EnqueueMediaResult {
        if let delay { try? await Task.sleep(for: delay) }
        if shouldFailNow() { throw errorToThrow }
        enqueuedMediaCalls.append(EnqueuedMedia(
            sourceMediaURLs: sourceMediaURLs, kinds: kinds,
            conversationId: conversationId, content: content,
            clientMessageId: clientMessageId,
            copyAttachmentsFromClientMessageId: copyAttachmentsFromClientMessageId,
            deletesSourceFiles: deletesSourceFiles, createdAt: createdAt))
        return OfflineQueue.EnqueueMediaResult(
            outboxId: "ofq_fake_\(clientMessageId)",
            localMediaPaths: sourceMediaURLs.indices.map {
                "pending-media/\(clientMessageId)/\($0).\(sourceMediaURLs[$0].pathExtension)"
            })
    }

    // MARK: - Lectures pratiques

    var enqueuedMediaConversationIds: [String] {
        enqueuedMediaCalls.map(\.conversationId)
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
