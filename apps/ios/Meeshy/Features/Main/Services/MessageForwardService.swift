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
    func forward(message: Message, sourceConversationId: String?, to target: ForwardTarget) async -> ForwardOutcome
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
    private let conversationCreator: ConversationCreating
    private let authManager: AuthManaging
    private var clientMessageIds: [String: String] = [:]

    init(
        api: APIClientProviding = APIClient.shared,
        queue: OfflineMessageQueueing = OfflineQueue.shared,
        isOnline: @escaping () -> Bool = { NetworkMonitor.shared.isOnline },
        conversationCreator: ConversationCreating = ConversationCreator(),
        authManager: AuthManaging = AuthManager.shared
    ) {
        self.api = api
        self.queue = queue
        self.isOnline = isOnline
        self.conversationCreator = conversationCreator
        self.authManager = authManager
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
        } catch {
            return .failed(reason: Self.failureReason(for: error))
        }
    }

    /// Résout la cible AVANT de transférer, puis délègue au chemin unique
    /// ci-dessus — le `clientMessageId` de dédup est donc calculé APRÈS
    /// résolution.
    ///
    /// - Une cible qui porte déjà `conversationId` (issue d'une conversation
    ///   existante) part directement.
    /// - Une cible SANS conversation (un contact) en obtient une via
    ///   `createDirectConversation`, IDEMPOTENTE côté serveur : elle renvoie
    ///   la conversation existante (200) plutôt que d'en recréer une seconde.
    ///
    /// La résolution — et donc toute création de conversation — n'a lieu
    /// QU'ICI, à l'envoi. Sélectionner un contact dans le picker puis fermer
    /// la feuille sans envoyer ne crée jamais de conversation vide.
    func forward(message: Message, sourceConversationId: String?, to target: ForwardTarget) async -> ForwardOutcome {
        if let conversationId = target.conversationId {
            return await forward(message: message, sourceConversationId: sourceConversationId, to: conversationId)
        }
        guard let userId = target.userId else {
            return .failed(reason: Self.genericFailure)
        }
        do {
            let conversation = try await conversationCreator.createDirectConversation(
                with: userId,
                currentUserId: authManager.currentUser?.id ?? ""
            )
            return await forward(message: message, sourceConversationId: sourceConversationId, to: conversation.id)
        } catch {
            return .failed(reason: Self.failureReason(for: error))
        }
    }

    private static func failureReason(for error: Error) -> String {
        if case let APIError.serverError(_, serverMessage) = error {
            return serverMessage ?? genericFailure
        }
        if let apiError = error as? APIError {
            return apiError.errorDescription ?? genericFailure
        }
        return error.localizedDescription
    }

    private static var genericFailure: String {
        String(localized: "forward.error.generic", defaultValue: "Le transfert a échoué", bundle: .main)
    }
}
