import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryStaticSnapshotTests: XCTestCase {

    private func solidImage(_ color: UIColor, size: CGSize = CGSize(width: 80, height: 80)) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill(); ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func pixel(_ image: UIImage, at point: CGPoint) -> (r: Int, g: Int, b: Int)? {
        guard let cg = image.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8,
                                  bytesPerRow: w * 4, space: cs,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let x = min(max(0, Int(point.x)), w - 1)
        let y = min(max(0, Int(point.y)), h - 1)
        let i = (y * w + x) * 4
        return (Int(data[i]), Int(data[i + 1]), Int(data[i + 2]))
    }

    func test_render_returnsImageOfRequestedSize() throws {
        let slide = StorySlide(effects: StoryEffects(background: "1E1B4B"))
        let size = CGSize(width: 270, height: 480)

        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(slide: slide, loadedImages: [:], size: size))

        XCTAssertEqual(snapshot.size, size)
    }

    /// The critical property that makes a ONE-SHOT static render safe: `StoryRenderer`'s
    /// generic `imageCache` populates layer `contents` via an async `Task` (fine for a
    /// long-lived live canvas), which would race a single `layer.render(in:)` call right
    /// after `render()` returns. `ComposerImageCacheReader` is special-cased by
    /// `StoryBackgroundLayer`/`StoryMediaLayer` for a SYNCHRONOUS prime — this test proves
    /// `StoryStaticSnapshot` actually gets that synchronous path (background image present
    /// on the very first render, not a race-dependent blank frame).
    func test_render_backgroundImageIsBakedSynchronously_noAsyncRace() throws {
        let bgMedia = StoryMediaObject(id: "bg1", mediaType: "image", aspectRatio: 1.0, isBackground: true)
        let effects = StoryEffects(background: "0000FF", mediaObjects: [bgMedia]) // blue bg colour
        let slide = StorySlide(effects: effects)

        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(
            slide: slide, loadedImages: ["bg1": solidImage(.red)], size: CGSize(width: 100, height: 178)))

        let corner = try XCTUnwrap(pixel(snapshot, at: CGPoint(x: 3, y: 3)))
        XCTAssertGreaterThan(corner.r, 150, "background image must be baked synchronously into the snapshot")
        XCTAssertLessThan(corner.b, 110, "corner must not be the blue background colour placeholder")
    }
}

// MARK: - Le premier plan seul, sur fond transparent (#12591)

@MainActor
final class StoryStaticSnapshotForegroundTests: XCTestCase {

    private func slide(text: String = "Bonjour", x: Double = 0.5, y: Double = 0.5, rotation: Double = 0,
                       background: String = "FF0000") -> StorySlide {
        let objet = StoryTextObject(text: text, x: x, y: y, rotation: rotation)
        return StorySlide(effects: StoryEffects(background: background, textObjects: [objet]))
    }

    private struct Alpha {
        let width: Int
        let height: Int
        let octets: [UInt8]

        init(_ image: CGImage) {
            width = image.width
            height = image.height
            var data = [UInt8](repeating: 0, count: width * height * 4)
            let contexte = CGContext(data: &data, width: width, height: height, bitsPerComponent: 8,
                                     bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                     bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            contexte.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            octets = data
        }

        func alpha(_ x: Int, _ y: Int) -> UInt8 { octets[(y * width + x) * 4 + 3] }

        /// Le rectangle englobant des pixels non transparents, en fractions de la taille.
        var inked: CGRect? {
            var (minX, minY, maxX, maxY) = (width, height, -1, -1)
            for y in 0 ..< height {
                for x in 0 ..< width where alpha(x, y) > 8 {
                    minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
                }
            }
            guard maxX >= 0 else { return nil }
            return CGRect(x: CGFloat(minX) / CGFloat(width), y: CGFloat(minY) / CGFloat(height),
                          width: CGFloat(maxX - minX + 1) / CGFloat(width), height: CGFloat(maxY - minY + 1) / CGFloat(height))
        }
    }

    func test_foreground_isTransparentOutsideTheText_andHasTheRequestedSize() throws {
        let image = try XCTUnwrap(StoryStaticSnapshot.foreground(slide: slide(), size: CGSize(width: 360, height: 640)))
        XCTAssertEqual(image.width, 360)
        XCTAssertEqual(image.height, 640)
        let alpha = Alpha(image)
        XCTAssertEqual(alpha.alpha(2, 2), 0, "aucun fond : même rouge, la slide ne peint rien")
        XCTAssertEqual(alpha.alpha(357, 637), 0)
        XCTAssertNotNil(alpha.inked, "le texte, lui, est peint")
    }

    func test_foreground_centresTheTextWhereTheSlidePutsIt() throws {
        let image = try XCTUnwrap(StoryStaticSnapshot.foreground(slide: slide(x: 0.3, y: 0.7), size: CGSize(width: 360, height: 640)))
        let boite = try XCTUnwrap(Alpha(image).inked)
        XCTAssertEqual(boite.midX, 0.3, accuracy: 0.01)
        XCTAssertEqual(boite.midY, 0.7, accuracy: 0.01)
    }

    func test_foreground_keepsTheSameRelativeSize_atAnyDefinition() throws {
        let petite = try XCTUnwrap(Alpha(try XCTUnwrap(StoryStaticSnapshot.foreground(slide: slide(), size: CGSize(width: 360, height: 640)))).inked)
        let grande = try XCTUnwrap(Alpha(try XCTUnwrap(StoryStaticSnapshot.foreground(slide: slide(), size: CGSize(width: 1080, height: 1920)))).inked)
        XCTAssertEqual(petite.width, grande.width, accuracy: 0.02, "la cuisson à définition native écrit le texte qu'on voyait")
        XCTAssertEqual(petite.height, grande.height, accuracy: 0.02)
    }

