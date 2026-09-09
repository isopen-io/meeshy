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

    /// La frappe (#5743). `mintRequestIds` retient les identifiants REÇUS et non
    /// un simple compteur : c'est ce qui permet à un témoin de prouver
    /// l'IDEMPOTENCE — deux appels après un échec doivent porter le MÊME
    /// identifiant, un compteur ne le dirait pas.
    var mintResult: Result<APIMeeshMintResult, Error> = .success(
        APIMeeshMintResult(status: "minted", balance: 1, mintedLifetime: 1)
    )
    private(set) var mintRequestIds: [String] = []

    func mintMeesh(requestId: String) async throws -> APIMeeshMintResult {
        mintRequestIds.append(requestId)
        return try mintResult.get()
    }

    func reset() {
        fetchProgressResult = .success(.empty)
        fetchProgressCallCount = 0
        mintResult = .success(APIMeeshMintResult(status: "minted", balance: 1, mintedLifetime: 1))
        mintRequestIds = []
    }
}
