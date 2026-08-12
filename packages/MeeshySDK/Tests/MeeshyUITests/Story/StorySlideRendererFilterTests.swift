import XCTest
import UIKit
import CoreImage
@testable import MeeshyUI
@testable import MeeshySDK

/// La miniature de tray et le placeholder ThumbHash
/// (`StorySlideRenderer.renderComposite`) doivent montrer EXACTEMENT ce que le
/// lecteur rend, sinon la vraie image remplace le placeholder par un saut de
/// couleur.
///
/// Le composite divergeait sur QUATRE points à la fois :
///   1. il passait par `StoryFilterKind`, qui ne connaît que vintage/bw — les
///      six autres filtres n'étaient pas appliqués du tout ;
///   2. même pour ces deux-là il employait d'autres noyaux que le lecteur
///      (`sepiaTone`/`photoEffectMono` vs `CIPhotoEffectTransfer`/`Noir`) ;
///   3. il filtrait un fond UNI, que le lecteur laisse intact ;
///   4. il teintait textes et stickers, que le lecteur ne filtre jamais.
///
/// La règle du lecteur, seule référence ici : le filtre est cuit dans le
/// BITMAP DU FOND IMAGE (`StoryBackgroundLayer.stampFinalImage`), et nulle
/// part ailleurs.
@MainActor
final class StorySlideRendererFilterTests: XCTestCase {

    private let canvas = CGSize(width: 120, height: 214)

    private func slide(filter: String?, intensity: Double = 1.0) -> StorySlide {
        var effects = StoryEffects()
        effects.background = "0040FF"   // bleu dominant : b ≫ r
        effects.filter = filter
        effects.filterIntensity = intensity
        return StorySlide(id: "s", effects: effects)
    }

