import XCTest
import SwiftUI
import CoreGraphics
@testable import MeeshyUI
import MeeshySDK

/// **Garde Phase 1 du composer unifié (#3939).** `EmbeddedSceneCanvas` doit
/// être un canvas de scène BORNÉ (pas plein écran), au ratio 9:16 par défaut,
/// à coins arrondis — le building block qui permettra à la scène de vivre en
/// haut de l'écran document.
@MainActor
final class EmbeddedSceneCanvasTests: XCTestCase {

    func test_defaults_portraitRatioAndCardedCorner() {
        let canvas = EmbeddedSceneCanvas(slide: .constant(StorySlide()))
        XCTAssertEqual(canvas.aspectRatio, CanvasGeometry.portraitRatio, accuracy: 0.0001,
                       "défaut 9:16 (portrait)")
        XCTAssertEqual(canvas.cornerRadius, 22, accuracy: 0.0001, "carte arrondie par défaut")
    }

    /// Dans un conteneur CONTRAINT EN HAUTEUR (380 pt), le canvas 9:16 reste
    /// borné : sa hauteur épouse le conteneur, sa largeur suit le ratio et NE
    /// remplit PAS toute la largeur — preuve qu'il est embarquable, pas plein
    /// écran (la cause racine du « switch vers l'ancien outil »).
    func test_boundedNineSixteen_inHeightConstrainedContainer() {
        let container = CGSize(width: 320, height: 380)
        let fit = CanvasGeometry.aspectFitSize(in: container, ratio: CanvasGeometry.portraitRatio)
        XCTAssertEqual(fit.height, 380, accuracy: 0.5, "hauteur bornée par le conteneur")
        XCTAssertEqual(fit.width, 380 * CanvasGeometry.portraitRatio, accuracy: 0.5,
                       "largeur suit le ratio 9:16")
        XCTAssertLessThan(fit.width, container.width, "borné, jamais plein écran")
    }

    /// Un fond paysage passe `landscapeRatio` (16:9) — le canvas l'accepte et
    /// reste borné (largeur du conteneur, hauteur plus courte).
    func test_landscapeAspect_isAcceptedAndBounded() {
        let canvas = EmbeddedSceneCanvas(
            slide: .constant(StorySlide()),
            aspectRatio: CanvasGeometry.landscapeRatio
        )
        XCTAssertEqual(canvas.aspectRatio, CanvasGeometry.landscapeRatio, accuracy: 0.0001)
        let fit = CanvasGeometry.aspectFitSize(
            in: CGSize(width: 320, height: 380), ratio: CanvasGeometry.landscapeRatio
        )
        XCTAssertEqual(fit.width, 320, accuracy: 0.5, "largeur bornée par le conteneur")
        XCTAssertLessThan(fit.height, 380, "hauteur plus courte en paysage")
    }
}
