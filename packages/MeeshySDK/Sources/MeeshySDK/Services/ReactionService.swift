import Foundation

public final class ReactionService {
    public static let shared = ReactionService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func add(messageId: String, emoji: String) async throws {
        let body = AddReactionRequest(messageId: messageId, emoji: emoji)
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/reactions", body: body)
    }

    public func remove(messageId: String, emoji: String) async throws {
        let encoded = emoji.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? emoji
        let _: APIResponse<[String: String]> = try await api.request(
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
