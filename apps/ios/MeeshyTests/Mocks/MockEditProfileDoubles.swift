import Foundation
@testable import Meeshy
@testable import MeeshySDK

// MARK: - MockOfflineQueue

final class MockOfflineQueue: OfflineQueueing, @unchecked Sendable {
    struct EnqueueCall {
        let kind: OutboxKind
        let payload: any Codable & Sendable
        let conversationId: String?
    }

    var enqueueResult: Result<String, Error> = .success("mock-cmid")
    var enqueueCalls: [EnqueueCall] = []
    var lastPayload: (any Codable & Sendable)?
    /// Per-cmid continuation; tests yield `.applied` / `.exhausted` to simulate
    /// the OutboxFlusher outcome.
    var outcomeContinuations: [String: AsyncStream<OutboxOutcome>.Continuation] = [:]

    @discardableResult
    func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P,
        conversationId: String?
    ) async throws -> String {
        enqueueCalls.append(EnqueueCall(kind: kind, payload: payload, conversationId: conversationId))
        lastPayload = payload
        return try enqueueResult.get()
    }

    struct EnqueuePostMediaCall {
        let sourceMediaURLs: [URL]
        let clientMutationId: String
        let content: String?
        let visibility: String
        let originalLanguage: String?
        let type: String?
    }

    var enqueuePostMediaCalls: [EnqueuePostMediaCall] = []
    /// When set, `enqueuePostMedia` throws this instead of recording a success —
    /// drives the synchronous rollback path in tests.
    var enqueuePostMediaError: Error?

    @discardableResult
    func enqueuePostMedia(
        sourceMediaURLs: [URL],
        clientMutationId: String,
        content: String?,
        visibility: String,
        originalLanguage: String?,
        type: String?
    ) async throws -> OfflineQueue.EnqueueMediaResult {
        enqueuePostMediaCalls.append(EnqueuePostMediaCall(
            sourceMediaURLs: sourceMediaURLs,
            clientMutationId: clientMutationId,
            content: content,
            visibility: visibility,
            originalLanguage: originalLanguage,
            type: type
        ))
        if let enqueuePostMediaError { throw enqueuePostMediaError }
        return OfflineQueue.EnqueueMediaResult(
            outboxId: "ofqm_\(clientMutationId)",
            localMediaPaths: sourceMediaURLs.map { $0.lastPathComponent }
        )
    }

    /// Stubbed recovery result; tests set this to simulate a stuck offline item.
    var recoverLastUnsentPostResult: RecoveredOfflinePost?
    var recoverLastUnsentPostCalls: [(types: Set<String>, olderThan: TimeInterval)] = []
    var cancelCreatePostCalls: [String] = []

    func recoverLastUnsentPost(
        matchingTypes: Set<String>,
        olderThan: TimeInterval
    ) async -> RecoveredOfflinePost? {
        recoverLastUnsentPostCalls.append((matchingTypes, olderThan))
        return recoverLastUnsentPostResult
    }

    func cancelCreatePost(clientMutationId: String) async {
        cancelCreatePostCalls.append(clientMutationId)
    }

    func outcomeStream(for cmid: String) async -> AsyncStream<OutboxOutcome> {
        AsyncStream<OutboxOutcome> { continuation in
            outcomeContinuations[cmid] = continuation
        }
    }

    /// Test helper — yields an outcome on the stream for `cmid` and finishes
    /// the stream (single-shot, matches production semantics).
    func emitOutcome(_ outcome: OutboxOutcome, for cmid: String) {
        outcomeContinuations[cmid]?.yield(outcome)
        outcomeContinuations[cmid]?.finish()
    }
}

// MARK: - MockProfileCache

final class MockProfileCacheWriter: ProfileCacheWriting, @unchecked Sendable {
    var saveProfileResult: Result<Void, Error> = .success(())
    var saveProfileCalls: [(user: MeeshyUser, userId: String)] = []

    func saveProfile(_ user: MeeshyUser, for userId: String) async throws {
        saveProfileCalls.append((user, userId))
        try saveProfileResult.get()
    }
}

// MARK: - TestSleeper

final class TestSleeper: Sleeping, @unchecked Sendable {
    var sleepCalls: [UInt64] = []

    func sleep(milliseconds: UInt64) async {
        sleepCalls.append(milliseconds)
        // intentional no-op for test speed
    }
}

// MARK: - MockFeedbackToast

@MainActor
final class MockFeedbackToast: FeedbackToastSurfacing {
    var successMessages: [String] = []
    var errorMessages: [String] = []
    /// Actions de tap capturées (renvoi vers les Réglages après un refus de
    /// permission) — les exécuter dans un test ouvrirait les Réglages, donc on
    /// se contente de vérifier leur présence.
    var errorTapActions: [() -> Void] = []

    func showSuccess(_ message: String) { successMessages.append(message) }
    func showError(_ message: String)   { errorMessages.append(message) }
    func showError(_ message: String, tapAction: @escaping () -> Void) {
        errorMessages.append(message)
        errorTapActions.append(tapAction)
    }
}

// MARK: - MockHaptic

@MainActor
final class MockHaptic: HapticSurfacing {
    var successCount = 0
    var errorCount = 0

    func success() { successCount += 1 }
    func error()   { errorCount += 1 }
}
