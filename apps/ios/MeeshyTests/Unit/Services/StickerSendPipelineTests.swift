import XCTest
import UIKit
@testable import Meeshy
@testable import MeeshySDK

/// #4947 — **la bulle d'un sticker paraît AVANT que ses octets existent**
/// (D-SEND-01).
///
/// L'envoi encodait le PNG et l'écrivait sur le disque sur le fil principal,
/// puis posait la bulle optimiste : le tap et le premier pixel étaient séparés
/// par un `pngData()` et une écriture. Ces témoins épinglent les deux moitiés
/// du correctif — les fonctions PURES du pipeline (encoder, écrire, échouer) et
/// l'ORDRE du chemin d'envoi, qui n'est pas exerçable sans une conversation
/// vivante et se garde donc à la source, comme `PermissionGateSourceGuardTests`.
@MainActor
final class StickerSendPipelineTests: XCTestCase {

    // MARK: - Fixtures

    private static func makeStickerImage(side: CGFloat = 32) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = 2
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { ctx in
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    private func makeTemporaryDirectory() throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("sticker-pipeline-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    // MARK: - Le nom et l'URL, connus AVANT l'écriture

    /// La bulle optimiste porte l'URL locale comme `fileUrl` et le cache
    /// d'aperçu est amorcé sous la même clé : les deux doivent être connus
    /// alors que le fichier n'existe pas encore.
    func test_fileURL_isKnownBeforeTheFileExists() throws {
        let dir = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: dir) }

        let url = StickerSendPipeline.fileURL(id: "abc123", in: dir)

        XCTAssertEqual(url.lastPathComponent, "sticker_abc123.png")
        XCTAssertEqual(StickerSendPipeline.fileName(for: "abc123"), "sticker_abc123.png")
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    // MARK: - Encoder

    func test_encode_rendersRealPNGBytes() throws {
        let data = try XCTUnwrap(StickerSendPipeline.encode(Self.makeStickerImage()))

        XCTAssertGreaterThan(data.count, 0)
        XCTAssertEqual(Array(data.prefix(4)), [0x89, 0x50, 0x4E, 0x47],
                       "Les octets servis doivent être un PNG, pas un JPEG ni un fichier vide.")
        XCTAssertNotNil(UIImage(data: data), "Le PNG produit doit se décoder.")
    }

    /// Un sticker de 512 pt à 2× reste un PNG : ce que le témoin garde, c'est
    /// que l'encodage n'AMPUTE pas l'image — l'échelle du rendu voyage vers
    /// les autres appareils.
    func test_encode_preservesThePixelDimensions() throws {
        let image = Self.makeStickerImage(side: 64)
        let data = try XCTUnwrap(StickerSendPipeline.encode(image))
        let relu = try XCTUnwrap(UIImage(data: data))

        XCTAssertEqual(relu.size.width * relu.scale, image.size.width * image.scale, accuracy: 0.5)
        XCTAssertEqual(relu.size.height * relu.scale, image.size.height * image.scale, accuracy: 0.5)
    }

    // MARK: - Écrire

    func test_write_createsTheFile_atTheStickerURL() throws {
        let dir = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: dir) }
        let data = try XCTUnwrap(StickerSendPipeline.encode(Self.makeStickerImage()))

        let url = try StickerSendPipeline.write(data, id: "abc123", directory: dir)

