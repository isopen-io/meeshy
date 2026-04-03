import Foundation

public final class ConversationAnalysisService: @unchecked Sendable {
    public static let shared = ConversationAnalysisService()
    private init() {}
    private var api: APIClient { APIClient.shared }

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
