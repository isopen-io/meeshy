import Foundation
import MeeshySDK
@testable import Meeshy

@MainActor
final class MockConversationSendCoordinator: ConversationSendCoordinatorProviding {
    nonisolated deinit {}

    var emitResult: Result<SentMessageReceipt, any Error> = .failure(MockCoordinatorError.unstubbed)
    var fallbackResult: SentMessageReceipt?
    var enqueueOfflineResult: Result<SentMessageReceipt, SendFailure> = .failure(.offlineEnqueueFailed(reason: "unstubbed"))
    var enqueueForRetryResult: SendFailure = .queuedForRetry(reason: "stub")
    var acknowledgeResult: MessageState? = .sent

    private(set) var emitCalls: [(outgoing: OutgoingMessage, socketFirst: Bool)] = []
    private(set) var recordedFailures: [String] = []
    private(set) var acknowledged: [String] = []
    private(set) var markedFailed: [String] = []
    private(set) var withdrawn: [String] = []
    private(set) var exhausted: [String] = []
    private(set) var retrying: [String] = []
    private(set) var callLog: [String] = []

    enum MockCoordinatorError: Error {
        case unstubbed
    }

    func emit(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext, socketFirst: Bool) async throws -> SentMessageReceipt {
        callLog.append("emit")
        emitCalls.append((outgoing, socketFirst))
        return try emitResult.get()
    }

    func emitSocketFallback(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext) async -> SentMessageReceipt? {
        callLog.append("emitSocketFallback")
        return fallbackResult
    }

    func acknowledge(localId: String, serverId: String, at: Date) async -> MessageState? {
        callLog.append("acknowledge")
        acknowledged.append(localId)
        return acknowledgeResult
    }

    func recordFailure(_ error: any Error, localId: String) async {
        callLog.append("recordFailure")
        recordedFailures.append(localId)
    }

    func enqueueOffline(_ outgoing: OutgoingMessage, clientMessageId: MessageID, intent: MessageProtectionIntent) async -> Result<SentMessageReceipt, SendFailure> {
        callLog.append("enqueueOffline")
        return enqueueOfflineResult
    }

    func enqueueForRetry(_ outgoing: OutgoingMessage, context: SendAttemptContext, cause: any Error) async -> SendFailure {
        callLog.append("enqueueForRetry")
        return enqueueForRetryResult
    }

    func markFailed(localId: String, reason: String) async {
        callLog.append("markFailed")
        markedFailed.append(localId)
    }

    func markRetrying(localId: String) async {
        callLog.append("markRetrying")
        retrying.append(localId)
    }

    func withdraw(localId: String) async {
        callLog.append("withdraw")
        withdrawn.append(localId)
    }

    func exhaust(localId: String) async {
        callLog.append("exhaust")
        exhausted.append(localId)
    }
}
