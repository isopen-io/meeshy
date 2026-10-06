import XCTest
import ImageIO
@testable import Meeshy

/// **✓ Terminé livre le rendu final et l'enregistre en galerie ; l'écran
/// d'édition ne garde rien de l'objectif** (#9352, spec § 3.3 / § 3.4).
@MainActor
final class ComposerCaptureEditTests: XCTestCase {

    // MARK: - « Terminé », la photo

    func test_finishEditingPhoto_deliversTheNativeCanvas_withTheTakeExif_andSavesIt() async throws {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)),
                             data: ComposerPhotoEncodingTests.takeWithExif())
        session.look = ComposerPhotoLook(filter: .cool)
        session.rezoom(from: .identity, scale: 1.5)
        session.finishEditing()
        XCTAssertTrue(session.isRenderingLook, "le rendu court : « Terminé » attend, et le dit")
        await ComposerCaptureTakesTests.waitUntil { remis != nil }
        guard case .photo(let image, let octets) = remis else { return XCTFail("une photo") }
        let natif = ComposerLookPainter.canvas(for: CGSize(width: 300, height: 400))
        XCTAssertEqual(image.size.width * image.scale, natif.width, "la définition de la source, jamais réduite")
        XCTAssertEqual(image.size.height * image.scale, natif.height)
        let lu = try XCTUnwrap(octets.flatMap { CGImageSourceCreateWithData($0 as CFData, nil) }
            .flatMap { CGImageSourceCopyPropertiesAtIndex($0, 0, nil) as? [CFString: Any] })
        let exif = try XCTUnwrap(lu[kCGImagePropertyExifDictionary] as? [CFString: Any])
        XCTAssertEqual(exif[kCGImagePropertyExifDateTimeOriginal] as? String, "2026:10:04 09:30:00",
                       "le rendu final garde la date de PRISE")
        XCTAssertEqual(lu[kCGImagePropertyOrientation] as? Int, 1)
        XCTAssertEqual(galerie.saveImageCount, 1, "« Terminé » enregistre le RENDU final en galerie")
        XCTAssertEqual(session.phase, .capturing)
        XCTAssertNil(session.editSource)
        XCTAssertFalse(session.isRenderingLook)
    }

    func test_finishEditingPhoto_afterDisarm_deliversNothing() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        session.finishEditing()
        session.disarm()
        try? await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(remis, 0, "un viseur fermé ne reçoit pas de prise en retard")
        XCTAssertEqual(galerie.saveImageCount, 0)
    }

    /// La croix reste vivante pendant le rendu (#8653) : elle l'abandonne.
    func test_cancelEditing_whileTheRenderRuns_deliversNothing_andSavesNothing() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        session.finishEditing()
        session.cancelEditing()
        XCTAssertFalse(session.isRenderingLook, "la retouche abandonnée n'attend plus rien")
        try? await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(remis, 0, "une retouche abandonnée ne part pas")
        XCTAssertEqual(galerie.saveImageCount, 0)
        XCTAssertEqual(session.phase, .capturing)
    }

    func test_finishEditing_twice_deliversOnce() async {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        var compte = 0
        session.onDeliver = { _ in compte += 1 }
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 30, height: 40)))
        session.finishEditing()
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { compte > 0 }
        try? await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(compte, 1)
    }

    func test_finishEditing_whileCapturing_doesNothing() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.finishEditing()
        XCTAssertFalse(session.isRenderingLook)
        XCTAssertEqual(session.phase, .capturing)
    }

    // MARK: - « Terminé », la vidéo

    func test_finishEditingVideo_untouched_deliversTheClip_andSavesNothingMore() async {
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, loopPlayerFactory: { _ in lecteur })
        let url = Self.clip()
        await session.beginEditing(video: url)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis != nil }
        guard case .video(let livree) = remis else { return XCTFail("une vidéo") }
        XCTAssertEqual(livree, url, "sans effet, sans cadrage, sans découpe : le brut, déjà en galerie")
        XCTAssertEqual(galerie.saveVideoCount, 0)
        XCTAssertEqual(lecteur.stopCount, 1, "la boucle s'arrête, une fois")
        XCTAssertEqual(session.phase, .capturing)
        XCTAssertFalse(session.isRenderingLook)
    }

    func test_finishEditingVideo_untouched_keepsTheDeliveredFile() async throws {
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery(),
                                             loopPlayerFactory: { _ in lecteur })
        let url = try Self.writtenClip()
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        await session.beginEditing(video: url)
        var remis = false
        session.onDeliver = { _ in remis = true }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis }
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "le fichier remis à l'hôte reste le sien")
    }

    #if DEBUG
    /// La vidéo de la scène part avec le look qu'on voyait en la retouchant : le
    /// rendu remplace le brut assemblé, part en galerie ET vers l'hôte.
    func test_finishEditingVideo_withALook_deliversTheRender_savesIt_andDropsTheAssembledFile() async throws {
        let film = await ComposerCaptureFixture.movie()
        let modele = try XCTUnwrap(film)
        let url = Self.clip()
        try FileManager.default.copyItem(at: modele, to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: url)
        session.look = ComposerPhotoLook(filter: .cool)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.finishEditing()
        XCTAssertTrue(session.isRenderingLook)
        XCTAssertEqual(lecteur.stopCount, 0, "la boucle joue encore pendant le rendu")
        await ComposerCaptureTakesTests.waitUntil(timeout: 90) { remis != nil }
        guard case .video(let livree) = remis else { return XCTFail("une vidéo") }
        addTeardownBlock { try? FileManager.default.removeItem(at: livree) }
        XCTAssertNotEqual(livree, url, "le rendu, pas le brut")
        XCTAssertTrue(FileManager.default.fileExists(atPath: livree.path))
        XCTAssertEqual(galerie.saveVideoCount, 1, "« Terminé » enregistre le RENDU final en galerie")
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path),
                       "le brut assemblé, remplacé par son rendu, quitte le dossier temporaire")
        XCTAssertEqual(lecteur.stopCount, 1)
        XCTAssertFalse(session.isRenderingLook)
    }
    #endif

    /// Le témoin de source du look vidéo (#9329) : le chemin « Terminé » rend par
    /// l'exporteur unique, avec le cadrage réglé en retouche.
    func test_finishEditingVideo_exportsThroughTheSingleExporter_withTheFraming() throws {
        let edition = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift")
        XCTAssertTrue(edition.contains("ComposerLookVideoExporter.export(url, look: regard, framing: cadrage"),
                      "la vidéo de la scène part avec son look et son cadrage")
        XCTAssertTrue(edition.contains("ComposerLookPainter.renderPhoto(photo, look: regard, framing: cadrage"),
                      "la photo aussi, par le peintre unique")
        XCTAssertTrue(edition.contains("ComposerPhotoEncoding.encode(rendu, like: prise)"),
                      "encodée avec les métadonnées de la prise")
    }

    // MARK: - L'abandon et la sortie

    func test_cancelEditingVideo_removesTheAssembledFile() async throws {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        let url = try Self.writtenClip()
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        await session.beginEditing(video: url)
        session.cancelEditing()
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path),
                       "la vidéo abandonnée ne reste pas dans le dossier temporaire")
    }

    func test_disarm_whileEditingVideo_removesTheAssembledFile() async throws {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        let url = try Self.writtenClip()
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        await session.beginEditing(video: url)
        session.disarm()
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    func test_finishCapture_whileEditingVideo_stopsTheLoop_andLeavesEditing() async {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.finishCapture()
        XCTAssertEqual(lecteur.stopCount, 1, "un viseur qui se retire ne laisse ni lecteur ni lien d'affichage")
        XCTAssertNil(session.loopPlayer)
        XCTAssertNil(session.editSource)
        XCTAssertEqual(session.phase, .capturing)
    }

    // MARK: - Le chrome ne garde rien de l'objectif

    func test_releaseDismissDrag_whileEditing_neverClosesTheViewfinder() {
        let session = ComposerCaptureSession(stage: .armed)
        XCTAssertTrue(session.releaseDismissDrag(translationY: 400), "en capture, le glissé range le viseur")
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 30, height: 40)))
        XCTAssertFalse(session.releaseDismissDrag(translationY: 400), "en édition, le doigt cadre : il ne range rien")
    }

    func test_focus_whileEditing_aimsNothing() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, mode: .photo, controls: objectif)
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 30, height: 40)))
        XCTAssertFalse(session.focus(atPreviewPoint: CGPoint(x: 100, y: 100), previewSize: CGSize(width: 200, height: 355)),
                       "l'objectif se repose : ni anneau ni vibration")
        XCTAssertTrue(objectif.focusRequests.isEmpty)
    }

    func test_reframe_whileTheRenderRuns_leavesTheFramingUntouched() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        session.isRenderingLook = true
        session.reframe(from: .identity, translation: CGSize(width: 40, height: 0), viewSize: CGSize(width: 200, height: 355))
        session.rezoom(from: .identity, scale: 2)
        XCTAssertEqual(session.framing, .identity, "ce qui part est ce qu'on voyait en validant")
    }

    func test_theTopRow_whileEditing_hidesFlashFlipAndExposure_andTheCrossCancels() throws {
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("var editing = false"))
        XCTAssertTrue(barre.contains("ComposerExposureRule.shows(stage: stage, editing: editing)"),
                      "le curseur de luminosité ne règle que l'objectif qui vise")
        XCTAssertFalse(barre.contains("editing: false"), "l'édition n'est plus niée en dur")
        guard let debut = barre.range(of: "private var topControls: some View {"),
              let fin = barre.range(of: "private var flashCluster", range: debut.upperBound..<barre.endIndex)
        else { return XCTFail("la rangée haute a changé de forme") }
        let rangee = String(barre[debut.upperBound..<fin.lowerBound])
        let porte = try XCTUnwrap(rangee.range(of: "if !editing {"))
        let bascule = try XCTUnwrap(rangee.range(of: "arrow.triangle.2.circlepath.camera"))
        let flash = try XCTUnwrap(rangee.range(of: "flashCluster"))
        XCTAssertLessThan(porte.lowerBound, bascule.lowerBound, "le retournement s'efface en édition")
        XCTAssertLessThan(porte.lowerBound, flash.lowerBound, "le flash aussi")
        XCTAssertTrue(rangee.contains("ComposerCaptureCopy.cancelEdit"), "la croix dit ce qu'elle fait en édition")
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("editing: session.phase.isEditing"))
        XCTAssertTrue(chrome.contains("guard !session.phase.isEditing else { return session.cancelEditing() }"),
                      "la croix abandonne la retouche au lieu de fermer le viseur")
    }

    func test_editScreen_paintsTheEditedSource_reframesWithTheFingers_andOffersDone() throws {
        let apercu = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("session.editSource"), "en édition, le peintre lit la photo figée ou la boucle")
        XCTAssertTrue(apercu.contains("framing: session.framing"), "l'aperçu montre le cadrage réglé")
        XCTAssertTrue(apercu.contains("ComposerCaptureSurfaceRule.editFPS(session.thermalBudget)"))
        XCTAssertTrue(apercu.contains("session.reframe(from:"), "un doigt déplace le média")
        XCTAssertTrue(apercu.contains("session.rezoom(from:"), "deux doigts le zooment")
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("session.finishEditing()"), "le seul ajout : ✓ Terminé")
        XCTAssertTrue(bas.contains("ComposerCaptureCopy.done"))
        XCTAssertTrue(bas.contains(".disabled(session.isRenderingLook)"), "un second toucher pendant le rendu ne remet rien")
        XCTAssertTrue(bas.contains("session.editSource ?? session.camera.liveFeed"),
                      "les miniatures se peignent sur le média retouché")
    }

    /// Une photo figée ne prévient son peintre qu'UNE fois, parfois avant que la
    /// vue ait sa taille (montage, carte ↔ plein écran) : sans trame suivante pour
    /// la rattraper, c'est la toile qui change de taille qui doit redessiner.
    func test_theSurface_redrawsWhenItsCanvasResizes_becauseAStillSourceWarnsOnlyOnce() throws {
        let surface = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        guard let debut = surface.range(of: "drawableSizeWillChange size: CGSize) {"),
              let fin = surface.range(of: "func draw(in view: MTKView)", range: debut.upperBound..<surface.endIndex)
        else { return XCTFail("le moteur de la surface a changé de forme") }
        XCTAssertTrue(String(surface[debut.upperBound..<fin.lowerBound]).contains("view.setNeedsDisplay()"),
                      "une toile redimensionnée se redessine, même sans trame neuve")
    }

    func test_copy_doneAndCancel_readFromTheCatalog() {
        XCTAssertFalse(ComposerCaptureCopy.done.isEmpty)
        XCTAssertFalse(ComposerCaptureCopy.cancelEdit.isEmpty)
        XCTAssertFalse(ComposerCaptureCopy.reframe.isEmpty)
    }

    private static func clip() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("clip_\(UUID().uuidString).mov")
    }

    private static func writtenClip() throws -> URL {
        let url = clip()
        try Data([0]).write(to: url)
        return url
    }
}
