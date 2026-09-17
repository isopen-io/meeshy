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
                                            corridors: corridors)

        XCTAssertEqual(cadre.sceneSize.width, 378, accuracy: 0.5)
        XCTAssertEqual(cadre.sceneSize.height, 672, accuracy: 0.5)
        XCTAssertEqual(cadre.sceneSize.width / cadre.sceneSize.height,
                       SceneShape.aspect, accuracy: 0.0001,
                       "une scène est 9:16, quelle que soit la surface qui la porte")
        XCTAssertLessThanOrEqual(cadre.sceneSize.width, viewport.width,
                                 "cadrée, la scène tient entière : rien n'est rogné")
    }

    func test_cadre_leFondEstPeintEtLaCarteEstArrondie() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .carded,
                                            corridors: corridors)

        XCTAssertEqual(cadre.backdrop, SceneShape.cardedBackdrop,
                       "le fond d'une carte de scène est celui de la LOI, le même que le lecteur de stories")
        XCTAssertEqual(cadre.cornerRadius, SceneShape.cardedCornerRadius)
        XCTAssertEqual(cadre.backdrop, StoryCardView.readerSceneBackdrop,
                       "et c'est celui du lecteur de stories, parce qu'il n'y en a qu'un")
    }

    // MARK: - Immersif

    /// **L'immersif n'est plus une autre FORME, c'est un autre VIEWPORT**
    /// (directive porteur du 2026-09-17, 3e message : « On préserve le même
    /// fond que pour la story ! »).
    ///
    /// Il prenait la hauteur entière en DÉBORDANT en largeur — un aspect-FILL
    /// qui retirait 44,8 pt de chaque côté de la scène, la seule surface du
    /// produit qui rognait ce que l'auteur avait posé. Sans couloir de plateau,
    /// la carte grandit ; elle ne se remplit pas.
    func test_immersif_estLaMemeCarteSansLesCouloirsDuPlateau() {
        let cadree = GallerySceneStage.frame(viewport: viewport, presentation: .carded,
                                             corridors: corridors)
        let immersif = GallerySceneStage.frame(viewport: viewport,
                                               presentation: .full(pausedOnEntry: false),
                                               corridors: corridors)

        XCTAssertEqual(immersif.sceneSize.width, viewport.width, accuracy: 0.5,
                       "le viewport entier borne la carte par sa LARGEUR sur un iPhone")
        XCTAssertEqual(immersif.sceneSize.height, viewport.width / SceneShape.aspect,
                       accuracy: 0.5, "714,7 pt — la scène AJUSTÉE, jamais les 874 d'un remplissage")
        XCTAssertGreaterThan(immersif.sceneSize.width, cadree.sceneSize.width,
                             "sans couloir, la MÊME carte est plus grande")
        XCTAssertEqual(immersif.sceneSize.width / immersif.sceneSize.height,
                       SceneShape.aspect, accuracy: 0.0001)
    }

    func test_immersif_laSceneEstCentree() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .full(pausedOnEntry: false),
                                            corridors: corridors)

        XCTAssertEqual(cadre.layout.sceneFrame.midX, viewport.width / 2, accuracy: 0.5,
                       "le contenu visible d'une scène est au MILIEU du viewport")
        XCTAssertEqual(cadre.layout.sceneFrame.midY, viewport.height / 2, accuracy: 0.5)
    }

    /// **Le fond et les coins de la story, jusque dans l'immersif.** C'est le
    /// 3e message de la directive, et c'est ce qui a retiré `Fullscreen` de la
    /// loi : un second état n'aurait plus rien eu à dire.
    func test_immersif_gardeLeFondEtLesCoinsDeLaStory() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .full(pausedOnEntry: false),
                                            corridors: corridors)

        XCTAssertEqual(cadre.backdrop, SceneShape.cardedBackdrop)
        XCTAssertEqual(cadre.cornerRadius, SceneShape.cardedCornerRadius,
                       "les coins de la story, même sans plateau autour")
    }

    /// **Le couloir du plateau ne mord PLUS en immersif** — c'est la moitié de
    /// la décision qu'un solveur de pièces jointes ne pouvait pas rendre : il
    /// ajustait, donc il laissait des bandes même sur une scène au gabarit.
    func test_lesDeuxEtats_neRendentPasLeMemeCadre() {
        let cadree = GallerySceneStage.frame(viewport: viewport, presentation: .carded,
                                             corridors: corridors)
        let immersive = GallerySceneStage.frame(viewport: viewport,
                                                presentation: .full(pausedOnEntry: false),
                                                corridors: corridors)

        XCTAssertGreaterThan(immersive.sceneSize.height, cadree.sceneSize.height)
        XCTAssertEqual(immersive.sceneSize.width / immersive.sceneSize.height,
                       cadree.sceneSize.width / cadree.sceneSize.height, accuracy: 0.0001,
                       "seule la TAILLE change d'un état à l'autre, jamais la forme")
    }
}
