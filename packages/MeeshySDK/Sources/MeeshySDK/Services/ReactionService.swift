import Foundation

// MARK: - Protocol

public protocol ReactionServiceProviding: Sendable {
    func add(messageId: String, emoji: String) async throws
    func remove(messageId: String, emoji: String) async throws
    func fetchDetails(messageId: String) async throws -> ReactionSyncResponse
}

public final class ReactionService: ReactionServiceProviding, @unchecked Sendable {
    public static let shared = ReactionService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func add(messageId: String, emoji: String) async throws {
        let body = AddReactionRequest(messageId: messageId, emoji: emoji)
        // `DiscardedReactionResponse` ignore le corps de reponse : le serveur
        // renvoie l'objet reaction (pas un `[String: String]`), et le decoder
        // strict precedent levait un `DecodingError` sur une reponse 2xx
        // pourtant valide — l'envoi etait donc compte comme un echec. La mise
        // a jour fait foi via le broadcast socket `reaction:added`.
        let _: APIResponse<DiscardedReactionResponse> = try await api.post(endpoint: "/reactions", body: body)
    }

    public func remove(messageId: String, emoji: String) async throws {
        let encoded = emoji.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? emoji
        let _: APIResponse<DiscardedReactionResponse> = try await api.request(
            endpoint: "/reactions/\(messageId)/\(encoded)", method: "DELETE"
        )
    }

    public func fetchDetails(messageId: String) async throws -> ReactionSyncResponse {
        let response: APIResponse<ReactionSyncResponse> = try await api.request(
            endpoint: "/reactions/\(messageId)"
        )
        return response.data
    }
}

/// `Decodable` placeholder for endpoints whose REST response body the caller
/// does not consume. Its decoder succeeds against ANY JSON value (object,
/// array, scalar, null) without inspecting it, so a change in the server's
/// response shape can never make the call throw a `DecodingError`.
private struct DiscardedReactionResponse: Decodable {
    init(from decoder: Decoder) throws {}
}
