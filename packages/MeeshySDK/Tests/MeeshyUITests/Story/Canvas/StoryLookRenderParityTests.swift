import XCTest
import CoreImage
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le look d'un fond se cuit en UN passage, dans le contexte partagé,
/// redressé par Core Image et sans perdre le Display P3** (#9873).
///
/// Le chemin du curseur cuisait deux bitmaps (filtre, puis réglages), chacun
/// par son propre `CIContext` sRGB, gardait l'orientation EXIF dans
/// l'enveloppe et laissait `CanvasImageOrientation` redessiner toute photo non
/// `.up` à chaque cran. La chaîne est désormais une fonction `CIImage → CIImage`
/// (`StoryBackgroundLook.ciImage`) que l'aperçu et l'export rendent par le même
/// `StoryRenderingContext.shared` (loi 6 : le player est l'aperçu).
///
/// `@MainActor` : `CanvasImageOrientation` et `StorySlideRenderer` vivent dans
/// MeeshyUI, isolé MainActor par défaut (SE-0466) — la cible de test, elle,
/// reste `nonisolated`.
@MainActor
final class StoryLookRenderParityTests: XCTestCase {

    // MARK: - Fabriques

    private func photo(space: CGColorSpace, width: Int = 8, height: Int = 4,
                       orientation: UIImage.Orientation = .up,
                       paint: (CGContext) -> Void) throws -> UIImage {
        let contexte = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                               bytesPerRow: 0, space: space,
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        paint(contexte)
        return UIImage(cgImage: try XCTUnwrap(contexte.makeImage()), scale: 1, orientation: orientation)
    }

    private func uniform(space: CGColorSpace, _ composantes: [CGFloat]) throws -> UIImage {
        let couleur = try XCTUnwrap(CGColor(colorSpace: space, components: composantes))
        return try photo(space: space) { contexte in
            contexte.setFillColor(couleur)
            contexte.fill(CGRect(x: 0, y: 0, width: 8, height: 4))
        }
    }

    /// Moitié gauche noire, moitié droite blanche : une rotation se lit dans
    /// la position du blanc.
    private func halves(orientation: UIImage.Orientation) throws -> UIImage {
        let srgb = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        return try photo(space: srgb, orientation: orientation) { contexte in
            contexte.setFillColor(CGColor(gray: 0, alpha: 1))
            contexte.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
            contexte.setFillColor(CGColor(gray: 1, alpha: 1))
            contexte.fill(CGRect(x: 4, y: 0, width: 4, height: 4))
        }
    }

