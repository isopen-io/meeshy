import XCTest
@testable import Meeshy

/// **Un outil dont AUCUN pixel ne paraît n'existe pas (#4071).**
///
/// La rangée d'entrées du document est un `ScrollView` horizontal. Mesuré au
/// simulateur `Meeshy-iOS26` le 2026-08-30, à taille de police NOMINALE sur un
/// écran de 402 pt : quatre tuiles visibles sur sept. « DOC », « LIEU » et
/// « MICRO » ne rendaient aucun pixel — alors que leurs trois chaînes sont
/// complètes jusqu'au brouillon et au publieur.
///
/// C'est la forme exacte de #4379, mesurée là sur la rangée de la SCÈNE : un
/// `ScrollView` posé pour le cas `accessibility-XXXL` finit par masquer des
/// outils dans le cas nominal, et **le défilement n'a pas d'état d'échec** —
/// rien ne rougit, aucune garde ne tombe.
///
/// La parade n'est pas de retirer un outil (loi 1 : ce qui dépasse reste) ni de
/// promettre que tout tienne — à sept tuiles nommées plus la pastille de langue,
/// ça ne tient pas sur 402 pt, et prétendre le contraire produirait des cibles
/// tactiles sous les 44 pt. La parade est que la DERNIÈRE tuile PARAISSE :
/// une tuile coupée est une invitation à balayer, une tuile absente est un
/// outil qui n'existe pas.
final class ComposerDocumentToolRowFitTests: XCTestCase {

    /// La mesure qui a motivé la règle, rejouée telle quelle.
    private let largeurReelle: CGFloat = 402
    private let accessoireLangue: CGFloat = 44
    private let margesEtEcart: CGFloat = 28 + 16

    private var visible: CGFloat { largeurReelle - margesEtEcart - accessoireLangue }

    func test_septTuilesNeTiennentPasSur402pt_etLaRegleLeDit() {
        XCTAssertGreaterThan(
            ComposerDocumentToolRowFit.rowWidth(count: 7), visible,
            "si la règle prétendait que ça tient, elle autoriserait des tuiles sous 44 pt"
        )
    }

    /// **LE témoin.** Il tombe sur l'état d'avant — quatre tuiles visibles, la
    /// cinquième commençant au-delà du bord — et il tient sur l'état d'après.
    func test_laDerniereTuileParait_aTailleNominaleSur402pt() {
        XCTAssertTrue(
            ComposerDocumentToolRowFit.lastTilePeeks(count: 7, available: visible),
            "la septième entrée doit montrer quelque chose : c'est le seul signal "
            + "qu'un balayage est possible"
        )
    }

    /// Le témoin serait vert par omission si la règle rendait « oui » sans
    /// regarder : on lui donne une largeur où la réponse DOIT être non.
    func test_surUnEcranAbsurdementEtroit_laRegleRefuse() {
        XCTAssertFalse(ComposerDocumentToolRowFit.lastTilePeeks(count: 7, available: 60))
    }

    func test_uneRangeeQuiTient_paraitEntierement() {
        let quatre = ComposerDocumentToolRowFit.rowWidth(count: 4)
        XCTAssertTrue(ComposerDocumentToolRowFit.lastTilePeeks(count: 4, available: quatre))
        XCTAssertEqual(ComposerDocumentToolRowFit.overflow(count: 4, available: quatre), 0)
    }

    /// La cible tactile est un plancher, jamais une variable d'ajustement : on
    /// n'obtient pas « tout tient » en rétrécissant les tuiles sous le doigt.
    func test_laTuileNeDescendJamaisSousLaCibleTactile() {
        XCTAssertGreaterThanOrEqual(ComposerDocumentToolRowFit.minimumTileWidth, 44)
    }

    func test_uneRangeeVide_neParaitPas() {
        XCTAssertFalse(ComposerDocumentToolRowFit.lastTilePeeks(count: 0, available: 300))
    }
}
