import Foundation
@testable import Meeshy
import MeeshySDK

/// Le double de `GameServiceProviding` : un résultat par geste, et les identifiants
/// d'idempotence REÇUS — c'est ce qui prouve qu'un réessai rejoue la même requête.
final class MockGameService: GameServiceProviding, @unchecked Sendable {
    var rerollResult: Result<MissionRerollResponse, Error> = .failure(URLError(.badServerResponse))
    var chestResult: Result<ChestClaimResponse, Error> = .failure(URLError(.badServerResponse))
    var freezeResult: Result<FlameFreezeResponse, Error> = .success(FlameFreezeResponse(status: "bought", freezes: 1, balance: 0))
    var relightResult: Result<FlameRelightResponse, Error> = .success(FlameRelightResponse(status: "relit", streak: 5, balance: 0))
    var guideSeenResult: Result<GuideSeenResponse, Error> = .success(GuideSeenResponse(guideSeen: []))

    private(set) var rerollRequestIds: [String] = []
    private(set) var rerolledMissionIds: [String] = []
    private(set) var chestRequestIds: [String] = []
    private(set) var freezeRequestIds: [String] = []
    private(set) var relightRequestIds: [String] = []
    private(set) var guideSeenCalls: [[String]] = []

    /// Appelés PENDANT le geste, avant la réponse — là où l'écran montre l'optimiste.
    var duringReroll: (@MainActor @Sendable () -> Void)?
    var duringChest: (@MainActor @Sendable () -> Void)?

    func rerollMission(missionId: String, requestId: String) async throws -> MissionRerollResponse {
        rerolledMissionIds.append(missionId)
        rerollRequestIds.append(requestId)
        await duringReroll?()
        return try rerollResult.get()
    }

    func claimChest(requestId: String) async throws -> ChestClaimResponse {
        chestRequestIds.append(requestId)
        await duringChest?()
        return try chestResult.get()
    }

    func buyFlameFreeze(requestId: String) async throws -> FlameFreezeResponse {
        freezeRequestIds.append(requestId)
        return try freezeResult.get()
    }

    func relightFlame(requestId: String) async throws -> FlameRelightResponse {
        relightRequestIds.append(requestId)
        return try relightResult.get()
    }

    func markGuideSeen(keys: [String], requestId: String) async throws -> GuideSeenResponse {
        guideSeenCalls.append(keys)
        return try guideSeenResult.get()
    }
}
