import Foundation
import os
import SocketIO

extension MessageSocketManager {
    // MARK: - Translation Request
    static let translationBufferMaxSize = TranslationRequestBuffer.maxSize
    static let translationBufferTTL: TimeInterval = TranslationRequestBuffer.timeToLive

    public func requestTranslation(messageId: String, targetLanguage: String) {
        // U4 — ALWAYS buffer, in addition to emitting when connected. The
        // gateway's `message:translation` completion broadcast is fire-and-forget
        // with no ack/replay, so if the socket drops between this request and the
        // broadcast (a multi-second Whisper/NLLB window), the result is dropped
        // and reconnect never re-asks (syncMissedMessages only re-fetches NEWER
        // messages; flushBufferedTranslationRequests previously replayed only the
        // disconnected buffer). Buffering unconditionally lets the reconnect
        // replay re-ask; the gateway request is idempotent (returns the cached
        // translation) so a redundant replay is harmless, and TTL(60s)+dedup+cap
        // bound the buffer.
        translationBuffer.enqueue(
            PendingTranslationRequest(
                messageId: messageId,
                targetLanguage: targetLanguage,
                queuedAt: Date()
            )
        )
        if isConnected {
            socket?.emit("translation:request", ["messageId": messageId, "targetLanguage": targetLanguage])
            Logger.socket.info("Requested translation for \(messageId) -> \(targetLanguage)")
        }
    }

    /// Flush queued translation requests that are still fresh enough to
    /// matter. Called from the `.connect` handler immediately after
    /// re-joining rooms so the gateway sees a coherent stream
    /// (`conversation:join` first, then late translation asks for those
    /// rooms). Exposed as `internal` so the test bundle can validate the
    /// replay without driving a real socket.
    func flushBufferedTranslationRequests(now: Date = Date()) {
        for request in translationBuffer.drainFresh(now: now) {
            socket?.emit("translation:request", [
                "messageId": request.messageId,
                "targetLanguage": request.targetLanguage
            ])
        }
    }

    #if DEBUG
    var debug_pendingTranslationRequests: [PendingTranslationRequest] {
        translationBuffer.pending
    }
    #endif
}
