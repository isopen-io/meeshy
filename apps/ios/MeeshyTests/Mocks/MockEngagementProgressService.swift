import Foundation
@testable import Meeshy
import MeeshySDK

final class MockEngagementProgressService: EngagementProgressProviding, @unchecked Sendable {
    var fetchProgressResult: Result<APIEngagementProgress, Error> = .success(.empty)
    /// Des lectures SUCCESSIVES, servies dans l'ordre avant `fetchProgressResult`
    /// — pour qu'un témoin décrive « avant le geste » puis « après le geste ».
    var fetchProgressSequence: [Result<APIEngagementProgress, Error>] = []
    var fetchProgressCallCount = 0
    /// Retient une lecture EN VOL (#10898) : appelée avec le rang de l'appel, APRÈS que la réponse a été choisie —
    /// la lecture a donc « lu » l'état du moment de son départ, et n'atterrit qu'à la sortie de cette fermeture.
    var fetchSuspension: (@MainActor @Sendable (Int) async -> Void)?

    func fetchProgress() async throws -> APIEngagementProgress {
        fetchProgressCallCount += 1
        let call = fetchProgressCallCount
        let answer = fetchProgressSequence.isEmpty ? fetchProgressResult : fetchProgressSequence.removeFirst()
        await fetchSuspension?(call)
        return try answer.get()
    }

    /// La frappe (#5743). `mintRequestIds` retient les identifiants REÇUS et non
    /// un simple compteur : c'est ce qui permet à un témoin de prouver
    /// l'IDEMPOTENCE — deux appels après un échec doivent porter le MÊME
    /// identifiant, un compteur ne le dirait pas.
    var mintResult: Result<APIMeeshMintResult, Error> = .success(
        APIMeeshMintResult(status: "minted", balance: 1, mintedLifetime: 1)
    )
    private(set) var mintRequestIds: [String] = []
    /// Ce qui se passe PENDANT que la frappe est en vol, avant sa réponse.
    var duringMint: (@MainActor @Sendable () async -> Void)?

    /// Les gardes de prix reçues, une par frappe (#10903).
    private(set) var mintMaxPrices: [Int?] = []

    func mintMeesh(requestId: String) async throws -> APIMeeshMintResult {
        try await mintMeesh(requestId: requestId, maxPrice: nil)
    }

    func mintMeesh(requestId: String, maxPrice: Int?) async throws -> APIMeeshMintResult {
        mintRequestIds.append(requestId)
        mintMaxPrices.append(maxPrice)
        await duringMint?()
        return try mintResult.get()
    }

    func reset() {
        fetchProgressResult = .success(.empty)
        fetchProgressSequence = []
        fetchProgressCallCount = 0
        mintResult = .success(APIMeeshMintResult(status: "minted", balance: 1, mintedLifetime: 1))
        mintRequestIds = []
        mintMaxPrices = []
        fetchSuspension = nil
        duringMint = nil
    }
}
