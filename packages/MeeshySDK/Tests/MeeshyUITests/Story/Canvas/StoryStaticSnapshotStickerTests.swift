import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #4852 — **la cover peint le sticker collé.** `StoryStaticSnapshot` recevait
/// déjà `loadedImages` — le dictionnaire où le composer range le bitmap sous
/// `sticker.id` — et ne le remettait pas au moteur : la cover du tray et du
/// brouillon montraient le repli 🖼️ à la place de l'image.
@MainActor
final class StoryStaticSnapshotStickerTests: XCTestCase {

    private func solidImage(_ color: UIColor, size: CGSize = CGSize(width: 80, height: 80)) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    /// Pixel au CENTRE du bitmap rendu, en coordonnées de pixels (le renderer
    /// applique l'échelle de l'écran hôte — on lit `cgImage`, pas `size`).
    private func centerPixel(_ image: UIImage) -> (r: Int, g: Int, b: Int)? {
        guard let cg = image.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8,
                                  bytesPerRow: w * 4, space: cs,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let i = ((h / 2) * w + (w / 2)) * 4
        return (Int(data[i]), Int(data[i + 1]), Int(data[i + 2]))
    }

    private func slideWithCenteredSticker() -> StorySlide {
        var effects = StoryEffects(background: "0000FF")
        effects.stickerObjects = [
            StorySticker(id: "st", emoji: StorySticker.imageFallbackEmoji,
                         x: 0.5, y: 0.5, scale: StorySticker.posedScale),
        ]
        return StorySlide(id: "slide", effects: effects)
    }

    /// Le bitmap sous `sticker.id` est peint, en SYNCHRONE — le centre de la
    /// cover est rouge, pas le bleu du fond ni le glyphe 🖼️.
    func test_render_paintsTheStickerBitmap_fromLoadedImages() throws {
        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(
            slide: slideWithCenteredSticker(), loadedImages: ["st": solidImage(.red)],
            size: CGSize(width: 100, height: 178)))
        let centre = try XCTUnwrap(centerPixel(snapshot))
        XCTAssertGreaterThan(centre.r, 150, "le bitmap du sticker doit être au centre de la cover")
        XCTAssertLessThan(centre.b, 110, "pas le bleu du fond : le sticker le recouvre")
    }

    /// Le témoin ci-dessus mesure bien le STICKER : sans lui, le centre de la
    /// cover est le bleu du fond.
    func test_render_withoutSticker_centerIsTheBackground() throws {
        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(
            slide: StorySlide(id: "slide", effects: StoryEffects(background: "0000FF")),
            loadedImages: ["st": solidImage(.red)],
            size: CGSize(width: 100, height: 178)))
        let centre = try XCTUnwrap(centerPixel(snapshot))
        XCTAssertLessThan(centre.r, 80)
        XCTAssertGreaterThan(centre.b, 150)
    }
}
