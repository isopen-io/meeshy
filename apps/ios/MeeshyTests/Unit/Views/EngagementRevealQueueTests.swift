import XCTest
import MeeshySDK
@testable import Meeshy

/// **Deux succès d'un même geste se voient l'un APRÈS l'autre (#5847).**
final class EngagementRevealQueueTests: XCTestCase {

    private var volume: EngagementReveal {
        .composedAchievement(family: AchievementCatalog.families.first { $0.id == "conversation.join.count" }!, tier: 10)
    }
    private var ampleur: EngagementReveal {
        .composedAchievement(family: AchievementCatalog.families.first { $0.id == "conversation.join.size" }!, tier: 10)
    }

    func test_uneFileNeuveNeMontreRien() {
        XCTAssertTrue(EngagementRevealQueue().estVide)
        XCTAssertNil(EngagementRevealQueue().enCours)
    }

    func test_lePremierPalierPasseAussitotALEcran() {
        var file = EngagementRevealQueue()
        file.enfile(volume)
        XCTAssertEqual(file.enCours, volume)
        XCTAssertTrue(file.enAttente.isEmpty)
    }

    func test_leSecondATTEND_puisPrendLaPlaceALaFermeture() {
        var file = EngagementRevealQueue()
        file.enfile(volume)
        file.enfile(ampleur)

        XCTAssertEqual(file.enCours, volume, "le premier reste à l'écran")
        XCTAssertEqual(file.enAttente, [ampleur])

        file.termine()
        XCTAssertEqual(file.enCours, ampleur, "le second ne se perd pas")

        file.termine()
        XCTAssertTrue(file.estVide)
    }

    /// Le même succès arrive par deux portes — l'événement socket et le tap sur
    /// la notification qu'il vient de poser. Un succès n'est pas répétable.
    func test_unMemePalierNeSeCelebreQuUneFois() {
        var file = EngagementRevealQueue()
        file.enfile(volume)
        file.enfile(volume)
        XCTAssertTrue(file.enAttente.isEmpty)

        file.enfile(ampleur)
        file.enfile(ampleur)
        XCTAssertEqual(file.enAttente, [ampleur])
    }

    func test_laFileEstBornee_uneCelebrationQuOnNePeutPasFermerNEnEstPlusUne() {
        var file = EngagementRevealQueue()
        file.enfile(.streak(days: 3))
        file.enfile(.streak(days: 7))
        file.enfile(.streak(days: 14))
        file.enfile(.streak(days: 30))

        XCTAssertEqual(file.enCours, .streak(days: 3))
        XCTAssertEqual(file.enAttente.count, EngagementRevealQueue.capacité - 1)
        XCTAssertFalse(file.enAttente.contains(.streak(days: 30)))
    }
}
