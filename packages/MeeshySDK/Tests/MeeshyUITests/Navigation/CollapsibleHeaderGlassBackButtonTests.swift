import XCTest
@testable import MeeshyUI

/// LE RETOUR DE L'EN-TÊTE EST UN DISQUE DE VERRE (#6480).
///
/// Directive porteur 2026-09-14 : « la page Progression et Réglages doivent
/// avoir (<) en Liquid Glass, bien aligné ». Le retour de `CollapsibleHeader`
/// était un chevron NU dans un cadre de 44 pt : à droite, les actions du même
/// en-tête sont des disques de verre de 40 pt posés sur la gouttière des
/// chromes ronds. Les deux bords d'une même barre ne se ressemblaient pas.
///
/// **Garde de SOURCE, et pourquoi.** Le verre ne laisse aucune trace dans
/// l'arbre d'accessibilité ; la preuve visuelle est la capture au simulateur.
/// Les métriques, elles, se mesurent : c'est la symétrie des deux bords.
final class CollapsibleHeaderGlassBackButtonTests: XCTestCase {

    private func backButtonSource() throws -> String {
        let code = ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Navigation/CollapsibleHeader.swift"),
                encoding: .utf8
            )
        )
        let debut = try XCTUnwrap(code.range(of: "private var backButton: some View"), "Le bouton retour a quitté l'en-tête.")
        let reste = String(code[debut.upperBound...])
        return reste.components(separatedBy: "extension CollapsibleHeader where").first ?? reste
    }

    func test_theBackButton_isAGlassDisc() throws {
        let bouton = try backButtonSource()

        XCTAssertTrue(bouton.contains(".adaptiveGlass("), "Le retour de l'en-tête n'est pas en verre.")
        XCTAssertTrue(bouton.contains("Circle()"), "Le retour de l'en-tête n'est pas un disque.")
        XCTAssertFalse(bouton.contains(".glassEffect("), "Le verre passe par `adaptiveGlass` (#4997), jamais en direct.")
    }

    /// Le disque du retour a le diamètre des chromes ronds de droite.
    func test_theBackDisc_hasTheRoundChromeDiameter() throws {
        XCTAssertEqual(CollapsibleHeaderMetrics.roundChromeDiameter, 40)
        XCTAssertTrue(try backButtonSource().contains("CollapsibleHeaderMetrics.roundChromeDiameter"),
                      "Le disque du retour ne lit pas le diamètre partagé.")
    }

    /// « Bien aligné » : le retour respire du bord gauche exactement comme les
    /// actions du bord droit — une gouttière posée d'un seul côté se voit.
    func test_theBackDisc_sitsOnTheRoundChromeGutter_symmetricToTheActions() throws {
        XCTAssertEqual(CollapsibleHeaderMetrics.leadingBackInset, CollapsibleHeaderMetrics.trailingActionsInset)
        XCTAssertTrue(try backButtonSource().contains("CollapsibleHeaderMetrics.leadingBackInset"),
                      "Le retour ne se pose pas sur la gouttière des chromes ronds.")
    }
}
