import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// Demande user 2026-08-12 : un média enregistré depuis Meeshy porte sa marque
/// — filigrane de story sur les vidéos, logo + pseudo (sans animation) sur les
/// images, signature sonore sur les audios. Ce fichier couvre la RÈGLE : quelles
/// familles sont marquées, et l'invariant « marquer ne casse jamais un
/// enregistrement ».
@MainActor
final class MediaSaveBrandingTests: XCTestCase {

    // MARK: - Familles marquées

    func test_stamps_coversTheThreeMediaFamilies() {
        XCTAssertTrue(MeeshyMediaSaveBranding.stamps(.image))
        XCTAssertTrue(MeeshyMediaSaveBranding.stamps(.video))
        XCTAssertTrue(MeeshyMediaSaveBranding.stamps(.audio))
    }

    func test_stamps_leavesDocumentsAndArchivesUntouched() {
        // Il n'existe pas de marque qui n'abîmerait pas un PDF ou un ZIP.
        for kind: AttachmentKind in [.pdf, .document, .spreadsheet, .presentation,
                                     .archive, .code, .text, .other] {
            XCTAssertFalse(MeeshyMediaSaveBranding.stamps(kind),
                           "\(kind.rawValue) ne doit jamais être ré-encodé pour y coller une marque")
        }
    }

    // MARK: - Invariant de non-régression

    func test_stamp_nonMediaKind_returnsTheOriginalFileUntouched() async throws {
        let file = try makeTempFile(named: "contrat.pdf")
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(file, kind: .pdf)

        XCTAssertEqual(branded, BrandedMedia.original(file))
        XCTAssertFalse(branded.isStamped,
                       "`isStamped == false` protège le fichier : l'appelant ne le supprimera pas")
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
    }

    func test_stamp_unreadableMedia_fallsBackToTheOriginal_ratherThanFailingTheSave() async throws {
        // Des octets qui ne sont pas une image : le rendu ne peut pas aboutir.
        let file = try makeTempFile(named: "cassee.jpg", contents: Data("not-an-image".utf8))
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(file, kind: .image)

        XCTAssertEqual(branded.url, file,
                       "Un marquage impossible rend l'original — l'utilisateur obtient son fichier")
        XCTAssertFalse(branded.isStamped)
    }

    func test_stamp_animatedImage_isServedRaw_ratherThanFlattened() async throws {
        let file = try makeTempFile(named: "boucle.gif", contents: Data("gif-bytes".utf8))
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(file, kind: .image)

        XCTAssertEqual(branded.url, file)
        XCTAssertFalse(branded.isStamped, "Un GIF marqué serait un GIF détruit")
    }

    func test_stamp_image_producesACopy_andLeavesTheSourceIntact() async throws {
        let source = try makeTempFile(named: "photo.jpg", contents: try makeJPEGData())
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(source, kind: .image)
        defer {
            if branded.isStamped {
                try? FileManager.default.removeItem(at: branded.url.deletingLastPathComponent())
            }
        }

        XCTAssertTrue(branded.isStamped, "Une vraie image JPEG doit recevoir la marque")
        XCTAssertNotEqual(branded.url, source)
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path),
                      "La source vient du cache disque : elle reste la copie fidèle de l'original")
    }

    // MARK: - Fabriques

    private func makeTempFile(named name: String,
                              contents: Data = Data("bytes".utf8)) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("branding-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent(name)
        try contents.write(to: url)
        return url
    }

    private func makeJPEGData() throws -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: CGSize(width: 200, height: 150), format: format)
            .image { context in
                UIColor.black.setFill()
                context.fill(CGRect(x: 0, y: 0, width: 200, height: 150))
            }
        return try XCTUnwrap(image.jpegData(compressionQuality: 0.9))
    }
}
