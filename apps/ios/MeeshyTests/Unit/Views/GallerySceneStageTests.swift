import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **Les deux plein écrans d'une PAGE SCÈNE sont des projections de la loi**
/// (décision porteur du 2026-09-17 sur #6896, lot #6904).
///
/// La galerie résolvait une page scène par `MediaStageFraming` — le solveur des
/// pièces jointes : `.carded` ajuste le média dans la zone libre, `.full` prend
/// le viewport pour CADRE et y ajuste le média. Un plein écran « immersif » y
/// laissait donc deux bandes de 79,7 pt (mesuré au simulateur sur F1) et un
/// second peintre les habillait.
///
/// La loi dit autre chose, et pour les deux états :
/// - **cadré** : la scène tient ENTIÈRE dans la zone libre du plateau, arrondie,
///   sur un fond que le plateau peint ;
/// - **immersif** : la scène COUVRE le viewport, déborde, et personne ne peint
///   autour — il ne reste rien à peindre.
///
/// Les cotes ci-dessous sont celles du simulateur de recette (iPhone 16 Pro,
/// 402 × 874, zone sûre 59 / 34, un seul média donc aucun rail).
@MainActor
final class GallerySceneStageTests: XCTestCase {

    private let viewport = CGSize(width: 402, height: 874)

    private var corridors: MediaStageFraming.Corridors {
        MediaStageFraming.Corridors(safeTop: 59,
                                    top: MediaGalleryStage.topCorridorHeight,
                                    rail: 0,
                                    transport: 0,
                                    safeBottom: 34,
                                    gutter: MediaGalleryStage.gutter)
    }

    // MARK: - Cadré

    func test_cadre_laSceneTientEntiereDansLaZoneLibre() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .carded,
                                            corridors: corridors,
                                            backdrop: .thumbHash)

        XCTAssertEqual(cadre.sceneSize.width, 378, accuracy: 0.5)
        XCTAssertEqual(cadre.sceneSize.height, 672, accuracy: 0.5)
        XCTAssertEqual(cadre.sceneSize.width / cadre.sceneSize.height,
                       SceneShape.aspect, accuracy: 0.0001,
                       "une scène est 9:16, quelle que soit la surface qui la porte")
        XCTAssertEqual(cadre.visible, cadre.sceneSize,
                       "cadrée, la scène tient entière : rien n'est rogné")
    }

    func test_cadre_leFondEstPeintEtLaCarteEstArrondie() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .carded,
                                            corridors: corridors,
                                            backdrop: .thumbHash)

        XCTAssertEqual(cadre.backdrop, .thumbHash)
        XCTAssertEqual(cadre.cornerRadius, SceneShape.cardedCornerRadius)
        XCTAssertEqual(cadre.offscreenPainter, .stage,
                       "le PLATEAU peint le hors-champ d'une scène cardée, et lui seul")
    }

    // MARK: - Immersif

    func test_immersif_laSceneCouvreLeViewportEtDeborde() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .full(pausedOnEntry: false),
                                            corridors: corridors,
                                            backdrop: .thumbHash)

        XCTAssertEqual(cadre.sceneSize.height, 874, accuracy: 0.5,
                       "l'immersif prend la HAUTEUR entière — c'est le défaut mesuré sur F1 (672 pt)")
        XCTAssertEqual(cadre.sceneSize.width, 874 * SceneShape.aspect, accuracy: 0.5)
        XCTAssertGreaterThan(cadre.sceneSize.width, viewport.width,
                             "une forme figée qui couvre un viewport plus étroit DÉBORDE")
        XCTAssertEqual(cadre.visible, viewport,
                       "ce qu'on voit, c'est le viewport entier")
    }

    func test_immersif_laSceneEstCentree() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .full(pausedOnEntry: false),
                                            corridors: corridors,
                                            backdrop: .thumbHash)

        XCTAssertEqual(cadre.layout.sceneFrame.midX, viewport.width / 2, accuracy: 0.5,
                       "le contenu visible d'une scène est au MILIEU du viewport")
        XCTAssertEqual(cadre.layout.sceneFrame.midY, viewport.height / 2, accuracy: 0.5)
    }

    func test_immersif_personneNePeintAutour() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .full(pausedOnEntry: false),
                                            corridors: corridors,
                                            backdrop: .thumbHash)

        XCTAssertNil(cadre.backdrop,
                     "il ne reste rien à peindre : l'hôte ne choisit plus de fond")
        XCTAssertEqual(cadre.offscreenPainter, .none)
        XCTAssertEqual(cadre.cornerRadius, 0,
                       "un coin arrondi sur un bord d'écran laisserait voir ce que personne ne peint")
    }

    /// **Qui peint les bandes de la scène elle-même** — la moitié que le
    /// backdrop ne dit pas. Cardée, le plateau peint sous la carte et le canvas
    /// se tait (#6791) ; immersive, le plateau n'est plus là et le canvas
    /// redevient le seul peintre possible.
    func test_lePeintreDesBandes_suitLaLoiEtChangeAvecLEtat() {
        let cadree = GallerySceneStage.frame(viewport: viewport, presentation: .carded,
                                             corridors: corridors, backdrop: .thumbHash)
        let immersive = GallerySceneStage.frame(viewport: viewport,
                                                presentation: .full(pausedOnEntry: false),
                                                corridors: corridors, backdrop: .thumbHash)

        XCTAssertFalse(cadree.paintsOwnLetterbox,
                       "cardée, c'est le plateau qui peint — deux peintres empileraient deux dégradés")
        XCTAssertTrue(immersive.paintsOwnLetterbox,
                      "immersive, personne d'autre ne peint : sans le canvas, la bande est un trou noir")
    }

    /// **Le couloir du plateau ne mord PLUS en immersif** — c'est la moitié de
    /// la décision qu'un solveur de pièces jointes ne pouvait pas rendre : il
    /// ajustait, donc il laissait des bandes même sur une scène au gabarit.
    func test_lesDeuxEtats_neRendentPasLeMemeCadre() {
        let cadree = GallerySceneStage.frame(viewport: viewport, presentation: .carded,
                                             corridors: corridors, backdrop: .black)
        let immersive = GallerySceneStage.frame(viewport: viewport,
                                                presentation: .full(pausedOnEntry: false),
                                                corridors: corridors, backdrop: .black)

        XCTAssertGreaterThan(immersive.sceneSize.height, cadree.sceneSize.height)
        XCTAssertEqual(immersive.sceneSize.width / immersive.sceneSize.height,
                       cadree.sceneSize.width / cadree.sceneSize.height, accuracy: 0.0001,
                       "seule la TAILLE change d'un état à l'autre, jamais la forme")
    }
}