    /// Les pixels RGBA 8 bits d'un bitmap, dessiné dans un contexte sRGB.
    private func pixels(_ image: CGImage?) throws -> [UInt8] {
        let cg = try XCTUnwrap(image)
        var octets = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let srgb = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let contexte = try XCTUnwrap(CGContext(data: &octets, width: cg.width, height: cg.height,
                                               bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: srgb,
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        return octets
    }

    private func luminances(_ octets: [UInt8]) -> [Int] {
        stride(from: 0, to: octets.count, by: 4).map { (Int(octets[$0]) + Int(octets[$0 + 1]) + Int(octets[$0 + 2])) / 3 }
    }

    private func key(_ suffix: String) -> String { "parity-\(suffix)-\(UUID().uuidString)" }

    // MARK: - L'espace de couleur

    func test_aDisplayP3Photo_keepsDisplayP3_throughTheLook() throws {
        let p3 = try XCTUnwrap(CGColorSpace(name: CGColorSpace.displayP3))
        let image = try uniform(space: p3, [0.9, 0.2, 0.1, 1])
        let peinte = StoryBackgroundLook.image(image, filter: .warm, intensity: 1,
                                               adjustments: ImageAdjustments(contrast: 1.2), imageId: key("p3"))
        XCTAssertFalse(peinte === image)
        XCTAssertEqual(peinte.cgImage?.colorSpace?.name as String?, CGColorSpace.displayP3 as String,
                       "une photo Display P3 ne se rabat pas en sRGB parce qu'on l'a filtrée")
    }

    func test_anSRGBPhoto_staysSRGB_throughTheLook() throws {
        let srgb = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let image = try uniform(space: srgb, [0.4, 0.5, 0.6, 1])
        let peinte = StoryBackgroundLook.image(image, filter: .vivid, intensity: 1, adjustments: nil, imageId: key("srgb"))
        XCTAssertEqual(peinte.cgImage?.colorSpace?.name as String?, CGColorSpace.sRGB as String)
    }

    func test_theSharedContext_choosesP3OnlyForAWideGamutSource() throws {
        let contexte = StoryRenderingContext.shared
        let p3 = try XCTUnwrap(CGColorSpace(name: CGColorSpace.displayP3))
        let srgb = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        XCTAssertEqual(contexte.outputColorSpace(preserving: p3).name as String?, CGColorSpace.displayP3 as String)
        XCTAssertEqual(contexte.outputColorSpace(preserving: srgb).name as String?, CGColorSpace.sRGB as String)
        XCTAssertEqual(contexte.outputColorSpace(preserving: nil).name as String?, CGColorSpace.sRGB as String)
    }

    // MARK: - L'orientation, cuite par Core Image

    func test_anOrientedPhoto_isBakedUpright_likeUIKitShowsIt() throws {
        let image = try halves(orientation: .right)
        let peinte = StoryBackgroundLook.image(image, filter: .bw, intensity: 1, adjustments: nil, imageId: key("orient"))
        XCTAssertEqual(peinte.imageOrientation, .up, "le bitmap cuit est droit : plus aucun redessin UIKit au cran suivant")
        XCTAssertEqual(peinte.cgImage?.width, 4)
        XCTAssertEqual(peinte.cgImage?.height, 8)
        XCTAssertEqual(peinte.size, image.size, "la taille affichée ne bouge pas")

        let reference = luminances(try pixels(CanvasImageOrientation.displayCGImage(image)))
        let cuite = luminances(try pixels(peinte.cgImage))
        XCTAssertEqual(reference.count, cuite.count)
        zip(reference, cuite).enumerated().forEach { index, paire in
            XCTAssertEqual(Double(paire.0), Double(paire.1), accuracy: 40,
                           "pixel \(index) : le noir et le blanc sont là où UIKit les montre")
        }
    }

    func test_theSourceOfTheChain_isOrientedByCoreImage() throws {
        let image = try halves(orientation: .left)
        let source = try XCTUnwrap(StoryRenderingContext.orientedSource(of: image))
        XCTAssertEqual(source.extent.size, CGSize(width: 4, height: 8))
    }

    // MARK: - Loi 6 : l'aperçu et l'export rendent la même chaîne

    func test_theBakedLook_isExactlyTheRenderOfItsCIImageChain() throws {
        let srgb = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let image = try photo(space: srgb) { contexte in
            contexte.setFillColor(CGColor(red: 0.8, green: 0.3, blue: 0.2, alpha: 1))
            contexte.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
            contexte.setFillColor(CGColor(red: 0.1, green: 0.4, blue: 0.9, alpha: 1))
            contexte.fill(CGRect(x: 4, y: 0, width: 4, height: 4))
        }
        let reglages = ImageAdjustments(exposure: 0.5, saturation: 0.3)
        let cuite = StoryBackgroundLook.image(image, filter: .vintage, intensity: 0.6,
                                              adjustments: reglages, imageId: key("loi6"))

        let source = try XCTUnwrap(StoryRenderingContext.orientedSource(of: image))
        let chaine = StoryBackgroundLook.ciImage(source, filter: .vintage, intensity: 0.6, adjustments: reglages)
        let rendue = StoryRenderingContext.shared.bitmap(chaine, from: source.extent,
                                                         preserving: image.cgImage?.colorSpace)
        XCTAssertEqual(try pixels(cuite.cgImage), try pixels(rendue),
                       "le bitmap du fond est le rendu de LA chaîne : une seule fonction pour l'aperçu et l'export")
    }

    func test_theExportBackground_isTheCanvasBackground() throws {
        let srgb = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let image = try uniform(space: srgb, [0.3, 0.6, 0.2, 1])
        var effets = StoryEffects()
        effets.filter = StoryFilter.chrome.rawValue
        effets.filterIntensity = 0.5
        let export = StorySlideRenderer.filterBackground(image, effects: effets)
        let canvas = StoryBackgroundLook.image(image, filter: .chrome, intensity: 0.5, adjustments: nil, imageId: key("export"))
        XCTAssertEqual(try pixels(export.cgImage), try pixels(canvas.cgImage))
    }
}
