// packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/StoryAVCompositorOpeningParityTests.swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// L'export MP4 doit rendre la MÊME ouverture que l'aperçu du composer et que
/// le lecteur.
///
/// Il ne le faisait pas : `applyStaticOpening` traitait `.fade` et `.reveal`,
/// puis `case .zoom, .slide: break`. Un auteur qui choisissait l'un de ces deux
/// effets — les deux plus visuels — voyait son ouverture dans l'app et
/// obtenait une vidéo sans aucune transition, sans le moindre signal.
///
/// Le compositor ne peut pas réutiliser `StoryRenderer.applyOpening` tel quel :
/// `layer.render(in:)` ne fait pas tourner le moteur d'animation, donc l'état
/// doit être calculé image par image sur la couche MODÈLE. Ce qu'il partage en
/// revanche, ce sont les constantes — c'est là que la parité se joue.
@MainActor
final class StoryAVCompositorOpeningParityTests: XCTestCase {

    private static let viewport = CGRect(x: 0, y: 0, width: 1080, height: 1920)

    private func makeLayer() -> CALayer {
        let layer = CALayer()
        layer.frame = Self.viewport
        return layer
    }

    // MARK: - Zoom

    /// Au premier instant, l'export part de l'échelle du SDK — la même valeur
    /// que `applyOpening` pose en `fromValue`.
    func test_zoom_startsAtTheSdkScale() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.zoom, rootLayer: layer, elapsed: 0)

        XCTAssertEqual(layer.sublayerTransform.m11, StoryRenderer.zoomTransitionScale, accuracy: 0.0001)
    }

    /// …et il DÉZOOME : à la fin de la fenêtre, la couche est revenue à
    /// l'identité. L'inverse ferait grossir l'image au lieu de la poser.
    func test_zoom_settlesAtIdentity() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.zoom, rootLayer: layer,
                                             elapsed: StoryRenderer.slideTransitionDuration)

        XCTAssertEqual(layer.sublayerTransform.m11, 1, accuracy: 0.0001)
    }

    // MARK: - Slide

    /// Le glissement est HORIZONTAL et vaut la fraction de largeur du SDK — pas
    /// un décalage vertical, pas une valeur en points.
    func test_slide_startsAtTheSdkTravel_horizontally() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.slide, rootLayer: layer, elapsed: 0)

        let expected = Self.viewport.width * StoryRenderer.slideTransitionTravelFraction
        XCTAssertEqual(layer.sublayerTransform.m41, expected, accuracy: 0.5)
        XCTAssertEqual(layer.sublayerTransform.m42, 0, accuracy: 0.0001,
                       "Le glissement du SDK est horizontal.")
    }

    func test_slide_settlesAtOrigin() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.slide, rootLayer: layer,
                                             elapsed: StoryRenderer.slideTransitionDuration)

        XCTAssertEqual(layer.sublayerTransform.m41, 0, accuracy: 0.0001)
    }

    // MARK: - La fenêtre est celle du SDK

    /// La durée d'ouverture était écrite en dur (`0.5`) dans le compositor.
    /// Elle suit désormais la constante partagée : changer la constante ne doit
    /// pas désaligner l'export des deux autres surfaces.
    func test_openingWindow_followsTheSharedConstant() {
        let layer = makeLayer()

        // À mi-fenêtre, le zoom doit être à mi-chemin entre l'échelle de départ
        // et l'identité.
        StoryAVCompositor.applyStaticOpening(.zoom, rootLayer: layer,
                                             elapsed: StoryRenderer.slideTransitionDuration / 2)

        let midpoint = 1 + (StoryRenderer.zoomTransitionScale - 1) / 2
        XCTAssertEqual(layer.sublayerTransform.m11, midpoint, accuracy: 0.0001)
    }

    // MARK: - Non-régression sur les deux effets déjà rendus

    func test_fade_stillRampsOpacity() {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.fade, rootLayer: layer, elapsed: 0)
        XCTAssertEqual(layer.opacity, 0, accuracy: 0.0001)

        StoryAVCompositor.applyStaticOpening(.fade, rootLayer: layer,
                                             elapsed: StoryRenderer.slideTransitionDuration)
        XCTAssertEqual(layer.opacity, 1, accuracy: 0.0001)
    }

    func test_reveal_stillMasksWithAGrowingCircle() throws {
        let layer = makeLayer()

        StoryAVCompositor.applyStaticOpening(.reveal, rootLayer: layer, elapsed: 0)
        let start = try XCTUnwrap(layer.mask as? CAShapeLayer).path?.boundingBox.width ?? 0

        StoryAVCompositor.applyStaticOpening(.reveal, rootLayer: layer,
                                             elapsed: StoryRenderer.slideTransitionDuration)
        let end = try XCTUnwrap(layer.mask as? CAShapeLayer).path?.boundingBox.width ?? 0

        XCTAssertLessThan(start, end, "Le cercle doit s'ouvrir.")
    }
}
