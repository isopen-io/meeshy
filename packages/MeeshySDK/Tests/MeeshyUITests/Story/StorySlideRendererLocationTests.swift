import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Second pipeline de dessin du dépôt : `StorySlideRenderer.renderComposite`
/// produit la cover du tray de stories ET le placeholder ThumbHash. Il dessine
/// fond, médias, textes, stickers et dessin à la main — une couche oubliée ici
/// donne une bulle de tray qui ne ressemble pas à la story jouée (divergence
/// déjà documentée pour les stickers, cf. `CanvasGeometry.stickerFontSize`).
@MainActor
final class StorySlideRendererLocationTests: XCTestCase {

    private let size = CGSize(width: 270, height: 480)

    private func slide(withBadge: Bool) -> StorySlide {
        var slide = StorySlide(id: "s1")
        slide.effects.background = "000000"
        guard withBadge else { return slide }
        slide.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                                   name: "Tour Eiffel"),
                                x: 0.5, y: 0.8)
        ]
        return slide
    }

    /// Somme des composantes RGB d'un rendu — un badge clair posé sur un fond
    /// noir la fait monter ; aucun dessin la laisse à zéro.
    private func brightness(of image: UIImage) throws -> Int {
        let width = Int(image.size.width), height = Int(image.size.height)
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let ctx = try XCTUnwrap(CGContext(
            data: &pixels, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(try XCTUnwrap(image.cgImage), in: CGRect(origin: .zero,
                                                          size: CGSize(width: width, height: height)))
        return pixels.reduce(0) { $0 + Int($1) }
    }

    func test_renderComposite_drawsTheLocationBadge() throws {
        let withBadge = try XCTUnwrap(
            StorySlideRenderer.renderComposite(slide: slide(withBadge: true), bgImage: nil, size: size))
        let without = try XCTUnwrap(
            StorySlideRenderer.renderComposite(slide: slide(withBadge: false), bgImage: nil, size: size))

        XCTAssertGreaterThan(try brightness(of: withBadge), try brightness(of: without),
                             "La cover du tray et le ThumbHash doivent montrer la pastille, comme le canvas et la vidéo exportée.")
    }

    /// La pastille est peinte À SA position normalisée : un badge en haut de
    /// slide ne doit rien changer au bas du composite.
    func test_renderComposite_drawsTheBadgeAtItsNormalizedPosition() throws {
        var top = slide(withBadge: true)
        top.locationObjects[0].y = 0.1
        let image = try XCTUnwrap(
            StorySlideRenderer.renderComposite(slide: top, bgImage: nil, size: size))

        XCTAssertGreaterThan(try alphaWeightedRow(of: image, band: 0..<Int(size.height / 2)),
                             try alphaWeightedRow(of: image, band: Int(size.height / 2)..<Int(size.height)),
                             "Un badge posé à y=0.1 doit éclairer la moitié HAUTE du composite, pas la basse.")
    }

    private func alphaWeightedRow(of image: UIImage, band: Range<Int>) throws -> Int {
        let width = Int(image.size.width), height = Int(image.size.height)
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let ctx = try XCTUnwrap(CGContext(
            data: &pixels, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(try XCTUnwrap(image.cgImage), in: CGRect(origin: .zero,
                                                          size: CGSize(width: width, height: height)))
        var total = 0
        for y in band where y < height {
            for x in 0..<width {
                let i = (y * width + x) * 4
                total += Int(pixels[i]) + Int(pixels[i + 1]) + Int(pixels[i + 2])
            }
        }
        return total
    }
}
