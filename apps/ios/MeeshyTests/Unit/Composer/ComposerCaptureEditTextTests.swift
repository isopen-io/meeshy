import XCTest
import UIKit
@testable import Meeshy

/// #12591 — **le texte part avec le média**, par « Terminé » comme par la flèche ⬇︎, et la
/// retouche suivante repart d'une planche vide. Chaque témoin observe ce qui PART.
@MainActor
final class ComposerCaptureEditTextTests: XCTestCase {

    /// Une photo sombre aux proportions exactes de la toile : sans le texte, la prise REPARTIRAIT
    /// telle quelle (le raccourci de `untouchedTake`).
    private static func darkTake(width: Int = 216, height: Int = 384) -> UIImage {
        let contexte = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(gray: 0.05, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return UIImage(cgImage: contexte.makeImage()!)
    }

    private static func brightPixels(_ image: UIImage) -> Int {
        guard let cg = image.cgImage else { return 0 }
        var data = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let contexte = CGContext(data: &data, width: cg.width, height: cg.height, bitsPerComponent: 8,
                                 bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        return stride(from: 0, to: data.count, by: 4).filter { data[$0] > 160 && data[$0 + 1] > 160 && data[$0 + 2] > 160 }.count
    }

    private func sessionAvecTexte(_ texte: String = "Bonjour", data: Data? = nil) throws -> (ComposerCaptureSession, MockComposerGallery) {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.beginEditing(photo: Self.darkTake(), data: data)
        session.toggleEditTool(.text)
        let id = try XCTUnwrap(session.retouchTexts.typingId)
        session.retouchTexts.write(texte, in: id)
        session.retouchTexts.endTyping()
        return (session, galerie)
    }

    private func livraison(_ session: ComposerCaptureSession) async -> CameraResult? {
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis != nil }
        return remis
    }

    func test_finishEditingPhoto_withText_deliversAPhotoThatCarriesTheTextPixels() async throws {
        let (session, _) = try sessionAvecTexte()
        guard case .photo(let image, _)? = await livraison(session) else { return XCTFail("une photo") }
        XCTAssertGreaterThan(Self.brightPixels(image), 40, "le texte blanc est dans les pixels de la photo qui part")
    }

    func test_finishEditingPhoto_withTextOnly_isNotTheUntouchedTake() async throws {
        let octets = try XCTUnwrap(ComposerPhotoEncodingTests.takeWithExif())
        let (session, _) = try sessionAvecTexte(data: octets)
        guard case .photo(let image, let remis)? = await livraison(session) else { return XCTFail("une photo") }
        XCTAssertNotEqual(remis, octets, "le raccourci « la prise repart telle quelle » ne court-circuite pas un texte posé")
        XCTAssertGreaterThan(Self.brightPixels(image), 40)
    }

    func test_finishEditingPhoto_withoutText_staysTheUntouchedTake() async throws {
        let octets = try XCTUnwrap(ComposerPhotoEncodingTests.takeWithExif())
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.beginEditing(photo: Self.darkTake(), data: octets)
        guard case .photo(_, let remis)? = await livraison(session) else { return XCTFail("une photo") }
        XCTAssertEqual(remis, octets, "sans texte, rien ne change : la prise repart telle quelle")
    }

    func test_leaveEditing_emptiesTheBoard_noLeakToTheNextTake() throws {
        let (session, _) = try sessionAvecTexte()
        XCTAssertFalse(session.retouchTexts.isEmpty)
        session.cancelEditing()
        XCTAssertTrue(session.retouchTexts.isEmpty, "aucune fuite vers la prise suivante")
        session.beginEditing(photo: Self.darkTake())
        XCTAssertTrue(session.retouchTexts.isEmpty)
    }

    func test_saveToPhotos_thenAnotherText_offersTheArrowAgain() async throws {
        let (session, _) = try sessionAvecTexte()
        session.saveTakeToPhotos()
        await ComposerCaptureTakesTests.waitUntil { session.takeSaveState == .saved }
        XCTAssertFalse(session.takeSaveState.offersSave, "enregistrée, la flèche s'en va")
        session.retouchTexts.addText()
        let id = try XCTUnwrap(session.retouchTexts.typingId)
        session.retouchTexts.write("Encore", in: id)
        session.retouchTexts.endTyping()
        XCTAssertTrue(session.takeSaveState.offersSave, "un texte posé après ⬇︎ est une nouvelle version : la flèche revient")
    }

    func test_saveToPhotos_writesTheRenderWithTheText() async throws {
        let (session, galerie) = try sessionAvecTexte()
        session.saveTakeToPhotos()
        await ComposerCaptureTakesTests.waitUntil { session.takeSaveState == .saved }
        XCTAssertEqual(galerie.saveImageCount, 1)
        let octets = try XCTUnwrap(galerie.lastSavedImageData)
        let image = try XCTUnwrap(UIImage(data: octets))
        XCTAssertGreaterThan(Self.brightPixels(image), 40, "Photos reçoit ce qu'on voit : texte compris")
    }
}
