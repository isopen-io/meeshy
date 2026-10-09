import XCTest
import MeeshySDK
@testable import Meeshy

/// Les vraies interactions que la vitrine filme (#9810) : chaque scène ouvre le vrai écran, puis joue l'interaction par
/// le MÊME chemin que le geste, contre une passerelle fictive.
@MainActor
final class VitrineInteractionsTests: XCTestCase {
    private func scene(_ argument: String) -> VitrineScene? {
        VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", argument])
    }

    // MARK: - interaction-frappe

    func test_interactionFrappe_parses_andOpensASession() {
        XCTAssertEqual(scene("interaction-frappe"), .interactionFrappe)
        XCTAssertEqual(VitrineScene.interactionFrappe.interaction, .frappe)
        XCTAssertTrue(VitrineScene.interactionFrappe.ouvreUneSession)
    }

    /// La scène part du COMPTEUR de Meeshes, sur Progression : aucune fiche n'est ouverte au lancement.
    func test_interactionFrappe_startsOnProgression_notOnTheFiche() {
        XCTAssertNil(VitrineScene.interactionFrappe.celebration)
        XCTAssertEqual(VitrineScene.interactionFrappe.rendusAttendus(conversationId: nil, appareil: .iphone), [.progression])
        XCTAssertEqual(VitrineScene.interactionFrappe.rendusAttendus(conversationId: nil, appareil: .ipad), [.progression, .fil])
    }

    /// Le compteur ouvre la fiche des Meeshes (#9564), où la frappe a son unique site : la passerelle sert la frappe.
    func test_interactionFrappe_servesTheStrike_onTheMeeshFiche() {
        XCTAssertEqual(VitrineScene.interactionFrappe.jeuServi, .frappe)
        XCTAssertEqual(VitrineScene.interactionFrappe.jeuServi?.concept, .meesh)
    }

    func test_jeuServi_ofAGameScene_isItsCelebration() {
        XCTAssertEqual(VitrineScene.jeuCoffre.jeuServi, .coffre)
        XCTAssertNil(VitrineScene.global.jeuServi)
        XCTAssertNil(VitrineScene.jeuRang.interaction)
    }
}
