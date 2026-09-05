import XCTest
@testable import MeeshyUI

/// **Une borne, deux gestes** (#4722) — le pinch UIKit du canvas et le
/// `MagnificationGesture` de la puce audio bornent la même grandeur.
final class SceneObjectScalePolicyTests: XCTestCase {

    /// Les bornes reprises du pinch UIKit, à l'unité près : ce lot donne un nom
    /// à ce qui était écrit en littéral, il ne change aucun comportement.
    func test_lesBornes_sontCellesDuPinchUIKit() {
        XCTAssertEqual(SceneObjectScalePolicy.minScale, 0.3)
        XCTAssertEqual(SceneObjectScalePolicy.maxScale, 4.0)
    }

    /// **La composition et la borne sont le MÊME appel.** Un appelant qui
    /// multiplie lui-même peut dépasser, puis revenir : le clamp appliqué après
    /// coup ne rattrape pas un `base` déjà sorti des bornes.
    func test_leGeste_composeEtBorneEnUnSeulAppel() {
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 1, gestureScale: 2), 2)
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 2, gestureScale: 10), 4.0)
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 1, gestureScale: 0.01), 0.3)
    }

    /// La borne basse garde le GESTE DE RETOUR : sous `0.3`, une puce de 40 pt
    /// tombe sous la moitié d'une cible tactile — un objet qu'on ne peut plus
    /// reprendre.
    func test_laBorneBasse_gardeLObjetSaisissable() {
        XCTAssertEqual(SceneObjectScalePolicy.clamped(0.05), 0.3)
    }

    /// **Zéro et négatif se ramènent à l'IDENTITÉ, jamais à la borne basse.**
    ///
    /// Aucun geste ne produit ces valeurs : elles viennent d'un modèle ancien ou
    /// d'une charge corrompue. Les clamper à `0.3` rendrait visible, minuscule
    /// et impossible à saisir un objet dont la taille n'a simplement aucun sens
    /// — un défaut qui a l'air d'un réglage plutôt que d'une donnée fausse.
    func test_uneEchelleAbsurde_revientALIdentite_pasALaBorneBasse() {
        XCTAssertEqual(SceneObjectScalePolicy.clamped(0), 1)
        XCTAssertEqual(SceneObjectScalePolicy.clamped(-2), 1)
        XCTAssertEqual(SceneObjectScalePolicy.clamped(.nan), 1)
        XCTAssertEqual(SceneObjectScalePolicy.clamped(.infinity), 1)
    }

    /// Une échelle déjà valide traverse sans être touchée — la règle borne, elle
    /// ne normalise pas.
    func test_uneEchelleValide_traverseIntacte() {
        XCTAssertEqual(SceneObjectScalePolicy.clamped(1), 1)
        XCTAssertEqual(SceneObjectScalePolicy.clamped(2.5), 2.5)
    }
}
