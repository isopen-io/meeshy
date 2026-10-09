#if DEBUG
import Foundation
import MeeshySDK

/// Une célébration du jeu que la vitrine rejoue (#9805). Témoin d'abord : le type existe, rien ne se joue encore.
nonisolated enum VitrineCelebration: String, CaseIterable, Sendable {
    case rang
    case coffre
    case frappe
    case niveau
    case badge

    var concept: ProgressionConcept { .level }
    var duree: TimeInterval { 0 }
}

extension VitrineScene {
    nonisolated var celebration: VitrineCelebration? { nil }
}

nonisolated struct VitrineJeuScenario: Sendable {
    let avant: APIEngagementProgress
    let apres: APIEngagementProgress
    let coffre: ChestClaimResponse?
    let frappe: APIMeeshMintResult?
}

enum VitrineJeuScenarios {
    static func pour(_ celebration: VitrineCelebration, base: APIEngagementProgress) -> VitrineJeuScenario {
        VitrineJeuScenario(avant: base, apres: base, coffre: nil, frappe: nil)
    }
}

nonisolated enum VitrineJeuRefus: Error {
    case horsScene
}

actor VitrineJeuServeur: EngagementProgressProviding, GameServiceProviding {
    private let scenario: VitrineJeuScenario

    init(_ scenario: VitrineJeuScenario) {
        self.scenario = scenario
    }

    func servirLaSuite() {}

    func fetchProgress() async throws -> APIEngagementProgress { scenario.avant }
    func mintMeesh(requestId: String) async throws -> APIMeeshMintResult { throw VitrineJeuRefus.horsScene }
    func rerollMission(missionId: String, requestId: String) async throws -> MissionRerollResponse { throw VitrineJeuRefus.horsScene }
    func claimChest(requestId: String) async throws -> ChestClaimResponse { throw VitrineJeuRefus.horsScene }
    func buyFlameFreeze(requestId: String) async throws -> FlameFreezeResponse { throw VitrineJeuRefus.horsScene }
    func relightFlame(requestId: String) async throws -> FlameRelightResponse { throw VitrineJeuRefus.horsScene }
    func markGuideSeen(keys: [String], requestId: String) async throws -> GuideSeenResponse { throw VitrineJeuRefus.horsScene }
}

enum VitrineJeu {
    static func jouer(_ celebration: VitrineCelebration, sur modele: ProgressionViewModel, serveur: VitrineJeuServeur) async {}
}
#endif
