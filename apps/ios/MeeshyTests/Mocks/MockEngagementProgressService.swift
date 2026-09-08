import Foundation
@testable import Meeshy
import MeeshySDK

final class MockEngagementProgressService: EngagementProgressProviding, @unchecked Sendable {
    var fetchProgressResult: Result<APIEngagementProgress, Error> = .success(.empty)
    var fetchProgressCallCount = 0

    func fetchProgress() async throws -> APIEngagementProgress {
        fetchProgressCallCount += 1
        return try fetchProgressResult.get()
    }

    func reset() {
        fetchProgressResult = .success(.empty)
        fetchProgressCallCount = 0
    }
}
