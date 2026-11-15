import XCTest
import CoreGraphics
@testable import MeeshyUI

/// **#4379 — la septième entrée de la rangée canonique ne se signalait pas.**
///
/// Mesure d'origine (build `dev` @ `161e14af`, iPhone 16 Pro, 402 pt, Dynamic
/// Type NOMINAL) : sept entrées de 44 pt séparées de 16 pt occupaient 436 pt
/// marges comprises. La septième — la timeline — ne rendait aucun pixel, pas
/// même un liseré. `ComposerToolRow` est un `ScrollView` : le geste existait,
/// donc la loi 4 était tenue. **Ce qui manquait était le SIGNAL**, et un
/// défilement n'a pas d'état d'échec — rien ne pouvait rougir.
///
/// La règle éprouvée ici est la réponse 2 de l'issue : *« le pas se resserre
/// tant que les sept tiennent à taille nominale, et ne défile qu'au-delà »*.
/// Elle est PURE et prend sa largeur en paramètre — un témoin qui lirait
/// `UIScreen.main` rendrait le même verdict sur toutes les tailles d'écran,
/// donc ne prouverait rien.
final class ComposerRowFitTests: XCTestCase {

    // La rangée canonique de l'atelier, dans ses vraies valeurs.
    private let tuile: CGFloat = 44
    private let nominal: CGFloat = 16
    private let plancher: CGFloat = 8
    private let marge: CGFloat = 16
    private let entrees = 7

    private func ecart(sur largeur: CGFloat, entrees: Int? = nil) -> CGFloat {
        ComposerRowFit.spacing(count: entrees ?? self.entrees,
                               tileWidth: tuile,
                               nominalSpacing: nominal,
                               minimumSpacing: plancher,
                               margin: marge,
                               available: largeur)
    }

    private func largeurRendue(sur largeur: CGFloat, entrees: Int? = nil) -> CGFloat {
        ComposerRowFit.rowWidth(count: entrees ?? self.entrees,
                                tileWidth: tuile,
                                spacing: ecart(sur: largeur, entrees: entrees),
                                margin: marge)
    }

    // MARK: - Le défaut, dit par un témoin

    /// **Le constat de l'issue, écrit comme une mesure.** Sans lui, resserrer
    /// l'écart aurait l'air d'un goût de mise en page.
    func test_aLEcartNominal_lesSeptEntrees_neTenaientPasSurUnIPhone16Pro() {
        let figee = ComposerRowFit.rowWidth(count: entrees, tileWidth: tuile,
                                            spacing: nominal, margin: marge)
        XCTAssertEqual(figee, 436, accuracy: 0.01)
        XCTAssertGreaterThan(figee, 402,
                             "436 pt pour 402 : la septième entrée tombait hors champ.")
    }

    // MARK: - Ce que la règle rend

    func test_surIPhone16Pro_lesSeptEntrees_tiennentDansLaLargeur() {
        XCTAssertLessThanOrEqual(largeurRendue(sur: 402), 402.01,
                                 "Les sept doivent se signaler sans qu'on balaie.")
        XCTAssertGreaterThanOrEqual(ecart(sur: 402), plancher)
    }

    /// L'iPhone SE — le plus étroit que l'app supporte. Le plancher tactile y
    /// est atteint, et c'est la BONNE réponse : le pas ne descend pas sous
    /// 8 pt pour faire tenir une rangée, il laisse défiler.
    func test_surLePlusEtroitAppareil_lEcartTombeSurSonPlancher() {
        XCTAssertEqual(ecart(sur: 375), plancher, accuracy: 0.01)
    }

    /// **La dernière entrée se signale même quand la rangée déborde.** C'est la
    /// seconde moitié de la réponse : le resserrement ne peut pas tout, donc ce
    /// qui reste doit au moins DÉPASSER du bord.
    func test_surLePlusEtroitAppareil_laDerniereEntree_estEntierementVisible() {
        let debutDeLaDerniere = marge + CGFloat(entrees - 1) * (tuile + ecart(sur: 375))
        XCTAssertLessThanOrEqual(debutDeLaDerniere + tuile, 375,
                                 "Sur 375 pt le resserrement suffit encore — seule la marge de fin déborde.")
    }

    // MARK: - Ce que la règle NE fait pas

    /// **Une rangée qui tient garde son air.** Resserrer une rangée courte
    /// serrerait les glyphes sans rien gagner — la compression est une
    /// RÉPONSE à un débordement, jamais un réglage permanent.
    func test_uneRangeeCourte_gardeLEcartNominal() {
        XCTAssertEqual(ecart(sur: 402, entrees: 3), nominal, accuracy: 0.01)
    }

    /// **Une largeur inconnue ne se devine pas.** Au premier rendu, avant que
    /// la mesure ne soit remontée, la règle rend le nominal : une rangée qui
    /// naîtrait tassée puis se détendrait ferait sauter les glyphes sous le
    /// doigt.
    func test_uneLargeurInconnue_rendLEcartNominal() {
        XCTAssertEqual(ecart(sur: 0), nominal, accuracy: 0.01)
        XCTAssertEqual(ecart(sur: -10), nominal, accuracy: 0.01)
    }

    /// Une entrée unique n'a aucun écart à distribuer — la division par
    /// `count - 1` doit rendre le nominal plutôt qu'un infini.
    func test_uneSeuleEntree_nAAucunEcartADistribuer() {
        XCTAssertEqual(ecart(sur: 10, entrees: 1), nominal, accuracy: 0.01)
        XCTAssertEqual(ecart(sur: 402, entrees: 0), nominal, accuracy: 0.01)
    }

    /// **Une largeur DÉRISOIRE ne fabrique pas un écart négatif.** Le plancher
    /// vaut des deux côtés : il empêche de tasser, et il empêche d'inverser.
    func test_uneLargeurDerisoire_neRendJamaisUnEcartNegatif() {
        XCTAssertEqual(ecart(sur: 50), plancher, accuracy: 0.01)
    }

    // MARK: - Le signal de défilement

    func test_laDerniereEntree_seSignale_desQuElleCommenceAvantLeBord() {
        XCTAssertTrue(ComposerRowFit.lastTilePeeks(count: 7, tileWidth: 44, spacing: 8,
                                                   margin: 16, available: 375))
        XCTAssertFalse(ComposerRowFit.lastTilePeeks(count: 12, tileWidth: 44, spacing: 8,
                                                    margin: 16, available: 375),
                       "Douze entrées à 52 pt de pas : la douzième commence à 588, hors champ.")
    }

    // MARK: - La rangée du DOCUMENT lit la MÊME loi (#4582)

    /// **Une loi qui ne couvre qu'un site n'est pas une loi.** La rangée du
    /// document portait sa propre arithmétique ; elle projette désormais
    /// celle-ci, avec ses propres nombres. Ce témoin est ce qui interdit aux
    /// deux de rediverger.
    func test_laLoiEstLaMeme_quelsQueSoientLesNombres() {
        XCTAssertEqual(ComposerRowFit.rowWidth(count: 6, tileWidth: 44,
                                               spacing: 6, margin: 0),
                       6 * 44 + 5 * 6, accuracy: 0.01)
        XCTAssertEqual(ComposerRowFit.rowWidth(count: 0, tileWidth: 44,
                                               spacing: 6, margin: 16), 0,
                       "Zéro entrée n'occupe rien — pas même ses marges.")
    }
}
