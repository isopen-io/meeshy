import Foundation

// MARK: - Protocol

public protocol ReactionServiceProviding: Sendable {
    func add(messageId: String, emoji: String) async throws
    func remove(messageId: String, emoji: String) async throws
    func fetchDetails(messageId: String) async throws -> ReactionSyncResponse
}

public final class ReactionService: ReactionServiceProviding, Sendable {
    public static let shared = ReactionService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func add(messageId: String, emoji: String) async throws {
        let body = AddReactionRequest(messageId: messageId, emoji: emoji)
        // `DiscardedResponseBody` ignore le corps de reponse : le serveur
        // renvoie l'objet reaction (pas un `[String: String]`), et le decoder
        // strict precedent levait un `DecodingError` sur une reponse 2xx
        // pourtant valide — l'envoi etait donc compte comme un echec. La mise
        // a jour fait foi via le broadcast socket `reaction:added`.
        let _: APIResponse<DiscardedResponseBody> = try await api.post(ReactionsEndpoint.root, body: body)
    }

    public func remove(messageId: String, emoji: String) async throws {
        let encoded = emoji.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? emoji
        let _: APIResponse<DiscardedResponseBody> = try await api.request(
            ReactionsEndpoint.byMessageIdByEmoji(messageId: messageId, emoji: encoded), method: "DELETE"
        )
    }

    public func fetchDetails(messageId: String) async throws -> ReactionSyncResponse {
        let response: APIResponse<ReactionSyncResponse> = try await api.request(
            ReactionsEndpoint.byMessageId(messageId: messageId)
        )
        return response.data
    }
}