    /// Fond image bleu saturé — la matière première que le lecteur filtre.
    private func blueBackground() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 64, height: 114)).image { ctx in
            UIColor(red: 0, green: 0.25, blue: 1, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 64, height: 114))
        }
    }

    /// Moyenne RGB (0…255) via CIAreaAverage.
    private func avg(_ image: UIImage) -> (r: CGFloat, g: CGFloat, b: CGFloat)? {
        guard let ci = CIImage(image: image) else { return nil }
        guard let filter = CIFilter(name: "CIAreaAverage", parameters: [
            kCIInputImageKey: ci, "inputExtent": CIVector(cgRect: ci.extent),
        ]), let output = filter.outputImage else { return nil }
        var bitmap = [UInt8](repeating: 0, count: 4)
        CIContext().render(output, toBitmap: &bitmap, rowBytes: 4,
                           bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                           format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return (CGFloat(bitmap[0]), CGFloat(bitmap[1]), CGFloat(bitmap[2]))
    }

    private func composite(filter: String?, withImageBackground: Bool = true) throws
        -> (r: CGFloat, g: CGFloat, b: CGFloat) {
        let image = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide(filter: filter),
            bgImage: withImageBackground ? blueBackground() : nil,
            size: canvas))
        return try XCTUnwrap(avg(image))
    }

    // MARK: - (1) Les SIX filtres autrefois ignorés agissent maintenant

    func test_everyKernellessFilter_nowChangesTheComposite() throws {
        let base = try composite(filter: nil)
        for filter in [StoryFilter.warm, .cool, .dramatic, .vivid, .fade, .chrome] {
            let filtered = try composite(filter: filter.rawValue)
            let delta = abs(filtered.r - base.r) + abs(filtered.g - base.g) + abs(filtered.b - base.b)
            XCTAssertGreaterThan(delta, 3,
                                 "« \(filter.rawValue) » est rendu par le lecteur : le composite doit le refléter (Δ=\(delta))")
        }
    }

    // MARK: - (2) Les deux filtres historiques gardent leur sens

    func test_bwFilter_desaturatesTheBackground() throws {
        let base = try composite(filter: nil)
        let bw = try composite(filter: StoryFilter.bw.rawValue)
        XCTAssertLessThan(abs(bw.r - bw.b), abs(base.r - base.b) - 40,
                          "bw doit rapprocher les canaux (r≈g≈b)")
    }

    func test_vintageFilter_shiftsTheBackgroundWarm() throws {
        let base = try composite(filter: nil)
        let vintage = try composite(filter: StoryFilter.vintage.rawValue)
        XCTAssertGreaterThan(vintage.r - vintage.b, base.r - base.b,
                             "vintage doit réchauffer (r monte par rapport à b)")
    }

    /// Le composite doit employer le MÊME noyau que le lecteur, pas un
    /// approximant : `StoryFilterProcessor` est la seule source des deux.
    func test_compositeUsesTheSameProcessorAsTheReader() throws {
        let source = blueBackground()
        let viaRenderer = StorySlideRenderer.filterBackground(
            source, effects: slide(filter: StoryFilter.vintage.rawValue).effects)
        let viaProcessor = StoryFilterProcessor.apply(.vintage, to: source, intensity: 1.0)

        let a = try XCTUnwrap(avg(viaRenderer))
        let b = try XCTUnwrap(avg(viaProcessor))
        XCTAssertEqual(a.r, b.r, accuracy: 1)
        XCTAssertEqual(a.g, b.g, accuracy: 1)
        XCTAssertEqual(a.b, b.b, accuracy: 1)
    }

    // MARK: - (3) Un fond UNI reste intact — le lecteur ne le filtre pas

    /// `StoryBackgroundLayer` pose un fond uni via `backgroundColor` : il ne
    /// passe jamais par l'étampage filtré. Le composite le teintait pourtant.
    func test_solidBackground_isNeverFiltered() throws {
        let base = try composite(filter: nil, withImageBackground: false)
        for filter in StoryFilter.allCases {
            let filtered = try composite(filter: filter.rawValue, withImageBackground: false)
            XCTAssertEqual(filtered.r, base.r, accuracy: 3,
                           "\(filter.rawValue) ne doit pas teindre un fond uni")
            XCTAssertEqual(filtered.b, base.b, accuracy: 3,
                           "\(filter.rawValue) ne doit pas teindre un fond uni")
        }
    }

    // MARK: - (4) Les textes ne sont jamais filtrés

    /// Le lecteur ne filtre que le fond ; un texte rouge posé dessus doit le
    /// rester, quel que soit le filtre.
    func test_textOverlayKeepsItsOwnColour() throws {
        var effects = StoryEffects()
        effects.background = "0040FF"
        effects.filter = StoryFilter.bw.rawValue
        effects.textObjects = [StoryTextObject(id: "t", text: "AAAAAA", x: 0.5, y: 0.5,
                                               fontSize: 40, textColor: "FF0000")]
        let image = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: StorySlide(id: "s", effects: effects),
            bgImage: blueBackground(), size: canvas))
        let cg = try XCTUnwrap(image.cgImage)

        let w = cg.width, h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = try XCTUnwrap(CGContext(data: &data, width: w, height: h, bitsPerComponent: 8,
                                          bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))

        // Au moins un pixel franchement ROUGE doit subsister : un passage noir
        // et blanc sur tout le composite l'aurait gris-ifié.
        var reddest = 0
        for i in stride(from: 0, to: data.count, by: 4) {
            reddest = max(reddest, Int(data[i]) - Int(data[i + 2]))
        }
        XCTAssertGreaterThan(reddest, 60,
                             "Le texte rouge doit survivre au filtre noir & blanc du fond (max r−b = \(reddest))")
    }

    // MARK: - Bornes

    func test_unknownFilterName_leavesTheBackgroundAlone() throws {
        let base = try composite(filter: nil)
        let bogus = try composite(filter: "n-existe-pas")
        XCTAssertEqual(bogus.r, base.r, accuracy: 2)
        XCTAssertEqual(bogus.b, base.b, accuracy: 2)
    }
}
