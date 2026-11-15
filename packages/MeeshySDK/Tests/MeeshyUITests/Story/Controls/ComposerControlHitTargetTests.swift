import XCTest
@testable import MeeshyUI

/// T7 — cibles tapables ≥ 44 pt sur tout le chrome du composer (critère D1).
///
/// Mesures AVANT, faites sur le code : 5 pastilles de header à Ø36, une capsule
/// d'audience à ~27 pt de haut, la poignée de restauration du chrome à 37 pt
/// (5 + 16 + 16 — et non « déjà ≥ 44 »), le grabber du band à 21 pt, le bouton
/// de reset de zoom à 30 pt, les chips de couche à ~19 pt. La poignée de
/// restauration est la SEULE issue de secours quand le chrome est masqué : la
/// laisser sous le minimum HIG était le défaut le plus coûteux du lot.
final class ComposerControlHitTargetTests: XCTestCase {

    func test_controlMetrics_hitDiameter_meetsHIGMinimum() {
        XCTAssertGreaterThanOrEqual(ComposerControlMetrics.hitDiameter, 44)
    }

    func test_controlMetrics_visualDiameter_isUnchanged() {
        XCTAssertEqual(
            ComposerControlMetrics.visualDiameter, 36,
            "Le rendu des pastilles de verre ne bouge pas — seule la zone de CONTACT déborde."
        )
    }

    /// Un interstice NÉGATIF ferait se recouvrir deux cibles voisines, et
    /// SwiftUI arbitrerait alors par ordre de dessin : une cible ambiguë est
    /// pire qu'une cible petite. Zéro = exactement jointives.
    func test_groupSpacing_keepsHitTargetsDisjoint() {
        XCTAssertGreaterThanOrEqual(ComposerControlMetrics.groupSpacing, 0)
    }

    /// L'écart VISUEL entre deux pastilles vaut l'interstice de layout plus les
    /// deux marges de contact. Le morphing du verre doit suivre cette valeur,
    /// sinon les pastilles adjacentes cessent de fusionner sous iOS 26
    /// (retrait d'effet visuel involontaire).
    func test_glassBlendSpacing_matchesTheRealVisualGap() {
        XCTAssertEqual(
            ComposerControlMetrics.groupSpacing + 2 * ComposerControlMetrics.hitInset,
            ComposerControlMetrics.glassBlendSpacing
        )
    }

    /// La colonne annuler/rétablir garde son écart visuel de 10 pt À
    /// L'IDENTIQUE : l'interstice de layout absorbe les marges de contact.
    func test_columnSpacing_preservesTheHistoryColumnGap() {
        XCTAssertEqual(
            ComposerControlMetrics.columnSpacing + 2 * ComposerControlMetrics.hitInset, 10)
        XCTAssertGreaterThanOrEqual(ComposerControlMetrics.columnSpacing, 0)
    }

}
