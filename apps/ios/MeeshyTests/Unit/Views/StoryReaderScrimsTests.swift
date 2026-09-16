import XCTest
import SwiftUI
@testable import Meeshy

/// **#6701 — en lecture immersive, une story se montre sans voile.**
///
/// Les deux dégradés de lisibilité n'existent que pour détacher les contrôles du
/// contenu. Montés sans condition, ils restaient posés sur l'image quand l'appui
/// long effaçait le chrome : la lecture immersive montrait une image plus sombre
/// que celle qui a été publiée (captures 85 et 87).
///
/// Le témoin lit ce que l'œil voit — un pixel rendu sur une image blanche — et
/// non une valeur calculée : une règle juste que la couche n'appliquerait pas
/// resterait verte sinon.
@MainActor
final class StoryReaderScrimsTests: XCTestCase {

    private static let renderSize = (width: 60, height: 600)

    /// Luminance `[0, 1]` du pixel central de la ligne `row` (depuis le haut),
    /// voiles rendus sur un fond blanc.
    private func luminance(chromeVisible: Bool, row: Int) throws -> CGFloat {
        let size = Self.renderSize
        let content = ZStack {
            Color.white
            StoryReaderScrims(topInset: 59, chromeVisible: chromeVisible)
        }
        .frame(width: CGFloat(size.width), height: CGFloat(size.height))
        let renderer = ImageRenderer(content: content)
        renderer.scale = 1
        let image = try XCTUnwrap(renderer.cgImage, "les voiles se rendent en image")

        var pixel = [UInt8](repeating: 0, count: 4)
        let drawn = pixel.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: 1, height: 1,
                                          bitsPerComponent: 8, bytesPerRow: 4,
                                          space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            let origin = CGPoint(x: -CGFloat(image.width / 2),
                                 y: -CGFloat(image.height - 1 - row))
            context.draw(image, in: CGRect(origin: origin,
                                           size: CGSize(width: image.width, height: image.height)))
            return true
        }
        XCTAssertTrue(drawn, "le pixel se lit")
        return CGFloat(Int(pixel[0]) + Int(pixel[1]) + Int(pixel[2])) / (3 * 255)
    }

    private var topRow: Int { 2 }
    private var bottomRow: Int { Self.renderSize.height - 3 }

    // MARK: - La règle, lue au pixel

    func test_chromeHidden_theStoryShowsWithoutVeil() throws {
        XCTAssertGreaterThan(try luminance(chromeVisible: false, row: topRow), 0.95,
                             "Chrome effacé : le haut de l'image se lit tel qu'il a été publié")
        XCTAssertGreaterThan(try luminance(chromeVisible: false, row: bottomRow), 0.95,
                             "Chrome effacé : le bas de l'image se lit tel qu'il a été publié")
    }

    func test_chromeVisible_theVeilsStillDetachTheControls() throws {
        XCTAssertLessThan(try luminance(chromeVisible: true, row: topRow), 0.5,
                          "Chrome présent : le voile du haut détache la progression et l'auteur")
        XCTAssertLessThan(try luminance(chromeVisible: true, row: bottomRow), 0.5,
                          "Chrome présent : le voile du bas détache le rail et le composer")
    }

    // MARK: - Le montage

    /// Le lecteur monte LES voiles sur SON chrome : une règle juste qu'on
    /// alimenterait d'une constante laisserait l'immersif assombri.
    func test_theReaderMountsTheVeilsOnItsChrome() throws {
        let source = AppSourceGuard.stripComments(try String(contentsOf: canvasSource, encoding: .utf8))
        XCTAssertEqual(source.components(separatedBy: "StoryReaderScrims(topInset: topInset, chromeVisible: chromeVisible)").count - 1,
                       1, "un seul montage, alimenté par la visibilité du chrome")
        XCTAssertFalse(source.contains(".black.opacity(0.92)"),
                       "aucun voile inconditionnel ne reste dans l'hôte")
    }

    private var canvasSource: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
    }
}
