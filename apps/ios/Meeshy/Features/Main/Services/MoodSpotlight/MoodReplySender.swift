import Foundation
import MeeshySDK

/// Envoie une réponse à une humeur en `storyReplyToId` dans la conversation
/// DIRECTE avec son auteur — la dernière qui existe, sinon une neuve
/// (`DirectConversationResolver`, la cascade de la réponse amorcée).
protocol MoodReplySending: Sendable {
    /// Rend l'identifiant de la conversation où la réponse est partie.
    func sendReply(_ text: String, to entry: StatusEntry) async throws -> String
}

struct MoodReplySender: MoodReplySending {
    private let conversations: ConversationServiceProviding
    private let messages: MessageServiceProviding
    private let encryptor: DirectMessageEncrypting
    private let composingLanguages: @Sendable () async -> [String]

    init(
        conversations: ConversationServiceProviding = ConversationService.shared,
        messages: MessageServiceProviding = MessageService.shared,
        encryptor: DirectMessageEncrypting = SessionManager.shared,
        composingLanguages: @escaping @Sendable () async -> [String] = {
            await MainActor.run { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
        }
    ) {
        self.conversations = conversations
        self.messages = messages
        self.encryptor = encryptor
        self.composingLanguages = composingLanguages
    }

    func sendReply(_ text: String, to entry: StatusEntry) async throws -> String {
        let conversationId = try await DirectConversationResolver.resolve(with: entry.userId, conversations: conversations).id
        let language = ConversationViewModel.composeLanguage(for: text, preferred: await composingLanguages())
        let sealed = await seal(text, for: entry.userId, conversationId: conversationId)
        _ = try await messages.send(conversationId: conversationId, request: SendMessageRequest(
            content: sealed.content,
            originalLanguage: language,
            storyReplyToId: entry.id,
            isEncrypted: sealed.isEncrypted ? true : nil,
            encryptionMode: sealed.isEncrypted ? "E2EE" : nil
        ))
        return conversationId
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
