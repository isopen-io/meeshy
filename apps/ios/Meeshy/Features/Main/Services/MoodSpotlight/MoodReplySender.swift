import Foundation
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
    private let encryptor: DirectMessageEncrypting
    private let replyQueue: NotificationReplyQueueing
    private let injectedPersistence: OptimisticMessagePersisting?
    private let currentUserId: @MainActor () -> String?
    private let injectedPrepareReplyQueue: (@MainActor () async -> Void)?
    // `@concurrent` écrit : sans isolement, sous NonisolatedNonsendingByDefault ce type devient
    // `nonisolated(nonsending)`, dont les métadonnées manquent au runtime d'iOS 16 et 17 (#8182).
    private let composingLanguages: @concurrent @Sendable () async -> [String]

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
        encryptor: DirectMessageEncrypting = SessionManager.shared,
        replyQueue: NotificationReplyQueueing = OfflineQueue.shared,
        messagePersistence: OptimisticMessagePersisting? = nil,
        currentUserId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
        prepareReplyQueue: (@MainActor () async -> Void)? = nil,
        composingLanguages: @escaping @concurrent @Sendable () async -> [String] = {
            // Défaut de COMPOSITION (langue proposée, repli « fr ») — pas une lecture (#11875).
            await MainActor.run { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
        }
    ) {
        self.conversations = conversations
        self.messages = messages
        self.encryptor = encryptor
        self.replyQueue = replyQueue
        self.injectedPersistence = messagePersistence
        self.currentUserId = currentUserId
        self.injectedPrepareReplyQueue = prepareReplyQueue
        self.composingLanguages = composingLanguages
    }

    func sendReply(_ text: String, to entry: StatusEntry) async throws -> String {
        let conversationId = try await DirectConversationResolver.resolve(with: entry.userId, conversations: conversations).id
        let language = ConversationViewModel.composeLanguage(for: text, preferred: await composingLanguages())
        let sealed = await seal(text, for: entry.userId, conversationId: conversationId)
        guard !sealed.isEncrypted else {
            _ = try await messages.send(conversationId: conversationId, request: SendMessageRequest(
                content: sealed.content,
                originalLanguage: language,
                storyReplyToId: entry.id,
                isEncrypted: true,
                encryptionMode: "E2EE"
            ))
            return conversationId
        }
        try await sendThroughOutbox(text, language: language, storyId: entry.id, conversationId: conversationId)
        return conversationId
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

    /// La MÊME règle que le composer d'une conversation directe : chiffré quand
    /// une session E2EE existe avec le pair, en clair sinon (#8221) — une
    /// réponse partie d'ici ne doit pas être moins protégée que la même
    /// réponse tapée dans la conversation.
    private func seal(_ text: String, for userId: String, conversationId: String) async -> (content: String, isEncrypted: Bool) {
        do {
            let sealed = try await encryptor.encryptMessage(Data(text.utf8), for: userId, conversationId: conversationId)
            return (sealed.base64EncodedString(), true)
        } catch {
            return (text, false)
        }
    }
}
