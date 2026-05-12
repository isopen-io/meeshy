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

// MARK: - MockToast

@MainActor
final class MockToast: ToastSurfacing {
    var successMessages: [String] = []
    var errorMessages: [String] = []

    func showSuccess(_ message: String) { successMessages.append(message) }
    func showError(_ message: String)   { errorMessages.append(message) }
}

// MARK: - MockHaptic

@MainActor
final class MockHaptic: HapticSurfacing {
    var successCount = 0
    var errorCount = 0

    func success() { successCount += 1 }
    func error()   { errorCount += 1 }
}
