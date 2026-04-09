import Foundation

public final class ConversationAnalysisService: @unchecked Sendable {
    public static let shared = ConversationAnalysisService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func fetchAnalysis(conversationId: String) async throws -> ConversationAnalysis {
        let response: APIResponse<ConversationAnalysis> = try await api.request(
            endpoint: "/conversations/\(conversationId)/analysis"
        )
        return response.data
    }

    public func fetchStats(conversationId: String) async throws -> ConversationMessageStatsResponse {
        let response: APIResponse<ConversationMessageStatsResponse> = try await api.request(
            endpoint: "/conversations/\(conversationId)/stats"
        )
        return response.data
    }
}
