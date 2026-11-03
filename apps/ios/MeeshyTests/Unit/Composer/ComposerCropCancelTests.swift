import XCTest
import UIKit
import MeeshyUI
@testable import Meeshy

/// **Le recadrage s'annule d'un geste et montre l'image voilée hors du cadre**
/// (#15355). « Annuler » rend le cadre et le placement d'avant l'entrée dans
/// Recadrer, sans abandonner la retouche ; la prise entière dépasse du cadre,
/// voilée, et seul le cadre part.
@MainActor
final class ComposerCropCancelTests: XCTestCase {

    private static func photoSession() -> ComposerCaptureSession {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.canvasAspect = 0.46
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        return session
    }

    private static func videoSession() async -> ComposerCaptureSession {
        let session = ComposerCaptureSession(stage: .armed,
                                             loopPlayerFactory: { _ in MockComposerLoopPlayer(duration: 6, hasAudio: true) })
        await session.beginEditing(video: FileManager.default.temporaryDirectory
            .appendingPathComponent("clip_\(UUID().uuidString).mov"))
        return session
    }

    // MARK: - Annuler

    func test_cancel_afterResizingAndPlacing_restoresTheFrameAndPlacementOfTheEntry() {
        let session = Self.photoSession()
        let cadre = session.editAspect
        let placement = session.framing
        session.toggleEditTool(.crop)
        ComposerCropFlow.apply(.square, to: session)
        session.rezoom(from: session.framing, scale: 2)
        session.reframe(from: session.framing, translation: CGSize(width: 40, height: 60),
                        viewSize: CGSize(width: 300, height: 300))
        XCTAssertNotEqual(session.editAspect, cadre)
        XCTAssertNotEqual(session.framing, placement)
        ComposerCropFlow.cancel(session)
        XCTAssertEqual(session.editAspect, cadre, "le cadre d'avant l'entrée revient")
        XCTAssertEqual(session.framing, placement, "et le placement de l'image avec lui")
        XCTAssertFalse(session.activeEditTools.contains(.crop), "Recadrer se referme")
    }

    func test_cancel_closesOnlyTheCrop_andKeepsTheRetouch() async {
        let session = await Self.videoSession()
        session.toggleEditTool(.trim)
        session.toggleEditTool(.crop)
        ComposerCropFlow.apply(.landscape, to: session)
        ComposerCropFlow.cancel(session)
        XCTAssertTrue(session.phase.isEditing, "la retouche n'est pas abandonnée")
        XCTAssertEqual(session.activeEditTools, [.trim], "la coupe reste ouverte")
        XCTAssertFalse(session.showsCropBrackets)
        XCTAssertFalse(session.editFramesScene, "la prise reprend tout l'écran")
    }

    func test_cancel_bringsBackTheTopRow_whenNoOtherToolIsShown() {
        let session = Self.photoSession()
        session.toggleEditTool(.crop)
        XCTAssertFalse(ComposerEditTools.showsTopRow(familyOpen: false, shownTools: session.shownEditTools))
        ComposerCropFlow.cancel(session)
        XCTAssertTrue(ComposerEditTools.showsTopRow(familyOpen: false, shownTools: session.shownEditTools),
                      "✕ et « Terminé » reviennent")
    }

