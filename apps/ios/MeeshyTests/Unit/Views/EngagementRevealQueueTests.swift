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

    /// **Le cas que le témoin ci-dessus ne couvrait PAS — et c'est celui qui
    /// arrive** (#5903).
    ///
    /// Il enfile deux fois SANS fermer entre les deux : il éprouve donc la
    /// déduplication EN FILE, pas la non-répétition. Son nom promettait l'autre.
    ///
    /// Or les deux portes de `EngagementRevealHost` — l'événement socket en
    /// direct, puis le tap sur la notification que cet événement vient de poser
    /// — sont séparées par une FERMETURE : il faut refermer la célébration pour
    /// atteindre la notification. C'est exactement l'instant où la file oubliait
    /// ce qu'elle venait de montrer, et le succès repassait.
    func test_unPalierREFERMÉNeSeRecelebrePas() {
        var file = EngagementRevealQueue()
        file.enfile(volume)
        file.termine()
        XCTAssertTrue(file.estVide)

        file.enfile(volume)
        XCTAssertTrue(file.estVide, "Un succès n'est pas répétable : le revoir n'aurait aucun sens.")
    }

    /// La mémoire ne peut pas croître indéfiniment : une file qui retient tout
    /// ce qu'elle a montré est une fuite, et les paliers restent de toute façon
    /// ACQUIS — c'est le tableau de bord qui en est l'inventaire, pas la file.
    func test_laMemoireDesCelebresEstBornee() {
        var file = EngagementRevealQueue()
        let paliers = (1...(EngagementRevealQueue.mémoire + 5)).map { EngagementReveal.streak(days: $0) }
        for palier in paliers {
            file.enfile(palier)
            file.termine()
        }
        // Le plus ANCIEN est sorti de la mémoire : il peut se re-célébrer.
        file.enfile(paliers[0])
        XCTAssertEqual(file.enCours, paliers[0])
        file.termine()

        // Le plus RÉCENT, lui, est encore retenu.
        file.enfile(paliers.last!)
        XCTAssertTrue(file.estVide)
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
