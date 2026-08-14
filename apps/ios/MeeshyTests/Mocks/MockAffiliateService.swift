import Foundation
@testable import Meeshy
import MeeshySDK

final class MockAffiliateService: AffiliateServiceProviding, @unchecked Sendable {
    var listTokensResult: Result<[AffiliateToken], Error> = .success([])
    var fetchStatsResult: Result<AffiliateStats, Error> = .success(AffiliateStats())

    var listTokensCallCount = 0
    var fetchStatsCallCount = 0

    func listTokens(offset: Int, limit: Int) async throws -> [AffiliateToken] {
        listTokensCallCount += 1
        return try listTokensResult.get()
    }

    func fetchStats() async throws -> AffiliateStats {
        fetchStatsCallCount += 1
        return try fetchStatsResult.get()
    }

    func reset() {
        listTokensResult = .success([])
        fetchStatsResult = .success(AffiliateStats())
        listTokensCallCount = 0
        fetchStatsCallCount = 0
    }
}
