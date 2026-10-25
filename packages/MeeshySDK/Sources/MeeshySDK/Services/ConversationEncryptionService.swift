import Foundation

/// Lire et basculer le régime de chiffrement d'une conversation (#12522). La
/// passerelle fait foi : rôle de plateforme ANALYST ou supérieur, membre, rang
/// de conversation hors tête-à-tête (403), écriture conditionnelle (409
/// `E2EE_REGIME_CHANGED` quand une autre bascule vient de passer). Seul le
/// chiffrement AU REPOS (`server`, `hybrid`) se désactive : le bout en bout ne
/// se désactive jamais (#12949, `409 E2EE_IRREVERSIBLE`).
public protocol ConversationEncryptionServiceProviding: Sendable {
    func fetchStatus(conversationId: String) async throws -> ConversationEncryptionStatus
    func enable(conversationId: String, mode: String) async throws -> ConversationEncryptionStatus
    func disable(conversationId: String) async throws -> ConversationEncryptionStatus
    /// Le tête-à-tête que le serveur lit avec ce contact, rendu ou créé à côté
    /// du chiffré de bout en bout (#12966) : son identifiant.
    func openReadableDirect(with userId: String) async throws -> String
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

    public func openReadableDirect(with userId: String) async throws -> String {
        let response: APIResponse<CreateConversationResponse> = try await api.post(
            ConversationsEndpoint.root,
            body: CreateConversationRequest(type: "direct", participantIds: [userId], plaintext: true)
        )
        return response.data.id
    }

    public func disable(conversationId: String) async throws -> ConversationEncryptionStatus {
        let response: APIResponse<ConversationEncryptionStatus> = try await api.request(
            ConversationsEndpoint.byConversationIdEncryption(conversationId: conversationId),
            method: "DELETE"
        )
        return response.data
    }
}
