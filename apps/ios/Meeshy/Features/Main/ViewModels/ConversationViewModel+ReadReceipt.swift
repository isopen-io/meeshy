import Foundation
import MeeshySDK

/// L'envoi d'un accusé de lecture au serveur, par l'outbox hors ligne.
enum ReadReceiptOutbox {

    /// Wave 1 Phase C — route through the offline outbox so a read
    /// receipt produced while offline survives an app kill and replays
    /// on reconnect. The gateway route is naturally idempotent (read
    /// cursor only moves forward) so a replay is harmless ; we still
    /// tag it with a cmid for instrumentation parity with the other
    /// outbox kinds. Fall back to the legacy `PendingStatusQueue` if
    /// the outbox enqueue itself fails (e.g. pool not configured).
    static func enqueue(
        conversationId convId: String,
        messageIds: [String]?,
        caughtUpId: String?,
        languages: (language: String?, exceptions: [String: String])?
    ) {
        Task {
            let cmid = ClientMutationId.generate()
            let payload = MarkAsReadPayload(
                clientMutationId: cmid,
                conversationId: convId,
                messageIds: messageIds,
                language: languages?.language,
                messageLanguages: languages?.exceptions,
                caughtUpToMessageId: caughtUpId
            )
            do {
                try await OfflineQueue.shared.enqueue(.markAsRead, payload: payload, conversationId: convId)
                // Mirror of ConversationCommandHandler.markAsRead: without
                // an explicit flushNow() the markAsRead row sits .pending
                // until an unrelated mutation (reaction, send, etc.) wakes
                // the flusher up, leaving "Synchronisation des lus" stuck
                // in the SyncPill indefinitely.
                await OutboxFlushTrigger.flushNow()
            } catch {
                await PendingStatusQueue.shared.enqueue(.init(
                    conversationId: convId, type: "read", timestamp: Date()
                ))
            }
        }
    }
}
