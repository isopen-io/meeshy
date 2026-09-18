import XCTest
import UIKit
@testable import MeeshyUI

/// **Le décodage d'une image de story quitte le fil principal** (#7010).
///
/// `StoryBackgroundLayer.loadImage` lisait le fichier et construisait l'image
/// sur le MainActor — à chaque transition de slide, pour un fond qui occupe
/// tout l'écran. La fonction était pourtant DÉJÀ `async` : ses appelants
/// l'attendaient, et rien n'exigeait que le travail se fasse là.
@MainActor
final class StoryLayerImageDecodingTests: XCTestCase {

    private func makePNG(width: Int, height: Int) throws -> Data {
        let size = CGSize(width: width, height: height)
        // `scale = 1` : le rendu suit sinon l'échelle de l'écran, et un PNG de
        // 900×1600 points en sortirait à 2 700×4 800 pixels — le témoin
        // mesurerait alors le simulateur, pas le décodeur.
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
        return try XCTUnwrap(image.pngData())
    }

    private func writeTemporary(_ data: Data) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("story-decode-\(UUID().uuidString).png")
        try data.write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func test_decodedImage_fromFile_returnsThePixelsItWasGiven() async throws {
        let url = try writeTemporary(try makePNG(width: 12, height: 20))

        let image = await StoryLayerImageDecoding.decodedImage(fileAt: url)

        let decoded = try XCTUnwrap(image, "un fichier PNG lisible doit rendre une image")
        XCTAssertEqual(decoded.cgImage?.width, 12)
        XCTAssertEqual(decoded.cgImage?.height, 20)
    }

    /// **Aucun sous-échantillonnage.** Ces layers servent la scène affichée ET
    /// le rendu hors écran : un plafond en pixels d'écran dégraderait en
    /// silence ce qui est composé pour être exporté. Le gain visé est le FIL,
    /// pas la mémoire — les pixels rendus doivent rester ceux d'avant.
    func test_decodedImage_doesNotResampleALargeImage() async throws {
        let url = try writeTemporary(try makePNG(width: 900, height: 1600))

        // L'`await` est HORS de `XCTUnwrap` : son argument est un
        // `@autoclosure` qui ne porte pas la concurrence.
        let image = await StoryLayerImageDecoding.decodedImage(fileAt: url)
        let decoded = try XCTUnwrap(image)

        XCTAssertEqual(decoded.cgImage?.width, 900)
        XCTAssertEqual(decoded.cgImage?.height, 1600)
    }

    func test_decodedImage_fromBytes_matchesTheFilePath() async throws {
        let data = try makePNG(width: 8, height: 8)

        let image = await StoryLayerImageDecoding.decodedImage(from: data)
        let decoded = try XCTUnwrap(image)

        XCTAssertEqual(decoded.cgImage?.width, 8)
    }

    func test_decodedImage_missingFile_returnsNil() async {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("absent-\(UUID().uuidString).png")

        let decoded = await StoryLayerImageDecoding.decodedImage(fileAt: url)

        XCTAssertNil(decoded, "un fichier absent DÉGRADE en `nil` — l'appelant a son propre repli d'URL")
    }

    func test_decodedImage_undecodableBytes_returnNil() async {
        let decoded = await StoryLayerImageDecoding.decodedImage(from: Data("pas une image".utf8))

        XCTAssertNil(decoded)
    }

    /// Garde de SOURCE : la fonction est `async` depuis toujours, donc rien
    /// n'empêche un correctif futur de reposer un `UIImage(data:)` dans son
    /// corps MainActor. C'est exactement ce qui y vivait.
    func test_backgroundLayer_buildsNoImageOnTheMainActor() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(
            source.contains("return UIImage(data: data)"),
            "`StoryBackgroundLayer` ne doit plus construire l'image sur le MainActor : lecture et décodage passent par `StoryLayerImageDecoding` (#7010)."
        )
        XCTAssertTrue(
            source.contains("StoryLayerImageDecoding.decodedImage(fileAt:"),
            "Le chemin `file://` doit descendre dans `StoryLayerImageDecoding` (#7010)."
        )
    }
}
