import Foundation

/// Lire et basculer le régime de chiffrement d'une conversation (#12522). La
/// passerelle fait foi : rôle de plateforme ANALYST ou supérieur, membre, rang
/// de conversation hors tête-à-tête (403), écriture conditionnelle (409
/// `E2EE_REGIME_CHANGED` quand une autre bascule vient de passer).
public protocol ConversationEncryptionServiceProviding: Sendable {
    func fetchStatus(conversationId: String) async throws -> ConversationEncryptionStatus
    func enable(conversationId: String, mode: String) async throws -> ConversationEncryptionStatus
    func disable(conversationId: String) async throws -> ConversationEncryptionStatus
}

public final class ConversationEncryptionService: ConversationEncryptionServiceProviding, Sendable {
    public static let shared = ConversationEncryptionService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func fetchStatus(conversationId: String) async throws -> ConversationEncryptionStatus {
        let response: APIResponse<ConversationEncryptionStatus> = try await api.request(
            ConversationsEndpoint.byConversationIdEncryptionStatus(conversationId: conversationId),
            method: "GET"
        )
        return response.data
    }

    public func enable(conversationId: String, mode: String) async throws -> ConversationEncryptionStatus {
        let response: APIResponse<ConversationEncryptionStatus> = try await api.post(
            ConversationsEndpoint.byConversationIdEncryption(conversationId: conversationId),
            body: ["mode": mode]
        )
        return response.data
    }

    public func disable(conversationId: String) async throws -> ConversationEncryptionStatus {
        let response: APIResponse<ConversationEncryptionStatus> = try await api.request(
            ConversationsEndpoint.byConversationIdEncryption(conversationId: conversationId),
            method: "DELETE"
        )
        return response.data
    }
}
