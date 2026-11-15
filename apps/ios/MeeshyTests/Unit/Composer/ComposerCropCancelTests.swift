import XCTest
import UIKit
import MeeshyUI
@testable import Meeshy

/// **Fermer le recadrage garde le format ; « Annuler » le rend** (#18639, #18654) :
/// chaque format et chaque crochet s'appliquent à l'instant, retoucher
/// « Recadrer » ou ouvrir un autre outil referme le recadrage en gardant le format, et les
/// formats portent la puce de tri de la bande, sans bouton à côté d'eux. « Annuler » vit à la
/// place de « Terminé », dans la rangée haute. La prise entière dépasse du cadre,
/// voilée, et seul le cadre part (#15355).
@MainActor
final class ComposerCropCancelTests: XCTestCase {

    private static func photoSession() -> ComposerCaptureSession {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.canvasAspect = 0.46
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        return session
    }

    // MARK: - Refermer le recadrage

    func test_retappingCrop_closesIt_keepingTheChosenFormat() {
        let session = Self.photoSession()
        session.toggleEditTool(.crop)
        ComposerCropFlow.apply(.square, to: session)
        session.toggleEditTool(.crop)
        XCTAssertFalse(session.activeEditTools.contains(.crop), "Recadrer se referme")
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 1, accuracy: 0.0001, "le carré choisi reste")
        XCTAssertTrue(ComposerEditTools.showsTopRow(familyOpen: false, shownTools: session.shownEditTools),
                      "✕ et « Terminé » reviennent")
    }

    func test_openingAnotherTool_closesTheCrop_keepingTheChosenFormat() {
        let session = Self.photoSession()
        session.toggleEditTool(.crop)
        ComposerCropFlow.apply(.square, to: session)
        session.toggleEditTool(.text)
        XCTAssertFalse(session.activeEditTools.contains(.crop), "Texte range Recadrer")
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 1, accuracy: 0.0001)
        XCTAssertFalse(session.showsCropBrackets)
    }

    func test_presets_readAndApplyTheFrameOfTheSession() {
        let session = Self.photoSession()
        ComposerCropFlow.apply(.original, to: session)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 0.75, accuracy: 0.0001)
        XCTAssertEqual(ComposerCropFlow.preset(of: session), .original)
        ComposerCropFlow.apply(.square, to: session)
        XCTAssertEqual(ComposerCropFlow.preset(of: session), .square)
    }

    // MARK: - Les formats en puces, « Annuler » à la place de « Terminé »

    func test_formats_wearTheBandSortingChip_andCancelSitsWhereDoneWas() throws {
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCropBrackets.swift")
        XCTAssertTrue(barre.contains("CallFrameMoodChip(title: preset.label, isSelected: selected == preset)"),
                      "la puce des pilules Élégant · Jovial · Corporate")
        XCTAssertFalse(barre.contains("ComposerCropCancelButton"), "aucun « Annuler » à côté des formats")
        let vues = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(vues.contains(".overlay(alignment: .topTrailing) { ComposerCropCancelButton(session: session) }"),
                      "« Annuler » prend la place de « Terminé », sur la rangée haute (#18654)")
        XCTAssertTrue(vues.contains("ComposerCropPresetBar(selected: ComposerCropFlow.preset(of: session))"))
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
