import Foundation
import MeeshySDK

/// Où part une réponse tapée dans un fil de discussion (`ThreadView`).
///
/// Le fil postait directement par `MessageService` et déposait le clair dans
/// l'outbox hors ligne — À CÔTÉ du scelleur de la conversation. Dans une
/// conversation chiffrée de bout en bout (#11379, directives #9224 et #9229),
/// la réponse passe donc par l'envoi de la CONVERSATION, qui la scelle ou la
/// refuse avant tout transport, pose la bulle en échec et dit pourquoi. Hors
/// E2EE, le fil garde son chemin.
struct ThreadReplyDispatcher {
    enum Outcome: Equatable {
        case sent
        case queued
        case refused(String)
    }

    let conversationId: String
    let parentMessageId: String
    let requiresSeal: @MainActor () -> Bool
    let sendThroughConversation: @MainActor (OutgoingMessage) async -> Result<SentMessageReceipt, SendFailure>
    let messageService: any MessageServiceProviding
    let offlineQueue: any OfflineMessageQueueing
    let isOnline: @MainActor () -> Bool

    func dispatch(text: String, clientMessageId: String) async throws -> Outcome {
        if requiresSeal() {
            return Self.outcome(of: await sendThroughConversation(sealedReply(text)))
        }
        guard isOnline() else {
            try await offlineQueue.enqueue(OfflineQueueItem(
                conversationId: conversationId, content: text, clientMessageId: clientMessageId, replyToId: parentMessageId
            ))
            return .queued
        }
        _ = try await messageService.send(
            conversationId: conversationId,
            request: SendMessageRequest(content: text, replyToId: parentMessageId, clientMessageId: clientMessageId)
        )
        return .sent
    }

    /// Sans `reusedClientMessageId` : la conversation pose sa propre bulle.
    private func sealedReply(_ text: String) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: text,
            relation: .reply(to: MessageID(parentMessageId), citing: nil),
            attachments: OutgoingAttachments(ids: nil, previews: nil)
        )
    }

    private static func outcome(of result: Result<SentMessageReceipt, SendFailure>) -> Outcome {
        switch result {
        case .success: .sent
        case .failure(.endToEndUnsealed(let refusal)): .refused(refusal.userMessage)
        case .failure: .refused(String(localized: "thread.send.error", defaultValue: "Erreur d'envoi", bundle: .main))
        }
    }
}

extension ThreadReplyDispatcher {
    init(viewModel: ConversationViewModel, parentMessageId: String) {
        self.init(
            conversationId: viewModel.conversationId,
            parentMessageId: parentMessageId,
            requiresSeal: { [weak viewModel] in viewModel?.endToEndSealer.requiresSeal ?? true },
            sendThroughConversation: { [weak viewModel] outgoing in
                guard let viewModel else { return .failure(.endToEndUnsealed(.sessionUnavailable)) }
                return await viewModel.send(outgoing)
            },
            messageService: MessageService.shared,
            offlineQueue: OfflineQueue.shared,
            isOnline: { NetworkMonitor.shared.isOnline }
        )
    }
}
