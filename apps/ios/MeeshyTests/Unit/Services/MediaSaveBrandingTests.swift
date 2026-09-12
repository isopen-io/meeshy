import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// **Directive porteur du 2026-09-12** — elle SUPPLANTE la demande du
/// 2026-08-12 (« un média enregistré depuis Meeshy porte sa marque », qui
/// marquait les trois familles quelle que soit leur provenance) :
///
/// > « On enlève la marque ! On préserve la marque uniquement pour les STORY
/// > enregistré et exporté et les SCENE de poste, réel ! Pour les images de
/// > conversation on ne met pas la marque ni sur les vidéos originaux ni sur
/// > les audios originaux ni sur les images originaux ! »
///
/// Ce fichier couvre la RÈGLE — ce qui est marqué et ce qui sort nu — et
/// l'invariant qui ne bouge pas : marquer ne casse JAMAIS un enregistrement.
///
/// Le témoin central est `test_stamps_theTwoImages_partWays_onTheirOriginAlone` :
/// un témoin qui n'interrogerait qu'un seul `AttachmentKind` serait vert sans
/// rien prouver, puisque c'est précisément le type qui a cessé de décider.
@MainActor
final class MediaSaveBrandingTests: XCTestCase {

    // MARK: - Le prédicat décide par l'ORIGINE

    func test_stamps_theTwoImages_partWays_onTheirOriginAlone() {
        // MÊME famille, verdicts OPPOSÉS : c'est l'origine, et elle seule, qui
        // tranche. Le rendu d'une scène de post porte la marque ; la photo
        // qu'un correspondant a postée dans un fil sort nue.
        XCTAssertTrue(MeeshyMediaSaveBranding.stamps(origin: .composed, kind: .image),
                      "Le rendu d'une scène est une œuvre composée par Meeshy : il porte la marque")
        XCTAssertFalse(MeeshyMediaSaveBranding.stamps(origin: .transmitted, kind: .image),
                       "L'image d'une conversation n'a été que transmise : elle sort nue (directive 2026-09-12)")
    }

    func test_stamps_marksTheComposedWork_acrossTheThreeMediaFamilies() {
        for kind: AttachmentKind in [.image, .video, .audio] {
            XCTAssertTrue(MeeshyMediaSaveBranding.stamps(origin: .composed, kind: kind),
                          "\(kind.rawValue) composé dans Meeshy — story, scène de post, scène de réel — porte sa marque")
        }
    }

    func test_stamps_leavesTheTransmittedMediaNude_acrossTheThreeMediaFamilies() {
        for kind: AttachmentKind in [.image, .video, .audio] {
            XCTAssertFalse(MeeshyMediaSaveBranding.stamps(origin: .transmitted, kind: kind),
                           "\(kind.rawValue) d'une conversation : ni filigrane, ni signature sonore (directive 2026-09-12)")
        }
    }

    func test_stamps_leavesDocumentsAndArchivesUntouched_whateverTheirOrigin() {
        // Il n'existe pas de marque qui n'abîmerait pas un PDF ou un ZIP — et
        // l'origine n'y change rien : le type reste un garde-fou, il a
        // seulement cessé d'être le décideur.
        for origin in MediaOrigin.allCases {
            for kind: AttachmentKind in [.pdf, .document, .spreadsheet, .presentation,
                                         .archive, .code, .text, .other] {
                XCTAssertFalse(MeeshyMediaSaveBranding.stamps(origin: origin, kind: kind),
                               "\(kind.rawValue) (\(origin.rawValue)) ne doit jamais être ré-encodé pour y coller une marque")
            }
        }
    }

    // MARK: - La règle se lit sur les OCTETS écrits, pas seulement sur le prédicat

    func test_stamp_transmittedImage_servesTheOriginal_thoughItIsARealJPEG() async throws {
        // Une VRAIE image JPEG : sous l'ancienne règle elle ressortait marquée.
        // La distinguer d'un fichier illisible est ce qui prouve que c'est
        // l'origine — et non un échec de rendu — qui l'a laissée nue.
        let source = try makeTempFile(named: "photo-du-fil.jpg", contents: try makeJPEGData())
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(source, kind: .image, origin: .transmitted)

        XCTAssertEqual(branded, BrandedMedia.original(source),
                       "L'image d'une conversation part telle quelle — aucun ré-encodage")
        XCTAssertFalse(branded.isStamped,
                       "`isStamped == false` protège le fichier du cache : l'appelant ne le supprimera pas")
    }

    func test_stamp_composedImage_producesACopy_andLeavesTheSourceIntact() async throws {
        let source = try makeTempFile(named: "scene.jpg", contents: try makeJPEGData())
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(source, kind: .image, origin: .composed)
        defer {
            if branded.isStamped {
                try? FileManager.default.removeItem(at: branded.url.deletingLastPathComponent())
            }
        }

        XCTAssertTrue(branded.isStamped, "Le rendu d'une scène doit recevoir la marque")
        XCTAssertNotEqual(branded.url, source)
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path),
                      "La source vient du cache disque : elle reste la copie fidèle de l'original")
    }

    // MARK: - Invariants de non-régression (sur l'origine qui MARQUE, seule où ils portent)

    func test_stamp_nonMediaKind_returnsTheOriginalFileUntouched() async throws {
        let file = try makeTempFile(named: "contrat.pdf")
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(file, kind: .pdf, origin: .composed)

        XCTAssertEqual(branded, BrandedMedia.original(file))
        XCTAssertFalse(branded.isStamped,
                       "`isStamped == false` protège le fichier : l'appelant ne le supprimera pas")
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
    }

    func test_stamp_unreadableMedia_fallsBackToTheOriginal_ratherThanFailingTheSave() async throws {
        // Des octets qui ne sont pas une image : le rendu ne peut pas aboutir.
        let file = try makeTempFile(named: "cassee.jpg", contents: Data("not-an-image".utf8))
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(file, kind: .image, origin: .composed)

        XCTAssertEqual(branded.url, file,
                       "Un marquage impossible rend l'original — l'utilisateur obtient son fichier")
        XCTAssertFalse(branded.isStamped)
    }

    func test_stamp_animatedImage_isServedRaw_ratherThanFlattened() async throws {
        let file = try makeTempFile(named: "boucle.gif", contents: Data("gif-bytes".utf8))
        let sut = MeeshyMediaSaveBranding(username: { "alice" })

        let branded = await sut.stamp(file, kind: .image, origin: .composed)

        XCTAssertEqual(branded.url, file)
        XCTAssertFalse(branded.isStamped, "Un GIF marqué serait un GIF détruit")
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
