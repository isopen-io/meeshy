import XCTest
@testable import Meeshy

/// **Tout ce qui se pose au bas de la scène libre partage le MÊME bas** (#8370).
///
/// Avant la scène plein écran, la carte se centrait dans une frame plus haute
/// qu'elle, et les deux rails puis le volet de description devaient s'ancrer au
/// bas du DESSIN (`ancreAuDessin`, #4119, #4993) pour ne pas flotter dans le
/// letterbox. La carte se cadre désormais sur le viewport et le chrome flotte
/// dessus : il n'y a plus de letterbox à retrancher, seulement une scène LIBRE
/// entre la barre haute et les étages du bas. Ce que ces témoins gardaient
/// reste vrai sous une autre forme : les trois éléments tombent sur la MÊME
/// ligne de base, et aucun n'est calé sur une frame qui ne serait pas la leur.
final class ComposerRailBottomAnchorTests: XCTestCase {

    private func compact() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerSceneSurface.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Les deux rails et le volet vivent dans la scène libre, qui s'aligne au
    /// BAS : un seul repère pour trois éléments.
    func test_lesRailsEtLeVolet_partagentLeBasDeLaSceneLibre() throws {
        let code = try compact()
        guard let debut = code.range(of: "privatevarfreeZone:someView{") else {
            return XCTFail("La scène libre a changé de nom — la garde doit être re-pointée.")
        }
        let libre = code[debut.upperBound...]
        XCTAssertTrue(libre.hasPrefix("ZStack(alignment:.bottom){"), "Un seul repère, aligné au bas.")
        XCTAssertTrue(libre.contains("floatingRail"))
        XCTAssertTrue(libre.contains("ComposerTrailingRail("))
        XCTAssertTrue(libre.contains("descriptionOverlay"),
                      "Le volet se pose au bas de la scène libre, entre les deux rails (#4993).")
        XCTAssertTrue(libre.contains(".frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.bottom)"),
                      "La scène libre prend tout le vide du chrome et pose son contenu au bas.")
    }

    /// **Plus aucun ancrage au dessin ne survit.** Il retranchait un letterbox
    /// qui n'existe plus : laissé en place, il décalerait les rails d'une
    /// moitié de bande mesurée sur une géométrie abandonnée.
    func test_aucunAncrageAuDessin_neSurvit() throws {
        let code = try compact()
        XCTAssertFalse(code.contains("ancreAuDessin"))
        XCTAssertFalse(code.contains("sceneBottomInset"))
    }
}
