import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **Les deux plein écrans d'une PAGE SCÈNE sont des projections de LA MÊME
/// CARTE** (décision porteur du 2026-09-17 sur #6896, lot #6904, 3e message).
///
/// La galerie résolvait une page scène par `MediaStageFraming` — le solveur des
/// pièces jointes : `.carded` ajuste le média dans la zone libre, `.full` prend
/// le viewport pour CADRE et y ajuste le média. Un plein écran « immersif » y
/// laissait donc deux bandes de 79,7 pt (mesuré au simulateur sur F1) et un
/// second peintre les habillait.
///
/// La loi dit autre chose, et il n'y a plus qu'UN état de carte pour les deux
/// viewports (`SceneShape.layout(in:)`, `cardedBackdrop`, `cardedCornerRadius`) :
/// - **cadré** : la scène tient ENTIÈRE dans la zone libre du plateau, arrondie,
///   sur le fond de la story ;
/// - **immersif** : la MÊME carte, dans le viewport ENTIER (sans couloir de
///   plateau ni chrome) — elle grandit, elle ne se remplit pas ; le fond et les
///   coins de la story restent, un seul peintre (`SceneCard`).
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

        XCTAssertEqual(cadre.layout.sceneFrame.size.width, 378, accuracy: 0.5)
        XCTAssertEqual(cadre.layout.sceneFrame.size.height, 672, accuracy: 0.5)
        XCTAssertEqual(cadre.layout.sceneFrame.size.width / cadre.layout.sceneFrame.size.height,
                       SceneShape.aspect, accuracy: 0.0001,
                       "une scène est 9:16, quelle que soit la surface qui la porte")
        XCTAssertLessThanOrEqual(cadre.layout.sceneFrame.size.width, viewport.width,
                                 "cadrée, la scène tient entière : rien n'est rogné")
    }

    func test_cadre_leFondEstPeintEtLaCarteEstArrondie() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .carded,
                                            corridors: corridors)

        XCTAssertEqual(cadre.layout.backdrop, SceneShape.cardedBackdrop,
                       "le fond d'une carte de scène est celui de la LOI, le même que le lecteur de stories")
        XCTAssertEqual(cadre.layout.cornerRadius, SceneShape.cardedCornerRadius)
        XCTAssertEqual(cadre.layout.backdrop, StoryCardView.readerSceneBackdrop,
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

        XCTAssertEqual(immersif.layout.sceneFrame.size.width, viewport.width, accuracy: 0.5,
                       "le viewport entier borne la carte par sa LARGEUR sur un iPhone")
        XCTAssertEqual(immersif.layout.sceneFrame.size.height, viewport.width / SceneShape.aspect,
                       accuracy: 0.5, "714,7 pt — la scène AJUSTÉE, jamais les 874 d'un remplissage")
        XCTAssertGreaterThan(immersif.layout.sceneFrame.size.width, cadree.layout.sceneFrame.size.width,
                             "sans couloir, la MÊME carte est plus grande")
        XCTAssertEqual(immersif.layout.sceneFrame.size.width / immersif.layout.sceneFrame.size.height,
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

    /// **Le fond de la story jusque dans l'immersif — mais PLUS ses coins**
    /// (directive porteur du 2026-09-18 : « lorsqu'on met en plein écran, il
    /// faut enlever l'arrondi sur le composant et garder les bords angle
    /// exacte ! »).
    ///
    /// Le fond, c'est le 3e message du 2026-09-17 et il tient : une carte
    /// immersive AJUSTE, donc son hors-champ a un peintre. Les coins, non — et
    /// ce témoin affirmait l'inverse jusqu'au 2026-09-18. Les deux moitiés
    /// avaient l'air d'une seule (« la même carte partout ») : c'est la
    /// directive qui les sépare, un plateau étant ce par rapport à quoi une
    /// carte se DÉTACHE.
    func test_immersif_gardeLeFondDeLaStory_maisPlusSesCoins() {
        let cadre = GallerySceneStage.frame(viewport: viewport,
                                            presentation: .full(pausedOnEntry: false),
                                            corridors: corridors)

        XCTAssertEqual(cadre.layout.backdrop, SceneShape.cardedBackdrop)
        XCTAssertEqual(cadre.layout.cornerRadius, SceneShape.immersiveCornerRadius,
                       "plein écran : aucun arrondi, des angles droits exacts")
    }

    /// **Les deux états ne se distinguent pas seulement par la TAILLE — le
    /// rayon les sépare aussi, et c'est la LOI qui le dit.**
    ///
    /// La galerie ne passait aucun état : elle rendait 22 pt dans ses deux
    /// plein écrans, et le seul endroit du produit où une carte de scène avait
    /// des coins droits était l'animation du lecteur de stories. Un témoin qui
    /// ne regarderait qu'un état ne pourrait pas le dire.
    func test_leRayon_suitLEtat_etLesDeuxEtatsNeLePartagentPas() {
        let cadree = GallerySceneStage.frame(viewport: viewport, presentation: .carded,
                                             corridors: corridors)
        let immersive = GallerySceneStage.frame(viewport: viewport,
                                               presentation: .full(pausedOnEntry: false),
                                               corridors: corridors)

        XCTAssertEqual(cadree.layout.cornerRadius, SceneShape.cardedCornerRadius)
        XCTAssertEqual(immersive.layout.cornerRadius, 0)
        XCTAssertNotEqual(cadree.layout.cornerRadius, immersive.layout.cornerRadius,
                          "fusible : sans cet écart, les deux témoins ci-dessus " +
                          "verdiraient sur une loi qui ignore son état")
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

        XCTAssertGreaterThan(immersive.layout.sceneFrame.size.height, cadree.layout.sceneFrame.size.height)
        XCTAssertEqual(immersive.layout.sceneFrame.size.width / immersive.layout.sceneFrame.size.height,
                       cadree.layout.sceneFrame.size.width / cadree.layout.sceneFrame.size.height, accuracy: 0.0001,
                       "seule la TAILLE change d'un état à l'autre, jamais la forme")
    }
}
