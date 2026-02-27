import Foundation

public final class StatsService {
    public static let shared = StatsService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func fetchStats() async throws -> UserStats {
        let response: APIResponse<UserStats> = try await api.request(endpoint: "/users/me/stats")
        return response.data
    }

    public func fetchTimeline(days: Int = 30) async throws -> [TimelinePoint] {
        let response: APIResponse<[TimelinePoint]> = try await api.request(
            endpoint: "/users/me/stats/timeline",
            queryItems: [URLQueryItem(name: "days", value: "\(days)")]
        )
        return response.data
    }

    public func fetchAchievements() async throws -> [Achievement] {
        let response: APIResponse<[Achievement]> = try await api.request(
            endpoint: "/users/me/stats/achievements"
        )
        return response.data
    }
}
