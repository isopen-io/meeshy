import XCTest
@testable import Meeshy

/// `RiverModeGate` — R-133. Prouve que la sélectionnabilité de la peau suit
/// EXACTEMENT `resolveCapabilities` (`ReadingModeOrchestrator`, GELÉ), sans
/// aucune règle seconde. Les combinaisons flagOn/eligible sont déjà
/// exhaustivement vectorisées côté loi (`capabilities.vectors.json`,
/// `AMENDEMENT S1`) — cette suite ne revectorise rien, elle vérifie que le
/// GATE lit le bon champ.
final class RiverModeGateTests: XCTestCase {

    private func makeCapabilities(includesRiver: Bool) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        .init(
            availableModes: includesRiver ? [.focal, .script, .summary, .river] : [.focal, .script, .summary],
            riverEligible: includesRiver,
            riverEligibilityReason: .init(threshold: 5, current: includesRiver ? 5 : 2, riverReason: includesRiver ? .eligible : .belowThreshold)
        )
    }

    func test_isSelectable_true_whenRiverInAvailableModes() {
        XCTAssertTrue(RiverModeGate.isSelectable(capabilities: makeCapabilities(includesRiver: true)))
    }

    func test_isSelectable_false_whenRiverAbsentFromAvailableModes() {
        XCTAssertFalse(RiverModeGate.isSelectable(capabilities: makeCapabilities(includesRiver: false)))
    }

    // MARK: - Bout en bout avec la loi RÉELLE — flagOn+éligible / flagOff / direct

    func test_endToEnd_flagOnAndEligible_isSelectable() {
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(
            .init(
                identity: .init(isAnonymous: false),
                isFlagEnabled: true,
                isRiverFlagEnabled: true,
                conversationType: .group,
                activeParticipantCount: 6
            )
        )
        XCTAssertTrue(RiverModeGate.isSelectable(capabilities: capabilities))
    }

    /// Drapeau `riviere_mode` OFF (défaut de `LentilleFeatureFlag.riviereMode`)
    /// — MÊME conversation éligible sur le fond (6 actifs, `.group`), le
    /// mode reste fermé : `isRiverFlagEnabled` n'est PAS câblé par ce lot
    /// (R-135), donc jamais transmis à `true` par aucun site de montage
    /// existant — la porte est fermée PAR CONSTRUCTION.
    func test_endToEnd_flagOff_neverSelectable_evenWhenThresholdMet() {
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(
            .init(
                identity: .init(isAnonymous: false),
                isFlagEnabled: true,
                isRiverFlagEnabled: false,
                conversationType: .group,
                activeParticipantCount: 6
            )
        )
        XCTAssertFalse(RiverModeGate.isSelectable(capabilities: capabilities))
    }

    /// Jamais en `direct`, quel que soit le drapeau ou le compte.
    func test_endToEnd_directConversation_neverSelectable() {
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(
            .init(
                identity: .init(isAnonymous: false),
                isFlagEnabled: true,
                isRiverFlagEnabled: true,
                conversationType: .direct,
                activeParticipantCount: 20
            )
        )
        XCTAssertFalse(RiverModeGate.isSelectable(capabilities: capabilities))
        XCTAssertEqual(capabilities.riverEligibilityReason.riverReason, .neverEligible)
    }

    /// Sous le seuil (5) — grisée, avec sa raison réelle conservée.
    func test_endToEnd_belowThreshold_neverSelectable_reasonCarriesRealCount() {
        let capabilities = ReadingModeOrchestrator.resolveCapabilities(
            .init(
                identity: .init(isAnonymous: false),
                isFlagEnabled: true,
                isRiverFlagEnabled: true,
                conversationType: .group,
                activeParticipantCount: 3
            )
        )
        XCTAssertFalse(RiverModeGate.isSelectable(capabilities: capabilities))
        XCTAssertEqual(capabilities.riverEligibilityReason.current, 3)
        XCTAssertEqual(capabilities.riverEligibilityReason.riverReason, .belowThreshold)
    }
}
