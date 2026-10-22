import Foundation
import os
import MeeshySDK

@MainActor
protocol TranscriptionRetryReceiving: AnyObject {
    func extractAttachmentTranscriptions(from apiMessages: [APIMessage])
}

protocol TranscriptionRetryScheduling {
    @discardableResult
    func schedule(
        for apiMessages: [APIMessage],
        conversationId: String,
        receiver: any TranscriptionRetryReceiving
    ) -> Task<Void, Never>?
}

/// Quand Whisper n'a pas fini à l'arrivée de la réponse REST, `attachment.transcription` est nil :
/// une seule relecture, après le délai, remonte la transcription (Whisper finit en 3 à 15 s).
struct TranscriptionRetryScheduler: TranscriptionRetryScheduling {
    let messageService: any MessageServiceProviding
    let delay: Duration

    init(messageService: any MessageServiceProviding = MessageService.shared, delay: Duration = .seconds(5)) {
        self.messageService = messageService
        self.delay = delay
    }

    static func idsMissingTranscription(_ apiMessages: [APIMessage]) -> [String] {
        apiMessages.filter { message in
            message.attachments?.contains { attachment in
                guard let mime = attachment.mimeType, mime.hasPrefix("audio/") else { return false }
                return attachment.transcription == nil
            } ?? false
        }.map(\.id)
    }

    @discardableResult
    func schedule(
        for apiMessages: [APIMessage],
        conversationId: String,
        receiver: any TranscriptionRetryReceiving
    ) -> Task<Void, Never>? {
        let messageIds = TranscriptionRetryScheduler.idsMissingTranscription(apiMessages)
        guard !messageIds.isEmpty else { return nil }
        Logger.messages.info("[TranscriptionRetry] Scheduling retry for \(messageIds.count) audio message(s) missing transcription")
        let messageService = self.messageService
        let delay = self.delay
        return Task { [weak receiver] in
            guard await cancellableSleep(for: delay) else { return }
            guard let receiver else { return }
            for messageId in messageIds {
                guard !Task.isCancelled else { return }
                await TranscriptionRetryScheduler.refetch(
                    messageId, in: conversationId, using: messageService, into: receiver
                )
            }
        }
    }

    private static func refetch(
        _ messageId: String,
        in conversationId: String,
        using messageService: any MessageServiceProviding,
        into receiver: any TranscriptionRetryReceiving
    ) async {
        do {
            let response = try await messageService.listAround(
                conversationId: conversationId,
                around: messageId,
                limit: 5,
                includeReplies: false,
                includeTranslations: true
            )
            receiver.extractAttachmentTranscriptions(from: response.data)
        } catch {
            Logger.messages.warning("[TranscriptionRetry] Retry failed for \(messageId): \(error.localizedDescription)")
        }
    }
}
