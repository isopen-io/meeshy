import XCTest
import AVFoundation
import QuartzCore
@testable import MeeshyUI

/// Résolution de gravité du fond média (image/vidéo) du canvas story.
///
/// Règle produit (user 2026-06-03) : « le reader/preview ne doit pas afficher de
/// fond de canvas lorsque le fond a déjà une image ou vidéo ». En mode libre
/// (aucun override auteur), un fond média DOIT remplir le canvas (`resizeAspectFill`)
/// — sinon une image/vidéo paysage est letterboxée (`resizeAspect`) et la couleur de
/// fond du canvas apparaît en bandes au-dessus/en-dessous. Le fit reste accessible
/// explicitement (override `"fit"`, ex. double-tap auteur).
final class StoryBackgroundLayerGravityTests: XCTestCase {

    private let canvas = CGSize(width: 1080, height: 1920)          // 9:16
    private let landscape = CGSize(width: 1920, height: 1080)        // 16:9
    private let portrait = CGSize(width: 1080, height: 1920)        // 9:16

    // MARK: - Image

    func test_imageGravity_landscape_noOverride_fillsCanvas() {
        // Cœur du fix : une image paysage ne doit PLUS être letterboxée par défaut.
        let g = StoryBackgroundLayer.resolveImageGravity(
            naturalSize: landscape, canvasSize: canvas, override: nil)
        XCTAssertEqual(g, .resizeAspectFill)
    }

    func test_imageGravity_portrait_noOverride_fillsCanvas() {
        let g = StoryBackgroundLayer.resolveImageGravity(
            naturalSize: portrait, canvasSize: canvas, override: nil)
        XCTAssertEqual(g, .resizeAspectFill)
    }

    func test_imageGravity_explicitFit_letterboxes() {
        let g = StoryBackgroundLayer.resolveImageGravity(
            naturalSize: landscape, canvasSize: canvas, override: "fit")
        XCTAssertEqual(g, .resizeAspect)
    }

    func test_imageGravity_explicitFill_fills() {
        let g = StoryBackgroundLayer.resolveImageGravity(
            naturalSize: landscape, canvasSize: canvas, override: "fill")
        XCTAssertEqual(g, .resizeAspectFill)
    }

    // MARK: - Video

    func test_videoGravity_landscape_noOverride_fillsCanvas() {
        let g = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: landscape, canvasSize: canvas, override: nil)
        XCTAssertEqual(g, .resizeAspectFill)
    }

    func test_videoGravity_explicitFit_letterboxes() {
        let g = StoryBackgroundLayer.resolveVideoGravity(
            naturalSize: landscape, canvasSize: canvas, override: "fit")
        XCTAssertEqual(g, .resizeAspect)
    }

    // MARK: - Kind.isVisualMedia (fond coloré supprimé ssi fond visuel média)

    func test_kindIsVisualMedia_imageAndVideo_areVisual() {
        XCTAssertTrue(StoryBackgroundLayer.Kind.image(postMediaId: "p", thumbHash: nil).isVisualMedia)
        XCTAssertTrue(StoryBackgroundLayer.Kind.video(postMediaId: "p", looping: true, mute: false, thumbHash: nil).isVisualMedia)
    }

    func test_kindIsVisualMedia_solidAndGradient_areNotVisual() {
        XCTAssertFalse(StoryBackgroundLayer.Kind.solidColor(.black).isVisualMedia)
        XCTAssertFalse(StoryBackgroundLayer.Kind.gradient(colors: [.red, .blue], direction: .topToBottom).isVisualMedia)
    }
}
