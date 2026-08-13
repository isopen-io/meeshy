import CoreGraphics
import UIKit
import XCTest
@testable import MeeshyUI

/// Demande user 2026-08-12 : un média enregistré depuis Meeshy porte sa marque
/// — pour les IMAGES, le logo + le pseudo de l'auteur, SANS animation.
@MainActor
final class MeeshyImageWatermarkTests: XCTestCase {

    // MARK: - Fabriques

    private func makeImage(size: CGSize = CGSize(width: 800, height: 600),
                           color: UIColor = .black) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            color.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
    }

    /// Échantillonne le pixel (x, y) en repère UIKit (origine HAUT-gauche) —
    /// le même que `blockRect` : le rendu CGImage étant bas-vers-haut, la
    /// ligne `y` depuis le haut est la ligne `height - 1 - y` depuis le bas.
    private func pixel(_ image: UIImage, x: Int, y: Int) throws -> (r: UInt8, g: UInt8, b: UInt8) {
        let cg = try XCTUnwrap(image.cgImage)
        var bytes = [UInt8](repeating: 0, count: 4)
        let context = try XCTUnwrap(CGContext(
            data: &bytes, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(cg, in: CGRect(x: -CGFloat(x), y: CGFloat(y) + 1 - CGFloat(cg.height),
                                    width: CGFloat(cg.width), height: CGFloat(cg.height)))
        return (bytes[0], bytes[1], bytes[2])
    }

    // MARK: - Instant figé

    func test_stillTime_isARestingFrameOfTheAnimatedWatermark() {
        let t = MeeshyImageWatermark.stillTime

        XCTAssertTrue(StoryExportWatermark.isBottomRight(at: t),
                      "L'image porte la marque en bas à droite, comme le premier segment de l'export")
        XCTAssertEqual(StoryExportWatermark.logoTraceProgress(elapsed: t, barIndex: 2), 1.0,
                       accuracy: 0.001,
                       "Le logo doit être INTÉGRALEMENT tracé : une image ne joue pas l'animation")
        XCTAssertLessThan(t, StoryExportWatermark.segmentDuration,
                          "Rester dans le premier segment garantit le coin bas-droite")
    }

    // MARK: - Rendu

    func test_stamped_preservesPixelDimensions() throws {
        let source = makeImage(size: CGSize(width: 640, height: 480))

        let stamped = try XCTUnwrap(MeeshyImageWatermark.stamped(source, username: "alice"))

        XCTAssertEqual(MeeshyImageWatermark.pixelSize(of: stamped),
                       CGSize(width: 640, height: 480),
                       "La marque ne redimensionne pas l'image enregistrée")
    }

    func test_stamped_paintsTheBottomRightCorner_andLeavesTheRestUntouched() throws {
        let size = CGSize(width: 800, height: 600)
        let source = makeImage(size: size, color: .black)

        let stamped = try XCTUnwrap(MeeshyImageWatermark.stamped(source, username: "alice"))
        let watermark = try XCTUnwrap(MeeshyExportWatermark.make(username: "alice"))
        let block = watermark.blockRect(renderSize: size, at: MeeshyImageWatermark.stillTime)

        // Le tout premier dash du logo passe au tiers supérieur du bloc.
        let inside = try pixel(stamped,
                               x: Int(block.minX + block.height * 0.2),
                               y: Int(block.minY + block.height * 0.35))
        XCTAssertGreaterThan(Int(inside.r) + Int(inside.g) + Int(inside.b), 30,
                             "Le bloc du filigrane doit être peint sur le fond noir")

        let untouched = try pixel(stamped, x: 20, y: 20)
        XCTAssertEqual(Int(untouched.r) + Int(untouched.g) + Int(untouched.b), 0,
                       "Hors du bloc, l'image reste EXACTEMENT celle de l'auteur")
    }

    func test_stamped_withoutUsername_stillProducesAnImage() throws {
        let source = makeImage()

        XCTAssertNotNil(MeeshyImageWatermark.stamped(source, username: nil),
                        "Un utilisateur sans pseudo obtient la marque Meeshy seule, pas un échec")
    }

    func test_stamped_tinyImage_doesNotCrash() throws {
        let source = makeImage(size: CGSize(width: 8, height: 8))

        XCTAssertNotNil(MeeshyImageWatermark.stamped(source, username: "alice"))
    }

    // MARK: - Formats

    func test_supports_rejectsAnimatedFormats() {
        XCTAssertFalse(MeeshyImageWatermark.supports(pathExtension: "gif"),
                       "Marquer un GIF l'aplatirait en image fixe — on l'enregistre nu")
        XCTAssertFalse(MeeshyImageWatermark.supports(pathExtension: "GIF"),
                       "L'extension est comparée sans tenir compte de la casse")
        XCTAssertTrue(MeeshyImageWatermark.supports(pathExtension: "jpg"))
        XCTAssertTrue(MeeshyImageWatermark.supports(pathExtension: "heic"))
    }

    func test_encoding_keepsPNGLossless_andSendsEverythingElseToJPEG() {
        XCTAssertEqual(MeeshyImageWatermark.encoding(forPathExtension: "png"), .png)
        XCTAssertEqual(MeeshyImageWatermark.encoding(forPathExtension: "PNG"), .png)
        XCTAssertEqual(MeeshyImageWatermark.encoding(forPathExtension: "heic"), .jpeg(quality: 0.95))
        XCTAssertEqual(MeeshyImageWatermark.encoding(forPathExtension: "").pathExtension, "jpg")
    }

    // MARK: - Fichier

    func test_stampedCopy_writesANewFile_andNeverTouchesTheSource() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("watermark-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let source = directory.appendingPathComponent("photo.jpg")
        let sourceData = try XCTUnwrap(makeImage().jpegData(compressionQuality: 0.9))
        try sourceData.write(to: source)

        let stamped = try await MeeshyImageWatermark.stampedCopy(of: source, username: "alice")
        defer { try? FileManager.default.removeItem(at: stamped.deletingLastPathComponent()) }

        XCTAssertNotEqual(stamped, source)
        XCTAssertTrue(FileManager.default.fileExists(atPath: stamped.path))
        XCTAssertEqual(try Data(contentsOf: source), sourceData,
                       "La source est très souvent le fichier du CACHE : elle doit rester intacte")
    }

    func test_stampedCopy_heicSourceComesOutAsJPEG() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("watermark-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        // Contenu JPEG sous une extension HEIC : c'est l'EXTENSION qui pilote
        // le ré-encodage, et le nom du fichier produit doit la suivre.
        let source = directory.appendingPathComponent("photo.heic")
        try XCTUnwrap(makeImage().jpegData(compressionQuality: 0.9)).write(to: source)

        let stamped = try await MeeshyImageWatermark.stampedCopy(of: source, username: nil)
        defer { try? FileManager.default.removeItem(at: stamped.deletingLastPathComponent()) }

        XCTAssertEqual(stamped.pathExtension, "jpg",
                       "Un nom qui ment sur son format est refusé par les autres apps")
    }

    func test_stampedCopy_animatedFormat_throwsRatherThanFlattening() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("watermark-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let source = directory.appendingPathComponent("boucle.gif")
        try Data("not-a-real-gif".utf8).write(to: source)

        do {
            _ = try await MeeshyImageWatermark.stampedCopy(of: source, username: "alice")
            XCTFail("Un GIF ne doit pas être marqué")
        } catch let error as MeeshyImageWatermark.WatermarkError {
            XCTAssertEqual(error, .unsupportedFormat)
        }
    }
}