        XCTAssertEqual(url, StickerSendPipeline.fileURL(id: "abc123", in: dir))
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        XCTAssertEqual(try Data(contentsOf: url), data)
    }

    /// L'erreur d'écriture doit REMONTER : c'est elle qui fait basculer la
    /// bulle optimiste en échec. L'avaler laisserait une bulle qui tourne pour
    /// un fichier qui n'existera jamais.
    func test_write_intoAMissingDirectory_propagatesTheError() throws {
        let absent = FileManager.default.temporaryDirectory
            .appendingPathComponent("sticker-absent-\(UUID().uuidString)", isDirectory: true)
        let data = try XCTUnwrap(StickerSendPipeline.encode(Self.makeStickerImage()))

        XCTAssertThrowsError(try StickerSendPipeline.write(data, id: "abc123", directory: absent))
        XCTAssertFalse(FileManager.default.fileExists(atPath: absent.path))
    }

    // MARK: - Encoder ET écrire, hors du fil principal

    func test_prepare_writesTheEncodedImage_andServesItsBytes() async throws {
        let dir = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: dir) }
        let image = Self.makeStickerImage()

        let écrit = try await StickerSendPipeline.prepare(image, id: "abc123", directory: dir)

        XCTAssertEqual(écrit.url, StickerSendPipeline.fileURL(id: "abc123", in: dir))
        XCTAssertTrue(FileManager.default.fileExists(atPath: écrit.url.path))
        XCTAssertEqual(try Data(contentsOf: écrit.url), écrit.data,
                       "Les octets servis à l'upload sont CEUX du fichier — pas une seconde lecture.")
        XCTAssertNotNil(UIImage(data: écrit.data))
    }

    func test_prepare_intoAMissingDirectory_throws() async throws {
        let absent = FileManager.default.temporaryDirectory
            .appendingPathComponent("sticker-absent-\(UUID().uuidString)", isDirectory: true)

        do {
            _ = try await StickerSendPipeline.prepare(Self.makeStickerImage(), id: "abc123", directory: absent)
            XCTFail("Une écriture impossible doit remonter, jamais rendre une URL fantôme.")
        } catch {
            XCTAssertFalse(FileManager.default.fileExists(atPath: absent.path))
        }
    }

    // MARK: - L'ORDRE du chemin d'envoi (garde de source)

    private func stickerSendSource() throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Services
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
        return try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+Sticker.swift"),
            encoding: .utf8)
    }

    /// **La bulle est posée AVANT tout encodage.** C'est le défaut lui-même :
    /// l'ordre inverse rendait le tap muet pendant l'encodage et l'écriture.
    func test_sendStickerImage_postsTheOptimisticBubble_beforeEncoding() throws {
        let src = try stickerSendSource()

        guard let bulle = src.range(of: "insertOptimisticMediaMessage(")?.lowerBound,
              let préparation = src.range(of: "StickerSendPipeline.prepare(")?.lowerBound else {
            return XCTFail("Impossible de localiser la pose de la bulle et la préparation du PNG.")
        }
        XCTAssertLessThan(bulle, préparation,
                          "La bulle optimiste doit précéder l'encodage — sinon le tap attend le PNG.")
    }

    /// Et l'encodage n'est plus fait sur place : `sendStickerImage` ne connaît
    /// plus `pngData()`, il délègue au pipeline qui, lui, se détache.
    func test_sendStickerImage_noLongerEncodesOnTheMainActor() throws {
        let src = try stickerSendSource()

        XCTAssertFalse(src.contains("pngData()"),
                       "L'encodage PNG appartient à StickerSendPipeline, hors du fil principal.")
        XCTAssertFalse(src.contains("data.write(to:"),
                       "L'écriture disque appartient à StickerSendPipeline, hors du fil principal.")
    }

    /// **Le cache d'aperçu est amorcé AVANT la bulle.** C'est ce qui la fait
    /// peindre l'image DÉJÀ rasterisée sans relire le disque ni le réseau :
    /// l'amorcer après laisserait la bulle vide le temps d'un aller-retour de
    /// cache, ce que la règle Cache-First interdit.
    func test_sendStickerImage_primesThePreviewCache_beforePostingTheBubble() throws {
        let src = try stickerSendSource()

        guard let amorce = src.range(of: "DiskCacheStore.cacheImageForPreview(")?.lowerBound,
              let bulle = src.range(of: "insertOptimisticMediaMessage(")?.lowerBound else {
            return XCTFail("Impossible de localiser l'amorçage du cache et la pose de la bulle.")
        }
        XCTAssertLessThan(amorce, bulle,
                          "Le cache mémoire doit être chaud quand la bulle paraît — sinon elle peint du vide.")
    }

    /// Une écriture qui échoue doit RETOURNER la bulle : sans ce repli, le
    /// sticker resterait un spinner permanent pour un fichier absent.
    func test_sendStickerImage_rollsBackTheBubble_whenTheWriteFails() throws {
        let src = try stickerSendSource()

        XCTAssertTrue(src.contains("markOptimisticMediaFailed("),
                      "Un échec d'encodage ou d'écriture doit basculer la bulle en échec.")
    }
}
