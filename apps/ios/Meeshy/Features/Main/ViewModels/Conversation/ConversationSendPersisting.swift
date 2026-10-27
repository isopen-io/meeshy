import Foundation
import MeeshySDK

nonisolated protocol ConversationSendPersisting: Sendable {
    func applyEvent(localId: String, event: MessageEvent) async throws -> MessageState?
    func markOptimisticFailed(localId: String, reason: String) async throws
    func recordSendAttempt(
        localId: String,
        transport: SendAttemptRecord.Transport,
        startedAt: Date,
        outcome: SendAttemptRecord.Outcome,
        errorMessage: String?
    ) async throws
    func purgeMessages(ids: [String], origin: PlaintextErasureOrigin) async throws
}

extension MessagePersistenceActor: ConversationSendPersisting {}
