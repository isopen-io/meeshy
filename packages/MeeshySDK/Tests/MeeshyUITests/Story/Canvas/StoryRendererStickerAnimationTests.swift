import XCTest
import CoreMedia
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #4821 — **la pose d'une décoration animée est une fonction du temps,
/// posée par la post-passe de `StoryRenderer` à chaque tick.** Le même code
/// sert le lecteur (60 Hz) et l'export (`StoryAVCompositor`, 30 fps, avec
/// cache) : ce que ces témoins prouvent sur `render(at:)` vaut pour les deux.
@MainActor
final class StoryRendererStickerAnimationTests: XCTestCase {

    private let géométrie = CanvasGeometry(renderSize: CGSize(width: 402, height: 715))

    private func slide(animation: StickerAnimation?, rotation: Double = 0) -> StorySlide {
        var effects = StoryEffects()
        effects.stickerObjects = [
            StorySticker(id: "st", emoji: "\u{1F389}", animation: animation, rotation: rotation),
        ]
        return StorySlide(id: "slide", effects: effects)
    }

    private func stickerLayer(_ slide: StorySlide, at seconds: Double,
                              mode: RenderMode = .play,
                              reduceMotion: Bool = false,
                              cache: StoryRendererCache? = nil) throws -> CALayer {
        let root = StoryRenderer.render(slide: slide, into: géométrie,
                                        at: CMTime(seconds: seconds, preferredTimescale: 600),
                                        mode: mode, cache: cache,
                                        contentsScale: 2, reduceMotion: reduceMotion)
        return try XCTUnwrap(root.sublayers?.first { $0.name == "st" },
                             "la couche du sticker doit être dans l'arbre")
    }

    // MARK: - La pose

    func test_animatedSticker_isAtRest_atZero() throws {
        let couche = try stickerLayer(slide(animation: .spin), at: 0)
        XCTAssertTrue(CATransform3DIsIdentity(couche.transform))
    }

    /// `spin` tourne d'un tour par période (4 s) : à 1 s, un quart de tour.
    func test_animatedSticker_moves_withTime() throws {
        let couche = try stickerLayer(slide(animation: .spin), at: 1.0)
        XCTAssertFalse(CATransform3DIsIdentity(couche.transform))
        XCTAssertEqual(Double(couche.transform.m12), 1, accuracy: 1e-6, "sin 90°")
        XCTAssertEqual(Double(couche.transform.m11), 0, accuracy: 1e-6, "cos 90°")
    }

    /// La rotation de l'AUTEUR et celle de l'animation s'additionnent.
    func test_authorRotation_addsToTheAnimation() throws {
        let couche = try stickerLayer(slide(animation: .spin, rotation: 30), at: 1.0)
        XCTAssertEqual(Double(couche.transform.m11), cos(120 * Double.pi / 180), accuracy: 1e-6)
    }

    func test_stillSticker_neverMoves() throws {
        let couche = try stickerLayer(slide(animation: nil), at: 1.0)
        XCTAssertTrue(CATransform3DIsIdentity(couche.transform))
    }

    /// `blink` descend à 40 % d'opacité à mi-période.
    func test_blink_drivesOpacity() throws {
        let couche = try stickerLayer(slide(animation: .blink), at: StickerAnimation.blink.period / 2)
        XCTAssertEqual(Double(couche.opacity), 0.4, accuracy: 1e-4)
    }

    // MARK: - Ce qui n'anime PAS

    /// Sous Reduce Motion, le lecteur perd le mouvement, pas la décoration.
    func test_reduceMotion_keepsTheStickerStill() throws {
        let couche = try stickerLayer(slide(animation: .spin), at: 1.0, reduceMotion: true)
        XCTAssertTrue(CATransform3DIsIdentity(couche.transform))
        XCTAssertEqual(couche.opacity, 1)
    }

    /// En ÉDITION la décoration reste immobile sous le doigt.
    func test_editMode_keepsTheStickerStill() throws {
        let couche = try stickerLayer(slide(animation: .spin), at: 1.0, mode: .edit)
        XCTAssertTrue(CATransform3DIsIdentity(couche.transform))
    }

    // MARK: - L'export

    /// Le compositor réutilise les couches d'un tick à l'autre : la pose doit
    /// être REPOSÉE sur la couche réutilisée, pas figée à celle du build.
    func test_cachedLayer_isReposed_everyTick() throws {
        let cache = StoryRendererCache()
        _ = try stickerLayer(slide(animation: .spin), at: 0.5, cache: cache)
        let réutilisée = try stickerLayer(slide(animation: .spin), at: 1.0, cache: cache)
        let fraîche = try stickerLayer(slide(animation: .spin), at: 1.0)
        XCTAssertEqual(Double(réutilisée.transform.m12), Double(fraîche.transform.m12), accuracy: 1e-6)
        XCTAssertEqual(Double(réutilisée.transform.m12), 1, accuracy: 1e-6)
    }

    // MARK: - La pose depuis le gabarit

    /// Un cœur se pose BATTANT : l'auteur n'a rien réglé.
    func test_templatePose_carriesTheTemplateAnimation() throws {
        let vm = StoryComposerViewModel()
        let cœur = try XCTUnwrap(StickerTemplateCatalog.template(id: StickerTemplateCatalog.ID.loveHeartFrame))
        let posé = vm.addSticker(template: cœur, slots: [:])
        XCTAssertEqual(posé.animation, .heartbeat)
        let emoji = vm.addSticker(emoji: "\u{1F389}", scale: StorySticker.posedScale)
        XCTAssertNil(emoji.animation)
    }
}
