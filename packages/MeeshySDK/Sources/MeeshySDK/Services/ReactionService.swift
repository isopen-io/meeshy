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
