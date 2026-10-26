import Foundation
import MeeshyE2EE
import MeeshySDK

/// Envoie une réponse à une humeur en `storyReplyToId` dans la conversation
/// DIRECTE avec son auteur — la dernière qui existe, sinon une neuve
/// (`DirectConversationResolver`, la cascade de la réponse amorcée).
protocol MoodReplySending: Sendable {
    /// Rend l'identifiant de la conversation où la réponse est partie.
    func sendReply(_ text: String, to entry: StatusEntry) async throws -> String
}

@MainActor
final class MoodReplySender: MoodReplySending {
    nonisolated deinit {}

    private let conversations: ConversationServiceProviding
    private let messages: MessageServiceProviding
    private let endToEnd: any EndToEndMessagingProviding
    private let replyQueue: NotificationReplyQueueing
    private let injectedPersistence: OptimisticMessagePersisting?
    private let currentUserId: @MainActor () -> String?
    private let injectedPrepareReplyQueue: (@MainActor () async -> Void)?
    // `@concurrent` écrit : sans isolement, sous NonisolatedNonsendingByDefault ce type devient
    // `nonisolated(nonsending)`, dont les métadonnées manquent au runtime d'iOS 16 et 17 (#8182).
    private let composingLanguages: @concurrent @Sendable () async -> [String]
    /// La loi du fil : mémoire du compte, mode servi, cache (#12641, #12985).
    private let destinationGuard: EndToEndDestinationGuard

    private var messagePersistence: OptimisticMessagePersisting {
        injectedPersistence ?? DependencyContainer.shared.messagePersistence
    }

    private var prepareReplyQueue: @MainActor () async -> Void {
        injectedPrepareReplyQueue ?? {
            await OfflineQueue.shared.configure(pool: DependencyContainer.shared.dbPool)
        }
    }

    init(
        conversations: ConversationServiceProviding = ConversationService.shared,
        messages: MessageServiceProviding = MessageService.shared,
        endToEnd: any EndToEndMessagingProviding = EndToEndMessagingRuntime.shared,
        replyQueue: NotificationReplyQueueing = OfflineQueue.shared,
        messagePersistence: OptimisticMessagePersisting? = nil,
        currentUserId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
        prepareReplyQueue: (@MainActor () async -> Void)? = nil,
        composingLanguages: @escaping @concurrent @Sendable () async -> [String] = {
            // Défaut de COMPOSITION (langue proposée, repli « fr ») — pas une lecture (#11875).
            await MainActor.run { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
        },
        destinationGuard: EndToEndDestinationGuard = EndToEndDestinationGuard()
    ) {
        self.destinationGuard = destinationGuard
        self.conversations = conversations
        self.messages = messages
        self.endToEnd = endToEnd
        self.replyQueue = replyQueue
        self.injectedPersistence = messagePersistence
        self.currentUserId = currentUserId
        self.injectedPrepareReplyQueue = prepareReplyQueue
        self.composingLanguages = composingLanguages
    }

    func sendReply(_ text: String, to entry: StatusEntry) async throws -> String {
        let conversation = try await DirectConversationResolver.resolve(with: entry.userId, conversations: conversations,
                                                                        ledger: destinationGuard.ledger)
        let language = ConversationViewModel.composeLanguage(for: text, preferred: await composingLanguages())
        guard await destinationGuard.seals(conversation.id, served: [conversation.encryptionMode]) else {
            try await sendThroughOutbox(text, language: language, storyId: entry.id, conversationId: conversation.id)
            return conversation.id
        }
        try await sendSealed(text, language: language, storyId: entry.id, to: entry.userId, conversationId: conversation.id)
        return conversation.id
    }

    /// **Le chiffrement suit le RÉGIME de la conversation, jamais
    /// l'opportunité** (#3707) — la MÊME règle que le composer. Dans une directe
    /// chiffrée, la réponse part sous libsignal, pour chaque appareil, et
    /// n'entre jamais dans la file (qui rejoue en clair). Ailleurs elle part en
    /// clair, même vers un pair qui a des clés : la passerelle y refuse un chiffré.
    private func sendSealed(_ text: String, language: String, storyId: String, to peerUserId: String, conversationId: String) async throws {
        guard let senderUserId = currentUserId(), !senderUserId.isEmpty else { throw EndToEndSendRefusal.recipientUnsealable }
        let clientMessageId = ClientMessageId.generate()
        let content = E2EEContent(
            text: text, language: language, replyTo: nil,
            conversationId: conversationId, clientMessageId: clientMessageId, sentAt: Date()
        )
        await endToEnd.remember(content, from: senderUserId, as: [clientMessageId])
        let messages = messages
        let sent = try await endToEnd.deliver(content, from: senderUserId, to: peerUserId) { sealed in
            do {
                return try await messages.send(conversationId: conversationId, request: .libsignal(
                    clientMessageId: clientMessageId, storyReplyToId: storyId, senderDeviceId: sealed.senderDeviceId,
                    envelopes: sealed.envelopes, unapprovedOwnDevices: sealed.unapprovedOwnDevices
                ))
            } catch let error as MeeshyError {
                if case .rejected(let rejection) = error, let mismatch = rejection.e2eeMismatch { throw mismatch }
                throw error
            }
        }
        await endToEnd.remember(content, from: senderUserId, as: [sent.id])
    }

    /// **La réponse en clair suit le chemin de toute réponse hors de la
    /// conversation** (#10820, même forme que `CallDeclineMessenger`) : la bulle
    /// s'inscrit dans la conversation directe, la file garde la réponse et sa
    /// citation, puis l'envoi direct tente sa chance. Hors ligne, la file la
    /// rejoue au retour du réseau ; le serveur déduplique par `clientMessageId`.
    /// Une réponse CHIFFRÉE n'entre jamais dans la file, qui rejoue en clair.
    private func sendThroughOutbox(_ text: String, language: String, storyId: String, conversationId: String) async throws {
        let item = OfflineQueueItem(
            conversationId: conversationId,
            content: text,
            originalLanguage: language,
            storyReplyToId: storyId
        )
        if let userId = currentUserId() {
            try? await messagePersistence.insertOptimistic(
                MessageRecord.optimisticText(item: item, senderId: userId, replyToId: nil)
            )
        }
        await prepareReplyQueue()
        let queued = (try? await replyQueue.enqueue(item)) != nil
        do {
            _ = try await messages.send(conversationId: conversationId, request: SendMessageRequest(
                content: text,
                originalLanguage: language,
                storyReplyToId: storyId,
                clientMessageId: item.clientMessageId
            ))
        } catch {
            guard !queued else { return }
            try? await messagePersistence.markOptimisticFailed(localId: item.clientMessageId, reason: error.localizedDescription)
            throw error
        }
    }
}
