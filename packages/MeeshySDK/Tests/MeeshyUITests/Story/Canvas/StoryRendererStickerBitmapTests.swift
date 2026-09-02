import XCTest
import CoreMedia
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #4852 — **le moteur remet à la couche sticker ce qu'il remet déjà à la
/// couche média** : le lecteur d'images et le resolver. Sans eux, la couche
/// savait peindre un bitmap et n'en recevait jamais — canvas, lecteur, cover,
/// export sortaient tous le repli 🖼️.
@MainActor
final class StoryRendererStickerBitmapTests: XCTestCase {

    private let géométrie = CanvasGeometry(renderSize: CGSize(width: 402, height: 715))

    private func bitmap(_ color: UIColor) -> UIImage {
        let size = CGSize(width: 6, height: 4)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func slide(animation: StickerAnimation? = nil) -> StorySlide {
        var effects = StoryEffects()
        effects.stickerObjects = [
            StorySticker(id: "st", emoji: StorySticker.imageFallbackEmoji, animation: animation,
                         scale: StorySticker.posedScale),
        ]
        return StorySlide(id: "slide", effects: effects)
    }

    private func stickerLayer(_ slide: StorySlide, at seconds: Double, mode: RenderMode,
                              imageCache: ImageCacheReader?) throws -> StoryStickerLayer {
        let root = StoryRenderer.render(slide: slide, into: géométrie,
                                        at: CMTime(seconds: seconds, preferredTimescale: 600),
                                        mode: mode, imageCache: imageCache,
                                        contentsScale: 2, reduceMotion: false)
        return try XCTUnwrap(root.sublayers?.first { $0.name == "st" } as? StoryStickerLayer,
                             "la couche du sticker doit être dans l'arbre")
    }

    private func paints(_ layer: CALayer, _ image: UIImage) -> Bool {
        guard let contents = layer.contents, let cgImage = image.cgImage else { return false }
        // swiftlint:disable:next force_cast
        return CFEqual(contents as! CGImage, cgImage)
    }

    /// Le canvas du composer : `loadedImages[sticker.id]` arrive par le
    /// `ComposerImageCacheReader` du contexte d'édition.
    func test_editRender_paintsTheComposerBitmap() throws {
        let collé = bitmap(.red)
        let couche = try stickerLayer(slide(), at: 0, mode: .edit,
                                      imageCache: ComposerImageCacheReader(images: ["st": collé], version: 0))
        XCTAssertTrue(paints(couche, collé))
        XCTAssertEqual(couche.contentsGravity, .resizeAspect)
    }

    /// L'export (`.play`, cache d'export) : la pose de l'animation se repose
    /// sur la couche qui porte le bitmap — le bitmap suit, comme le glyphe.
    func test_playRender_keepsTheBitmap_underTheAnimationPose() throws {
        let collé = bitmap(.green)
        let couche = try stickerLayer(slide(animation: .spin), at: 1.0, mode: .play,
                                      imageCache: ComposerImageCacheReader(images: ["st": collé], version: 0))
        XCTAssertTrue(paints(couche, collé))
        XCTAssertEqual(Double(couche.transform.m12), 1, accuracy: 1e-6, "sin 90° — un quart de tour")
    }

    /// Sans lecteur, le rendu d'avant : le glyphe.
    func test_renderWithoutReader_paintsTheGlyph() throws {
        let couche = try stickerLayer(slide(), at: 0, mode: .edit, imageCache: nil)
        XCTAssertNotNil(couche.contents)
        XCTAssertFalse(paints(couche, bitmap(.red)))
    }

    // MARK: - Garde de source

    /// Le resolver ne se prouve pas en XCTest sans toucher le cache disque
    /// réel : ce qui se vérifie ici, c'est que la branche sticker de
    /// `renderItem` REMET les deux fils — c'est leur absence qui a produit le
    /// défaut, alors que la branche média les recevait douze lignes plus haut.
    func test_renderItem_handsImageCacheAndResolver_toTheStickerLayer() throws {
        let source = try String(contentsOf: ComposerSourceGuard.packageRoot
                                    .appendingPathComponent("Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift"),
                                encoding: .utf8)
        let branche = try XCTUnwrap(Self.blockBody(after: "if let sticker = item as? StorySticker {", in: source),
                                    "La branche sticker de `renderItem` est introuvable.")
        XCTAssertTrue(branche.contains("imageCache: imageCache"),
                      "La couche sticker doit recevoir le lecteur d'images, comme la couche média.")
        XCTAssertTrue(branche.contains("resolver: resolver"),
                      "La couche sticker doit recevoir le resolver `postMediaId → URL`, comme la couche média.")
    }

    private static func blockBody(after entête: String, in code: String) -> String? {
        guard let début = code.range(of: entête) else { return nil }
        var profondeur = 0
        var index = code.index(before: début.upperBound)   // l'accolade de l'entête
        while index < code.endIndex {
            if code[index] == "{" { profondeur += 1 }
            if code[index] == "}" {
                profondeur -= 1
                if profondeur == 0 {
                    return String(code[début.upperBound..<index])
                }
            }
            index = code.index(after: index)
        }
        return nil
    }
}