    func test_foreground_respectsTheRotation() throws {
        let image = try XCTUnwrap(StoryStaticSnapshot.foreground(
            slide: slide(text: "MMMMMMMM", rotation: 90), size: CGSize(width: 360, height: 360)))
        let boite = try XCTUnwrap(Alpha(image).inked)
        XCTAssertGreaterThan(boite.height, boite.width, "un texte tourné d'un quart de tour se lit à la verticale")
    }

    func test_foreground_servesAnyAspect() throws {
        let image = try XCTUnwrap(StoryStaticSnapshot.foreground(slide: slide(), size: CGSize(width: 400, height: 400)))
        XCTAssertEqual(Alpha(image).inked.map { $0.midY }.map { Double($0) } ?? 0, 0.5, accuracy: 0.02)
    }

    func test_foreground_withAnEmptySize_isNil() {
        XCTAssertNil(StoryStaticSnapshot.foreground(slide: slide(), size: .zero))
    }

    // MARK: - Les vitres du fond Verre (#12602)

    private func vitree(_ fond: StoryTextBackgroundStyle? = .glass(radius: 24), x: Double = 0.5, y: Double = 0.5) -> StorySlide {
        let objet = StoryTextObject(text: "Bonjour", x: x, y: y, backgroundStyle: fond)
        return StorySlide(effects: StoryEffects(background: "FF0000", textObjects: [objet]))
    }

    func test_glassPanes_oneGlassText_givesOnePaneWhereItsBoxIs() throws {
        let taille = CGSize(width: 360, height: 640)
        let vitres = StoryStaticSnapshot.glassPanes(slide: vitree(x: 0.3, y: 0.6), size: taille)
        let vitre = try XCTUnwrap(vitres.first)
        XCTAssertEqual(vitres.count, 1)
        XCTAssertEqual(vitre.mask.width, 360)
        XCTAssertEqual(vitre.mask.height, 640)
        let masque = Alpha(vitre.mask)
        XCTAssertEqual(masque.alpha(Int(0.3 * 360), Int(0.6 * 640)), 255, "le milieu de la boîte est vitré, opaque")
        XCTAssertEqual(masque.alpha(2, 2), 0, "hors de la boîte, rien")
        XCTAssertEqual(vitre.bounds.midX / 360, 0.3, accuracy: 0.01)
        XCTAssertEqual(vitre.bounds.midY / 640, 0.6, accuracy: 0.01, "origine en haut à gauche, comme la slide")
    }

    func test_glassPanes_maskIsTheBoxTheForegroundTints_withoutTheGlyphs() throws {
        let taille = CGSize(width: 360, height: 640)
        let vitre = try XCTUnwrap(StoryStaticSnapshot.glassPanes(slide: vitree(), size: taille).first)
        let teinte = try XCTUnwrap(Alpha(try XCTUnwrap(StoryStaticSnapshot.foreground(slide: vitree(), size: taille))).inked)
        let decoupe = try XCTUnwrap(Alpha(vitre.mask).inked)
        XCTAssertEqual(decoupe.minX, teinte.minX, accuracy: 0.01, "la vitre épouse la teinte du verre")
        XCTAssertEqual(decoupe.maxX, teinte.maxX, accuracy: 0.01)
        XCTAssertEqual(decoupe.minY, teinte.minY, accuracy: 0.01)
        XCTAssertEqual(decoupe.maxY, teinte.maxY, accuracy: 0.01)
    }

    func test_glassPanes_sigmaIsTheGlassRadiusAtThisDefinition() throws {
        let taille = CGSize(width: 540, height: 960)
        let vitre = try XCTUnwrap(StoryStaticSnapshot.glassPanes(slide: vitree(.glass(radius: 30)), size: taille).first)
        XCTAssertEqual(vitre.sigma, CanvasGeometry(renderSize: taille).render(CGFloat(30)), accuracy: 0.001)
    }

    func test_glassPanes_withoutGlass_isEmpty() {
        let taille = CGSize(width: 360, height: 640)
        XCTAssertTrue(StoryStaticSnapshot.glassPanes(slide: vitree(nil), size: taille).isEmpty)
        XCTAssertTrue(StoryStaticSnapshot.glassPanes(slide: vitree(.solid(hex: "000000")), size: taille).isEmpty)
        XCTAssertTrue(StoryStaticSnapshot.glassPanes(slide: vitree(), size: .zero).isEmpty)
    }

    func test_glassPanes_oneGlassAmongTwoTexts_givesOnlyItsPane() throws {
        let verre = StoryTextObject(text: "Verre", x: 0.5, y: 0.3, backgroundStyle: .glass(radius: 24))
        let nu = StoryTextObject(text: "Nu", x: 0.5, y: 0.8)
        let slide = StorySlide(effects: StoryEffects(textObjects: [verre, nu]))
        let vitres = StoryStaticSnapshot.glassPanes(slide: slide, size: CGSize(width: 360, height: 640))
        XCTAssertEqual(vitres.count, 1)
        let masque = Alpha(try XCTUnwrap(vitres.first).mask)
        XCTAssertEqual(masque.alpha(180, Int(0.8 * 640)), 0, "le texte sans verre ne floute rien")
    }
}
