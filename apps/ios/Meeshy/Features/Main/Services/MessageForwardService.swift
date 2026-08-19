import Foundation
import MeeshySDK

/// Issue d'un transfert vers UNE cible, telle que l'UI doit la présenter.
enum ForwardOutcome: Equatable {
    case sent
    case queuedOffline
    case failed(reason: String)
}

protocol MessageForwardServiceProviding {
    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String) async -> ForwardOutcome
}

/// Chemin UNIQUE du transfert de message (spec 2026-08-19, Volet A.3) : tous
/// les points d'entrée (picker, swipe, rangée quick-reaction) convergent ici.
///
/// Invariants :
/// - Jamais d'`attachmentIds` ni de re-upload — le gateway copie les
///   attachments de la source (`MessageProcessor.copyForwardedAttachments`).
/// - Une conversation source inconnue s'OMET (`""` cassait l'écriture Prisma
///   `@db.ObjectId` côté serveur).
/// - Un retry APRÈS ÉCHEC vers la même cible rejoue le MÊME `clientMessageId` :
///   l'index unique `(conversationId, clientMessageId)` du gateway dédoublonne.
/// - Un envoi CONFIRMÉ libère au contraire sa clé : re-transférer délibérément
///   le même message vers la même cible doit créer un SECOND message, jamais
///   retomber sur le chemin idempotent du gateway (qui renverrait la ligne
///   existante en succès, sans rien créer).
/// - Hors ligne : enfilage durable dans l'outbox (`OfflineQueue`), rejoué par
///   `OutboxDispatcher` avec le même cid — la clé est donc CONSERVÉE.
@MainActor
final class MessageForwardService: MessageForwardServiceProviding {
    static let shared = MessageForwardService()

    private let api: APIClientProviding
    private let queue: OfflineMessageQueueing
    private let isOnline: () -> Bool
    private var clientMessageIds: [String: String] = [:]

    init(
        api: APIClientProviding = APIClient.shared,
        queue: OfflineMessageQueueing = OfflineQueue.shared,
        isOnline: @escaping () -> Bool = { NetworkMonitor.shared.isOnline }
    ) {
        self.api = api
        self.queue = queue
        self.isOnline = isOnline
    }

    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String) async -> ForwardOutcome {
        let dedupKey = "\(message.id)→\(targetConversationId)"
        let clientMessageId = clientMessageIds[dedupKey] ?? ClientMessageId.generate()
        clientMessageIds[dedupKey] = clientMessageId
        let sourceId = (sourceConversationId?.isEmpty == false) ? sourceConversationId : nil

        guard isOnline() else {
            do {
                try await queue.enqueue(OfflineQueueItem(
                    conversationId: targetConversationId,
                    content: message.content,
                    clientMessageId: clientMessageId,
                    forwardedFromId: message.id,
                    forwardedFromConversationId: sourceId
                ))
                return .queuedOffline
            } catch {
                return .failed(reason: error.localizedDescription)
            }
        }

        do {
            let body = SendMessageRequest(
                content: message.content.isEmpty ? nil : message.content,
                forwardedFromId: message.id,
                forwardedFromConversationId: sourceId,
                clientMessageId: clientMessageId
            )
            let _: APIResponse<SendMessageResponseData> = try await api.post(
                endpoint: "/conversations/\(targetConversationId)/messages",
                body: body
            )
            clientMessageIds.removeValue(forKey: dedupKey)
            return .sent
        } catch let APIError.serverError(_, serverMessage) {
            return .failed(reason: serverMessage ?? Self.genericFailure)
        } catch let error as APIError {
            return .failed(reason: error.errorDescription ?? Self.genericFailure)
        } catch {
            return .failed(reason: error.localizedDescription)
        }
    }

    private static var genericFailure: String {
        String(localized: "forward.error.generic", defaultValue: "Le transfert a échoué", bundle: .main)
    }
}
