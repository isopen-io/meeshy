import XCTest
import MeeshySDK
@testable import Meeshy

/// `SendEligibility.canSend` est LA règle partagée par le garde du composer
/// (`sendMessageWithAttachments`) et celui du ViewModel (`sendMessage`).
/// Une fonction pure testée vaut mieux qu'une garde de source : elle prouve le
/// comportement (un message « lieu seul » passe, un envoi vide ne passe pas),
/// pas la simple présence d'un mot dans un fichier.
final class SendEligibilityTests: XCTestCase {

    private let paris = SharedPlace(
        latitude: 48.8566, longitude: 2.3522,
        name: "Café de Flore", address: "172 boulevard Saint-Germain, Paris"
    )

    func test_texteSeul_estEligible() {
        XCTAssertTrue(SendEligibility.canSend(text: "Salut", attachmentIds: [], location: nil))
    }

    func test_pieceJointeSeule_estEligible() {
        XCTAssertTrue(SendEligibility.canSend(text: "", attachmentIds: ["att_1"], location: nil))
    }

    func test_lieuSeul_estEligible() {
        // Le cas qui était refusé net avant le lot 2 (spec 2026-07-30) :
        // texte vide + aucune pièce jointe + un lieu → l'envoi DOIT passer.
        XCTAssertTrue(SendEligibility.canSend(text: "", attachmentIds: [], location: paris))
    }

    func test_toutVide_estRefuse() {
        XCTAssertFalse(SendEligibility.canSend(text: "", attachmentIds: [], location: nil))
    }

    func test_texteBlancSeul_estRefuse() {
        // Des espaces / retours à la ligne ne sont pas un contenu porteur :
        // même règle de trim que les deux gardes historiques.
        XCTAssertFalse(SendEligibility.canSend(text: "  \n\t ", attachmentIds: [], location: nil))
    }

    func test_texteBlancAvecLieu_estEligible() {
        XCTAssertTrue(SendEligibility.canSend(text: "   ", attachmentIds: [], location: paris))
    }
}
