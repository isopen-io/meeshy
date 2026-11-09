import XCTest
import UIKit
import MeeshyUI
@testable import Meeshy

/// **Avatar et bannière se retouchent avec l'outil de la capture caméra**
/// (#17251). La scène prend les proportions du format — rond 1:1, bandeau 3:1 —
/// sans recadrage libre ; « Terminé » rend une image à ce format ; annuler ne
/// rend rien.
@MainActor
final class EntityImageRetouchTests: XCTestCase {

    private static func picked(width: Int = 400, height: Int = 300) -> UIImage {
        UIImage(cgImage: ComposerCapturePhaseTests.photo(width: width, height: height))
    }

    private static func session(_ format: EntityImageFormat?) -> ComposerCaptureSession {
        let session = ConversationPieceRetouchOpening.session(gallery: MockComposerGallery(), format: format)
        session.beginEditing(photo: picked())
        return session
    }

    // MARK: - La scène au format

    func test_avatar_opensASquareScene_withoutFreeCrop() {
        let session = Self.session(.avatar)
        XCTAssertEqual(session.editAspect, 1)
        XCTAssertEqual(session.editTools, [.text], "l'avatar reste rond : Recadrer ne s'offre pas")
    }

    func test_banner_opensAThreeToOneScene_beyondTheFreeCropRange() {
        let session = Self.session(.banner)
        XCTAssertEqual(session.editAspect, 3)
        XCTAssertFalse(session.editTools.contains(.crop))
    }

    func test_lockedFormat_ignoresAnAspectChange() {
        let session = Self.session(.avatar)
        session.setEditAspect(9.0 / 16.0)
        XCTAssertEqual(session.editAspect, 1, "le format imposé ne se quitte pas")
    }

    func test_withoutFormat_aPieceKeepsItsFreeCrop() {
        let session = Self.session(nil)
        XCTAssertTrue(session.editTools.contains(.crop))
        XCTAssertNotEqual(session.editAspect, 1)
    }

    func test_offered_formatLocked_dropsOnlyTheCrop() {
        XCTAssertEqual(ComposerEditTools.offered(.photo, formatLocked: true), [.text])
        XCTAssertEqual(ComposerEditTools.offered(.photo), [.crop, .text])
    }

    // MARK: - « Terminé » rend une image au format

    func test_finish_avatar_deliversASquareImage() async {
        let session = Self.session(.avatar)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis != nil }
        guard case .photo(let image, _) = remis else { return XCTFail("une photo") }
        XCTAssertEqual(image.size.width, image.size.height, accuracy: 1)
    }

    func test_imageFromMedia_isCroppedToTheFormat_andAVideoIsNotAnImage() throws {
        let image = try XCTUnwrap(EntityImageRetouch.image(from: .image(Self.picked(width: 300, height: 300)),
                                                           format: .banner))
        XCTAssertEqual(image.size.width / image.size.height, 3, accuracy: 0.01)
        XCTAssertNil(EntityImageRetouch.image(from: .video(URL(fileURLWithPath: "/tmp/x.mov")), format: .avatar))
    }

    // MARK: - Annuler ne pose rien

    func test_cancel_deliversNothing() async {
        let session = Self.session(.avatar)
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        session.cancelEditing()
        try? await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertEqual(remis, 0, "la croix annule : aucune image n'est posée")
        XCTAssertFalse(session.phase.isEditing)
    }

    func test_cancelDuringTheRender_deliversNothing() async {
        let session = Self.session(.banner)
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        session.finishEditing()
        session.cancelEditing()
        try? await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(remis, 0)
    }
}
