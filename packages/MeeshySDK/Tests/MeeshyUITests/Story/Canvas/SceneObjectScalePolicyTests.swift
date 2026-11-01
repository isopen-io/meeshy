import XCTest
@testable import MeeshyUI

/// **Un objet posé grandit sans plafond et rapetisse jusqu'à 5 px de design**
/// (#14299, jumelle Android #14298) — une règle, trois gestes : le pinch UIKit
/// du canvas, le `MagnificationGesture` de la puce son et ses actions
/// d'accessibilité.
final class SceneObjectScalePolicyTests: XCTestCase {

    /// Le plancher se mesure dans la scène de RÉFÉRENCE 1080 × 1920, celle où
    /// `baseSize`, `fontSize` et l'export sont exprimés : la même échelle donne
    /// la même taille chez l'auteur et chez le lecteur, quel que soit l'écran.
    func test_lePlancher_vautCinqPixelsDeDesign() {
        XCTAssertEqual(SceneObjectScalePolicy.minimumRenderedSide, 5)
    }

    func test_agrandir_naAucunPlafond() {
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 1, gestureScale: 1000, unitSide: 140), 1000)
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 4, gestureScale: 25, unitSide: 140), 100)
    }

    /// Un sticker de `baseSize` 140 s'arrête à `5 / 140` : son côté rendu vaut
    /// alors exactement 5 px de design.
    func test_reduire_sArreteQuandLePlusPetitCoteVautCinqPixels() {
        let plancher = SceneObjectScalePolicy.settled(base: 1, gestureScale: 0.0001, unitSide: 140)
        XCTAssertEqual(plancher, 5.0 / 140, accuracy: 1e-12)
        XCTAssertEqual(plancher * 140, 5, accuracy: 1e-9)
    }

    /// Le plancher dépend de l'OBJET : un objet deux fois plus grand à
    /// l'échelle 1 descend deux fois plus bas en échelle, et atteint le même
    /// côté rendu.
    func test_lePlancher_dependDuCoteALechelleUn() {
        XCTAssertEqual(SceneObjectScalePolicy.floor(unitSide: 540), 5.0 / 540, accuracy: 1e-12)
        XCTAssertEqual(SceneObjectScalePolicy.floor(unitSide: 70), 5.0 / 70, accuracy: 1e-12)
    }

    /// Au-dessus du plancher, la réduction passe intacte : l'ancienne borne
    /// `0,3` ne retient plus rien.
    func test_reduireAuDessusDuPlancher_passeIntact() {
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 1, gestureScale: 0.1, unitSide: 140), 0.1, accuracy: 1e-12)
    }

    /// Un facteur qui déborde le `Double` (∞) ou un geste dégénéré (0, NaN)
    /// laisse l'échelle où elle était : la seule garde est « finie et > 0 ».
    func test_unProduitNonFini_laisseLEchelleIntacte() {
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 2, gestureScale: .infinity, unitSide: 140), 2)
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 2, gestureScale: .nan, unitSide: 140), 2)
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 1e308, gestureScale: 10, unitSide: 140), 1e308)
    }

    /// Un côté inconnu (zéro, négatif, non fini) ne permet pas de prouver le
    /// plancher : le geste grandit encore, il ne réduit plus.
    func test_unCoteInconnu_interditDeReduire() {
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 1, gestureScale: 0.5, unitSide: 0), 1)
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 1, gestureScale: 3, unitSide: .nan), 3)
    }

    /// Une échelle de départ absurde (modèle ancien, charge corrompue) repart
    /// de l'identité avant d'être composée avec le geste.
    func test_uneBaseAbsurde_repartDeLIdentite() {
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: 0, gestureScale: 2, unitSide: 140), 2)
        XCTAssertEqual(SceneObjectScalePolicy.settled(base: -3, gestureScale: 2, unitSide: 140), 2)
    }

    /// **Le lecteur ne borne rien** : seule une valeur qu'aucun geste ne
    /// produit (zéro, négative, non finie) revient à l'identité.
    func test_lecture_neBorneQueLesValeursAbsurdes() {
        XCTAssertEqual(SceneObjectScalePolicy.sanitized(0.01), 0.01)
        XCTAssertEqual(SceneObjectScalePolicy.sanitized(250), 250)
        XCTAssertEqual(SceneObjectScalePolicy.sanitized(0), 1)
        XCTAssertEqual(SceneObjectScalePolicy.sanitized(-2), 1)
        XCTAssertEqual(SceneObjectScalePolicy.sanitized(.nan), 1)
        XCTAssertEqual(SceneObjectScalePolicy.sanitized(.infinity), 1)
    }

    /// **Le média de FOND n'est pas un objet posé** : il garde le cadrage qu'il
    /// avait, de 0,3 à 4.
    func test_leFond_garderSesBornesDeCadrage() {
        XCTAssertEqual(SceneObjectScalePolicy.backgroundRange, 0.3...4.0)
        XCTAssertEqual(SceneObjectScalePolicy.settledBackground(base: 2, gestureScale: 10), 4)
        XCTAssertEqual(SceneObjectScalePolicy.settledBackground(base: 1, gestureScale: 0.01), 0.3)
        XCTAssertEqual(SceneObjectScalePolicy.settledBackground(base: 1, gestureScale: 2), 2)
    }
    /// Une valeur SAISIE (champ, pas ±, curseur) suit la règle du geste :
    /// aucun plafond, et rien sous le plancher de l'objet.
    func test_uneSaisie_naAucunPlafond() {
        XCTAssertEqual(SceneObjectScalePolicy.entered(250, current: 1, unitSide: 140), 250)
        XCTAssertEqual(SceneObjectScalePolicy.entered(1e6, current: 30, unitSide: 72), 1e6)
    }

    func test_uneSaisieSousLePlancher_sArreteAuPlancher() {
        XCTAssertEqual(SceneObjectScalePolicy.entered(0.0001, current: 1, unitSide: 140), 5.0 / 140, accuracy: 1e-12)
        XCTAssertEqual(SceneObjectScalePolicy.entered(0.02, current: 1, unitSide: 72), 5.0 / 72, accuracy: 1e-12)
        XCTAssertEqual(SceneObjectScalePolicy.entered(0.04, current: 1, unitSide: 140), 0.04, accuracy: 1e-12)
    }

    /// Un pas « − » qui passe sous zéro, ou un « 0 » tapé, veut dire « le plus
    /// petit possible » : la saisie s'arrête au plancher, elle n'est pas ignorée.
    func test_uneSaisieNulleOuNegative_sArreteAuPlancher() {
        XCTAssertEqual(SceneObjectScalePolicy.entered(0, current: 1, unitSide: 140), 5.0 / 140, accuracy: 1e-12)
        XCTAssertEqual(SceneObjectScalePolicy.entered(-0.02, current: 0.08, unitSide: 140), 5.0 / 140, accuracy: 1e-12)
    }

    func test_uneSaisieNonFinie_neChangeRien() {
        XCTAssertEqual(SceneObjectScalePolicy.entered(.nan, current: 2, unitSide: 140), 2)
        XCTAssertEqual(SceneObjectScalePolicy.entered(.infinity, current: 2, unitSide: 140), 2)
    }

    /// Sans côté mesurable, le plancher ne se prouve pas : la saisie grandit
    /// encore, elle ne réduit plus — comme le geste.
    func test_uneSaisieSansCoteMesurable_neReduitPas() {
        XCTAssertEqual(SceneObjectScalePolicy.entered(0.5, current: 1, unitSide: 0), 1)
        XCTAssertEqual(SceneObjectScalePolicy.entered(3, current: 1, unitSide: .nan), 3)
        XCTAssertEqual(SceneObjectScalePolicy.entered(0, current: 1, unitSide: 0), 1)
    }
}