    func test_cancel_afterAValidatedCrop_restoresTheValidatedFrame() {
        let session = Self.photoSession()
        session.toggleEditTool(.crop)
        ComposerCropFlow.apply(.square, to: session)
        session.toggleEditTool(.crop)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 1, accuracy: 0.0001, "retoucher Recadrer valide le carré")
        session.toggleEditTool(.crop)
        ComposerCropFlow.apply(.landscape, to: session)
        ComposerCropFlow.cancel(session)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 1, accuracy: 0.0001, "Annuler revient au carré validé")
    }

    func test_cancel_withoutTheCropOpen_changesNothing() {
        let session = Self.photoSession()
        session.toggleEditTool(.crop)
        ComposerCropFlow.apply(.square, to: session)
        session.toggleEditTool(.text)
        XCTAssertFalse(session.activeEditTools.contains(.crop), "Texte range Recadrer en gardant son cadre")
        ComposerCropFlow.cancel(session)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 1, accuracy: 0.0001, "rien à annuler hors du recadrage")
        XCTAssertEqual(session.activeEditTools, [.text])
    }

    func test_cancel_whileTheRenderRuns_changesNothing() {
        let session = Self.photoSession()
        session.toggleEditTool(.crop)
        ComposerCropFlow.apply(.square, to: session)
        session.isRenderingLook = true
        ComposerCropFlow.cancel(session)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 1, accuracy: 0.0001, "ce qui part est ce qu'on voyait en validant")
        XCTAssertTrue(session.activeEditTools.contains(.crop))
    }

    func test_presets_readAndApplyTheFrameOfTheSession() {
        let session = Self.photoSession()
        ComposerCropFlow.apply(.original, to: session)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 0.75, accuracy: 0.0001)
        XCTAssertEqual(ComposerCropFlow.preset(of: session), .original)
        ComposerCropFlow.apply(.square, to: session)
        XCTAssertEqual(ComposerCropFlow.preset(of: session), .square)
    }

    func test_cancelButton_isA44ptTarget_withItsOwnVoiceOverLabel() {
        XCTAssertGreaterThanOrEqual(ComposerCropCancelButton.minSide, 44)
        XCTAssertFalse(ComposerCaptureCopy.cancelCrop.isEmpty)
        XCTAssertNotEqual(ComposerCaptureCopy.cancelCrop, ComposerCaptureCopy.cancelEdit,
                          "VoiceOver dit ce qu'Annuler annule : le recadrage, pas la retouche")
    }

    func test_cancelLabel_isTranslatedInTheSevenLanguages() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let donnees = try Data(contentsOf: racine.appendingPathComponent("Meeshy/Localizable.xcstrings"))
        let catalogue = try XCTUnwrap(JSONSerialization.jsonObject(with: donnees) as? [String: Any])
        let chaines = try XCTUnwrap(catalogue["strings"] as? [String: Any])
        let entree = try XCTUnwrap(chaines["composer.capture.crop.cancel.a11y"] as? [String: Any])
        let langues = try XCTUnwrap(entree["localizations"] as? [String: Any])
        XCTAssertEqual(Set(langues.keys), ["ar", "de", "en", "es", "fr", "it", "pt-BR"])
    }

    func test_chrome_mountsCancelBesideTheFormats() throws {
        let vues = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(vues.contains("ComposerCropCancelButton {"), "Annuler se pose avec les formats, sur le cadre")
        XCTAssertTrue(vues.contains("ComposerCropFlow.cancel(session)"))
    }

    // MARK: - L'image voilée hors du cadre

    private static let photo = CGRect(x: 0, y: 0, width: 300, height: 400)
    private static let ecran = CGRect(x: 0, y: 0, width: 375, height: 812)

    func test_overflowImage_placesTheWholeTakeSoThatTheWindowFillsTheFrame() throws {
        let cadre = CGRect(x: 16, y: 200, width: 343, height: 343)
        let fenetre = ComposerFraming.identity.window(in: Self.photo, aspect: 1)
        let image = try XCTUnwrap(ComposerCropOverflowLayout.imageRect(frame: cadre, window: fenetre, source: Self.photo))
        let echelle = cadre.width / fenetre.width
        XCTAssertEqual(image.width, Self.photo.width * echelle, accuracy: 0.001)
        XCTAssertEqual(image.height, Self.photo.height * echelle, accuracy: 0.001)
        XCTAssertEqual(image.minX + (fenetre.minX - Self.photo.minX) * echelle, cadre.minX, accuracy: 0.001)
        XCTAssertEqual(image.minY + (Self.photo.maxY - fenetre.maxY) * echelle, cadre.minY, accuracy: 0.001,
                       "la fenêtre tombe sur le cadre : Core Image compte y vers le haut, l'écran vers le bas")
        XCTAssertTrue(image.contains(cadre), "la prise dépasse du cadre")
    }

    func test_overflowVisible_ofAWholeTake_isTheWholeTake() throws {
        let cadre = CGRect(x: 16, y: 200, width: 343, height: 343)
        let fenetre = ComposerFraming.identity.window(in: Self.photo, aspect: 1)
        let pose = try XCTUnwrap(ComposerCropOverflowLayout.visible(frame: cadre, window: fenetre, source: Self.photo,
                                                                     screen: Self.ecran))
        XCTAssertEqual(pose.framing.scale, 1, accuracy: 0.0001)
        let peint = pose.framing.window(in: Self.photo, aspect: pose.rect.width / pose.rect.height)
        XCTAssertEqual(peint.width, Self.photo.width, accuracy: 0.01)
        XCTAssertEqual(peint.height, Self.photo.height, accuracy: 0.01)
    }

    func test_overflowVisible_ofAZoomedTake_isClippedToTheScreen_andPaintsExactlyWhatFallsThere() throws {
        let cadre = CGRect(x: 16, y: 200, width: 343, height: 343)
        let fenetre = ComposerFraming(center: CGPoint(x: 0.4, y: 0.55), scale: 2).window(in: Self.photo, aspect: 1)
        let image = try XCTUnwrap(ComposerCropOverflowLayout.imageRect(frame: cadre, window: fenetre, source: Self.photo))
        let pose = try XCTUnwrap(ComposerCropOverflowLayout.visible(frame: cadre, window: fenetre, source: Self.photo,
                                                                     screen: Self.ecran))
        XCTAssertEqual(pose.rect, image.intersection(Self.ecran), "jamais plus grand que l'écran")
        let peint = pose.framing.window(in: Self.photo, aspect: pose.rect.width / pose.rect.height)
        let echelle = image.width / Self.photo.width
        XCTAssertEqual(image.minX + (peint.minX - Self.photo.minX) * echelle, pose.rect.minX, accuracy: 0.01)
        XCTAssertEqual(image.minX + (peint.maxX - Self.photo.minX) * echelle, pose.rect.maxX, accuracy: 0.01)
        XCTAssertEqual(image.minY + (Self.photo.maxY - peint.maxY) * echelle, pose.rect.minY, accuracy: 0.01)
        XCTAssertEqual(image.minY + (Self.photo.maxY - peint.minY) * echelle, pose.rect.maxY, accuracy: 0.01)
    }

    func test_overflowVisible_ofADegenerateWindow_isNothing() {
        XCTAssertNil(ComposerCropOverflowLayout.visible(frame: CGRect(x: 0, y: 0, width: 100, height: 100),
                                                        window: .zero, source: Self.photo, screen: Self.ecran))
    }

    func test_overflow_showsOnlyWhileCropping_withoutACadre() {
        XCTAssertTrue(ComposerCropOverflowLayout.shows(framesScene: true, look: ComposerPhotoLook()))
        XCTAssertFalse(ComposerCropOverflowLayout.shows(framesScene: false, look: ComposerPhotoLook()))
        XCTAssertFalse(ComposerCropOverflowLayout.shows(framesScene: true, look: ComposerCaptureTakesTests.framedLook),
                       "un cadre pose la prise dans sa case : rien ne dépasse")
        XCTAssertGreaterThan(ComposerCropOverflowLayout.veil, 0)
        XCTAssertLessThan(ComposerCropOverflowLayout.veil, 1, "voilée, jamais cachée")
    }

    func test_mount_paintsTheOverflowUnderTheFramedImage() throws {
        let montage = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureMount.swift")
        let voile = try XCTUnwrap(montage.range(of: "ComposerCropOverflow("))
        let image = try XCTUnwrap(montage.range(of: "image(rect:"))
        XCTAssertLessThan(voile.lowerBound, image.lowerBound, "le voile se peint SOUS l'image du cadre, qui seule part")
    }
}
