import XCTest
import UIKit
@testable import MeeshyUI

/// **Le contour blanc découpé des gabarits** (#9060) — celui de Mee et Meo,
/// posé sur la feuille, la bulle et le PNG envoyé ; jamais sur la scène d'une
/// story, dont la géométrie est celle du document.
@MainActor
final class StickerDieCutTests: XCTestCase {

    /// Un disque rouge plein de 100 pt au centre d'un carré transparent.
    private func disc(side: CGFloat = 100) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
            UIColor.red.setFill()
            context.cgContext.fillEllipse(in: CGRect(x: 20, y: 20, width: side - 40, height: side - 40))
        }
    }

    private func rgba(_ image: UIImage, at point: CGPoint) -> (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) {
        let cg = image.cgImage!
        let px = Int(point.x * image.scale), py = Int(point.y * image.scale)
        var pixel = [UInt8](repeating: 0, count: 4)
        let context = CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(cg, in: CGRect(x: -px, y: py - cg.height + 1, width: cg.width, height: cg.height))
        return (CGFloat(pixel[0]) / 255, CGFloat(pixel[1]) / 255, CGFloat(pixel[2]) / 255, CGFloat(pixel[3]) / 255)
    }

    func test_outline_growsTheCanvasByItsMarginOnEverySide() {
        let source = disc()
        let cut = StickerDieCut.apply(to: source)
        let margin = StickerDieCut.margin(for: source.size)
        XCTAssertGreaterThan(margin, 0)
        XCTAssertEqual(cut.size.width, source.size.width + 2 * margin, accuracy: 0.5)
        XCTAssertEqual(cut.size.height, source.size.height + 2 * margin, accuracy: 0.5)
    }

    func test_outline_keepsTheDrawingAndRingsItWithWhite() {
        let source = disc()
        let cut = StickerDieCut.apply(to: source)
        let margin = StickerDieCut.margin(for: source.size)
        let centre = rgba(cut, at: CGPoint(x: cut.size.width / 2, y: cut.size.height / 2))
        XCTAssertGreaterThan(centre.r, 0.9)
        XCTAssertLessThan(centre.g, 0.1)
        // Juste au-dessus du bord haut du disque (y = 20 dans la source) :
        // le papier blanc, opaque.
        let anneau = rgba(cut, at: CGPoint(x: cut.size.width / 2, y: margin + 19))
        XCTAssertGreaterThan(anneau.a, 0.9)
        XCTAssertGreaterThan(anneau.g, 0.9)
        XCTAssertGreaterThan(anneau.b, 0.9)
        // Loin du dessin, le coin reste transparent : un contour, pas un fond.
        XCTAssertLessThan(rgba(cut, at: CGPoint(x: 2, y: 2)).a, 0.05)
    }

    func test_dieCutImage_ofATemplate_isLargerThanTheBareTemplate() throws {
        let id = try XCTUnwrap(StickerTemplateRenderer.drawableTemplateIDs.sorted().first)
        let metrics = StickerTemplateMetrics.preview(side: 120)
        let bare = try XCTUnwrap(StickerTemplateRenderer.image(templateID: id, slots: [:], metrics: metrics, screenScale: 2))
        let cut = try XCTUnwrap(StickerTemplateRenderer.dieCutImage(templateID: id, slots: [:], metrics: metrics, screenScale: 2))
        XCTAssertGreaterThan(cut.1.width, bare.1.width)
        XCTAssertGreaterThan(cut.1.height, bare.1.height)
        XCTAssertNotNil(cut.0)
    }
}
