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
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { Self.automatic })
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
        XCTAssertEqual(galerie.saveImageCount, 1, "en mode automatique, « Terminé » enregistre le RENDU final en galerie")
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
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { .standard },
                                             loopPlayerFactory: { _ in lecteur })
        let url = Self.clip()
        await session.beginEditing(video: url)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis != nil }
        guard case .video(let livree) = remis else { return XCTFail("une vidéo") }
        XCTAssertEqual(livree, url, "sans effet, sans cadrage, sans découpe : le brut")
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
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { Self.automatic },
                                             loopPlayerFactory: { _ in lecteur })
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
        XCTAssertTrue(barre.contains("trailingItems.contains(.flash) && ComposerFlashIntensity.showsSlider(flash: flashMode)"),
                      "le curseur du flash ne règle que l'objectif qui vise")
        XCTAssertFalse(barre.contains("editing: false"), "l'édition n'est plus niée en dur")
        let retouche = ComposerCaptureTopRow.trailing(ComposerCaptureTopRow.Input(stage: .armed, editing: true))
        XCTAssertFalse(retouche.contains(.flip), "le retournement s'efface en édition")
        XCTAssertFalse(retouche.contains(.flash), "le flash aussi")
        XCTAssertTrue(barre.contains("ComposerCaptureCopy.cancelEdit"), "la croix dit ce qu'elle fait en édition")
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
        XCTAssertTrue(bas.contains("session.editSource ?? session.camera.liveFeed"),
                      "les miniatures se peignent sur le média retouché")
    }

    // MARK: - La scène de retouche, posée sur le sol (#9567)

    /// (X) et « Terminé » sont alignés en haut, au-dessus du sol — jamais en bas,
    /// jamais sur la scène.
    func test_done_sitsTopRight_alignedWithTheCross_andNoLongerAtTheBottom() throws {
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        let retouche = ComposerCaptureTopRow.Input(stage: .armed, editing: true, offersSave: true)
        XCTAssertEqual(ComposerCaptureTopRow.leading(retouche), [.close])
        XCTAssertEqual(ComposerCaptureTopRow.trailing(retouche).last, .done, "« Terminé » ferme la rangée, à droite")
        XCTAssertTrue(barre.contains("ComposerCaptureCopy.done"))
        XCTAssertTrue(barre.contains(".disabled(rendering)"), "un second toucher pendant le rendu ne remet rien")
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("onDone: { session.finishEditing() }"))
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertFalse(bas.contains("session.finishEditing()"), "« Terminé » a quitté le bas")
        XCTAssertFalse(bas.contains("ComposerCaptureCopy.done"))
    }

    func test_editArea_liesBetweenTheTopRowAndTheTools_insideTheSafeArea() {
        let ecran = CGSize(width: 402, height: 874)
        let zone = ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panel: .none)
        XCTAssertEqual(zone.minY, 62 + ComposerEditScene.topBand)
        XCTAssertEqual(zone.maxY, 874 - 34 - ComposerEditScene.bottomReserve(.none))
        XCTAssertEqual(zone.minX, ComposerEditScene.margin)
        XCTAssertEqual(zone.width, 402 - ComposerEditScene.margin * 2)
        let avecBande = ComposerEditScene.area(container: ecran, top: 62, bottom: 34, panel: .band)
        XCTAssertLessThan(avecBande.height, zone.height, "un panneau ouvert prend sa place sous la scène")
        XCTAssertEqual(avecBande.minY, zone.minY)
    }

    func test_editScene_fitsItsProportionsInTheArea_centred() {
        let zone = CGRect(x: 16, y: 126, width: 370, height: 600)
        let debout = ComposerEditScene.rect(aspect: 9.0 / 16.0, in: zone)
        XCTAssertEqual(debout.height, 600, accuracy: 0.01)
        XCTAssertEqual(debout.width, 337.5, accuracy: 0.01)
        XCTAssertEqual(debout.midX, zone.midX, accuracy: 0.01)
        let couche = ComposerEditScene.rect(aspect: 16.0 / 9.0, in: zone)
        XCTAssertEqual(couche.width, 370, accuracy: 0.01)
        XCTAssertEqual(couche.midY, zone.midY, accuracy: 0.01)
        XCTAssertEqual(ComposerEditScene.rect(aspect: 0, in: zone), zone, "des proportions absurdes rendent la zone")
    }

    func test_editPanel_theBandThenTheOpenTool_andNothingByDefault() {
        XCTAssertEqual(ComposerEditTools.panel(familyOpen: true, tool: .trim), .band)
        XCTAssertEqual(ComposerEditTools.panel(familyOpen: false, tool: .crop), .presets)
        XCTAssertEqual(ComposerEditTools.panel(familyOpen: false, tool: .trim), .trim)
        XCTAssertEqual(ComposerEditTools.panel(familyOpen: false, tool: .sound), .sound)
        XCTAssertEqual(ComposerEditTools.panel(familyOpen: false, tool: nil), .none,
                       "rien n'est ouvert à l'entrée : l'écran respire (#9754)")
        XCTAssertGreaterThan(ComposerEditScene.bottomReserve(.band), ComposerEditScene.bottomReserve(.none))
    }

    /// Un crochet tiré déplace SON angle ; l'angle opposé ne bouge pas, et la
    /// scène ne sort ni de sa zone ni sous sa taille minimale.
    func test_crop_draggingACorner_movesThatCorner_andStaysInBounds() {
        let zone = CGRect(x: 0, y: 0, width: 400, height: 600)
        let scene = CGRect(x: 50, y: 100, width: 300, height: 400)
        let serre = ComposerEditScene.cropped(scene, corner: .bottomTrailing, translation: CGSize(width: -40, height: -60),
                                              within: zone)
        XCTAssertEqual(serre, CGRect(x: 50, y: 100, width: 260, height: 340))
        let haut = ComposerEditScene.cropped(scene, corner: .topLeading, translation: CGSize(width: 30, height: 20), within: zone)
        XCTAssertEqual(haut, CGRect(x: 80, y: 120, width: 270, height: 380))
        let deborde = ComposerEditScene.cropped(scene, corner: .topTrailing, translation: CGSize(width: 900, height: -900),
                                                within: zone)
        XCTAssertEqual(deborde.maxX, zone.maxX)
        XCTAssertEqual(deborde.minY, zone.minY)
        let ecrase = ComposerEditScene.cropped(scene, corner: .bottomLeading, translation: CGSize(width: 900, height: -900),
                                               within: zone)
        XCTAssertEqual(ecrase.width, ComposerEditScene.minimumSide)
        XCTAssertEqual(ecrase.height, ComposerEditScene.minimumSide)
        XCTAssertEqual(ecrase.maxX, scene.maxX, "l'angle opposé tient")
        XCTAssertEqual(ecrase.minY, scene.minY)
    }

    func test_cropPresets_fixTheProportions_originalReadsTheMedia() {
        let source = CGSize(width: 3024, height: 4032)
        XCTAssertEqual(ComposerCropPreset.allCases, [.original, .story, .portrait, .square, .landscape])
        XCTAssertEqual(ComposerCropPreset.original.aspect(source: source), 0.75, accuracy: 0.0001)
        XCTAssertEqual(ComposerCropPreset.story.aspect(source: source), 9.0 / 16.0, accuracy: 0.0001)
        XCTAssertEqual(ComposerCropPreset.portrait.aspect(source: source), 0.8, accuracy: 0.0001)
        XCTAssertEqual(ComposerCropPreset.square.aspect(source: source), 1, accuracy: 0.0001)
        XCTAssertEqual(ComposerCropPreset.landscape.aspect(source: source), 16.0 / 9.0, accuracy: 0.0001)
        XCTAssertEqual(ComposerCropPreset.matching(1.0004, source: source), .square)
        XCTAssertNil(ComposerCropPreset.matching(0.62, source: source), "un recadrage libre n'allume aucun preset")
        XCTAssertFalse(ComposerCropPreset.allCases.contains { $0.label.isEmpty })
    }

    func test_editing_opensOnTheProportionsOfTheViewfinder_andCropsFreelyOrByPreset() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        XCTAssertNil(session.editAspect)
        session.canvasAspect = 0.46
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 0.46, accuracy: 0.0001, "on retouche ce qu'on a cadré")
        session.setEditAspect(0.01)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), ComposerEditScene.aspectRange.lowerBound, accuracy: 0.0001)
        session.applyCropPreset(.original)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 0.75, accuracy: 0.0001)
        session.applyCropPreset(.square)
        XCTAssertEqual(try XCTUnwrap(session.editAspect), 1, accuracy: 0.0001)
        session.cancelEditing()
        XCTAssertNil(session.editAspect, "la scène de retouche part avec la retouche")
        session.setEditAspect(1)
        XCTAssertNil(session.editAspect, "hors retouche, rien ne se recadre")
    }

    func test_cropPresets_andTheBand_neverOpenTogether_andCloseWithTheEdit() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.toggleEditTool(.crop)
        XCTAssertNil(session.editTool, "hors retouche, pas de recadrage")
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        XCTAssertEqual(session.editPanel, .none)
        XCTAssertFalse(session.showsCropBrackets, "les équerres attendent l'outil Crop (#9754)")
        session.toggleEditTool(.crop)
        XCTAssertEqual(session.editTool, .crop)
        XCTAssertEqual(session.editPanel, .presets)
        XCTAssertTrue(session.showsCropBrackets)
        session.toggleFamily(.filters)
        XCTAssertNil(session.editTool, "ouvrir une bande replie l'outil")
        XCTAssertEqual(session.editPanel, .band)
        XCTAssertFalse(session.showsCropBrackets)
        session.toggleEditTool(.crop)
        XCTAssertNil(session.openFamily, "et l'inverse")
        session.toggleEditTool(.crop)
        XCTAssertNil(session.editTool, "retoucher Crop masque les équerres")
        XCTAssertFalse(session.showsCropBrackets)
        session.toggleEditTool(.crop)
        session.cancelEditing()
        XCTAssertNil(session.editTool)
    }

    func test_setEditAspect_whileTheRenderRuns_changesNothing() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        let avant = session.editAspect
        session.isRenderingLook = true
        session.setEditAspect(1.5)
        session.applyCropPreset(.landscape)
        XCTAssertEqual(session.editAspect, avant, "ce qui part est ce qu'on voyait en validant")
    }

    func test_editScreen_mountsTheSceneOnTheFloor_withCornerBrackets_andOnlyThreeTools() throws {
        let montage = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureMount.swift")
        XCTAssertTrue(montage.contains("ComposerEditScene.area("), "les deux couches lisent la même zone")
        XCTAssertTrue(montage.contains("ComposerEditScene.rect("))
        XCTAssertTrue(montage.contains("marges.safeAreaInsets"), "la couche de l'image retrouve les marges qu'elle ignore")
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCropBrackets("), "quatre crochets aux angles de la scène")
        XCTAssertTrue(chrome.contains("session.setEditAspect("))
        let crochets = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCropBrackets.swift")
        XCTAssertTrue(crochets.contains("ComposerEditScene.cropped("), "le geste passe par la règle")
        XCTAssertTrue(crochets.contains("MeeshyControlSize.tapTarget"), "chaque crochet est une cible de 44 pt")
        XCTAssertTrue(crochets.contains("lineCap: .round"), "des crochets arrondis")
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("ComposerCropPresetBar("), "les proportions par presets, après les cadres")
        XCTAssertTrue(bas.contains("onTool: { session.toggleEditTool($0) }"))
        let apercu = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("ComposerCapturePlacement.radius(for: size, editing: session.phase.isEditing)"),
                      "la scène de retouche a des coins arrondis")
        XCTAssertEqual(ComposerCapturePlacement.radius(for: .fullScreen, editing: true), ComposerSceneCameraFrame.cardRadius)
        XCTAssertEqual(ComposerCapturePlacement.radius(for: .fullScreen, editing: false), 0)
        XCTAssertEqual(ComposerCapturePlacement.radius(for: .card, editing: false), ComposerSceneCameraFrame.cardRadius)
    }

    func test_trimTrack_showsItsBoundsToTheMillisecond_andWearsOneRoundedFrame() throws {
        let piste = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerTrimTrack.swift")
        XCTAssertTrue(piste.contains("private var bounds: some View {"), "les bornes se lisent en permanence")
        XCTAssertGreaterThanOrEqual(piste.components(separatedBy: "ComposerTrimRule.millisecondText(").count - 1, 5)
        XCTAssertTrue(piste.contains("UnevenRoundedRectangle("), "les poignées ferment un cadre arrondi d'un seul tenant")
        XCTAssertFalse(piste.contains("chevron.compact"), "une prise sobre, pas un chevron")
        XCTAssertTrue(piste.contains("ComposerTrimRule.preciseTime("), "l'appui long de précision reste")
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

    // MARK: - Ce que la capture écrit dans Photos (#9684)

    static let automatic = CaptureSavePolicy(savesOriginal: false, renderedMode: .automatic)

    func test_savePolicy_byDefault_keepsTheOriginalOut_andSavesTheRenderOnDemand() {
        let politique = CaptureSavePolicy.stored(in: Self.emptyDefaults())
        XCTAssertEqual(politique, .standard)
        XCTAssertFalse(politique.savesOriginal, "par défaut, l'original ne rejoint pas Photos")
        XCTAssertEqual(politique.renderedMode, .manual, "par défaut, la flèche ⬇︎ enregistre le rendu")
        XCTAssertFalse(politique.savesRenderOnFinish(alreadySaved: false), "« Terminé » n'enregistre rien de lui-même")
        XCTAssertTrue(politique.writesUntouchedTake, "une prise sans effet s'écrit : l'original n'y est pas")
    }

    func test_savePolicy_readsTheUserSettings() {
        let reglages = Self.emptyDefaults()
        reglages.set(true, forKey: CaptureSavePolicy.savesOriginalKey)
        reglages.set(CaptureRenderedSaveMode.automatic.rawValue, forKey: CaptureSavePolicy.renderedModeKey)
        let politique = CaptureSavePolicy.stored(in: reglages)
        XCTAssertTrue(politique.savesOriginal)
        XCTAssertEqual(politique.renderedMode, .automatic)
        XCTAssertTrue(politique.savesRenderOnFinish(alreadySaved: false))
        XCTAssertFalse(politique.savesRenderOnFinish(alreadySaved: true), "jamais deux fois la même prise")
        XCTAssertFalse(politique.writesUntouchedTake, "l'original y est déjà : une prise sans effet ne se double pas")
    }

    func test_savePolicy_unknownStoredMode_fallsBackToManual() {
        let reglages = Self.emptyDefaults()
        reglages.set("plus-tard", forKey: CaptureSavePolicy.renderedModeKey)
        XCTAssertEqual(CaptureSavePolicy.stored(in: reglages).renderedMode, .manual)
    }

    func test_session_readsItsPolicyFromItsDefaults() {
        let reglages = Self.emptyDefaults()
        reglages.set(true, forKey: CaptureSavePolicy.savesOriginalKey)
        let session = ComposerCaptureSession(stage: .armed, defaults: reglages, gallery: MockComposerGallery())
        XCTAssertTrue(session.savePolicy().savesOriginal)
    }

    func test_finishEditingPhoto_byDefault_deliversWithoutSaving() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { .standard })
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 30, height: 40)))
        session.look = ComposerPhotoLook(filter: .cool)
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis != nil }
        XCTAssertNotNil(remis, "la prise part vers la scène : rien ne disparaît")
        XCTAssertEqual(galerie.saveImageCount, 0, "par défaut, « Terminé » n'écrit rien dans Photos")
    }

    func test_saveTakeToPhotos_photo_savesTheRenderOnce_andStaysInEditing() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { .standard })
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 30, height: 40)))
        session.look = ComposerPhotoLook(filter: .warm)
        session.saveTakeToPhotos()
        XCTAssertEqual(session.takeSaveState, .saving)
        session.saveTakeToPhotos()
        await ComposerCaptureTakesTests.waitUntil { session.takeSaveState == .saved }
        session.saveTakeToPhotos()
        try? await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(galerie.saveImageCount, 1, "une prise ne s'enregistre qu'une fois")
        XCTAssertEqual(session.takeSaveState, .saved)
        XCTAssertEqual(session.phase, .editing(.photo), "la flèche ne quitte pas la retouche")
    }

    func test_saveTakeToPhotos_thenFinish_inAutomaticMode_neverWritesTwice() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { Self.automatic })
        var remis = false
        session.onDeliver = { _ in remis = true }
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 30, height: 40)))
        session.saveTakeToPhotos()
        session.finishEditing()
        XCTAssertFalse(session.isRenderingLook, "« Terminé » attend la fin de l'enregistrement")
        await ComposerCaptureTakesTests.waitUntil { session.takeSaveState == .saved }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis }
        XCTAssertEqual(galerie.saveImageCount, 1, "la flèche puis « Terminé » : une seule écriture")
        XCTAssertEqual(session.takeSaveState, .idle, "la prise suivante repart avec sa flèche")
    }

    func test_saveTakeToPhotos_refused_offersTheArrowAgain() async {
        let galerie = MockComposerGallery(imageResult: false)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { .standard })
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 30, height: 40)))
        session.saveTakeToPhotos()
        await ComposerCaptureTakesTests.waitUntil { galerie.saveImageCount == 1 && session.takeSaveState != .saving }
        XCTAssertEqual(session.takeSaveState, .idle, "un refus de Photos laisse la flèche disponible")
    }

    func test_saveTakeToPhotos_whileCapturing_doesNothing() {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { .standard })
        session.saveTakeToPhotos()
        XCTAssertEqual(session.takeSaveState, .idle)
    }

    func test_saveTakeToPhotos_untouchedVideo_byDefault_writesTheTake() async {
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { .standard },
                                             loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.saveTakeToPhotos()
        await ComposerCaptureTakesTests.waitUntil { session.takeSaveState == .saved }
        XCTAssertEqual(galerie.saveVideoCount, 1, "sans effet ni cadre, l'original rejoint Photos")
    }

    func test_saveTakeToPhotos_untouchedVideo_originalAlreadySaved_writesNothingMore() async {
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie,
                                             savePolicy: { CaptureSavePolicy(savesOriginal: true, renderedMode: .manual) },
                                             loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.saveTakeToPhotos()
        await ComposerCaptureTakesTests.waitUntil { session.takeSaveState == .saved }
        XCTAssertEqual(galerie.saveVideoCount, 0, "l'original y est déjà : la prise est dans Photos")
    }

    func test_finishEditingVideo_untouched_automatic_withoutOriginal_writesTheTake() async {
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { Self.automatic },
                                             loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        var remis = false
        session.onDeliver = { _ in remis = true }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis }
        XCTAssertEqual(galerie.saveVideoCount, 1, "l'original n'étant pas en galerie, la prise s'y écrit")
    }

    /// #9684 : ✕ pendant l'écriture de la flèche ne la perd pas — elle va au
    /// bout, se dit par un bandeau, et le fichier ne part qu'après elle.
    func test_saveTakeToPhotos_video_thenCancel_finishesTheWrite_andSaysIt() async throws {
        FeedbackToastManager.shared.clearAll()
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { .standard },
                                             loopPlayerFactory: { _ in lecteur })
        let url = try Self.writtenClip()
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        await session.beginEditing(video: url)
        session.saveTakeToPhotos()
        session.cancelEditing()
        XCTAssertEqual(session.phase, .capturing, "la croix quitte la retouche aussitôt")
        await ComposerCaptureTakesTests.waitUntil { galerie.saveVideoCount == 1 && session.takeWrite == nil }
        XCTAssertEqual(galerie.saveVideoCount, 1, "l'écriture lancée va jusqu'au bout")
        XCTAssertEqual(FeedbackToastManager.shared.currentToast?.message, ComposerCaptureCopy.savedToPhotos,
                       "la flèche n'est plus là : un bandeau le dit")
        await ComposerCaptureTakesTests.waitUntil { !FileManager.default.fileExists(atPath: url.path) }
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path), "le fichier part après l'écriture")
    }

    func test_saveTakeToPhotos_renderFails_afterCancel_saysIt() async throws {
        FeedbackToastManager.shared.clearAll()
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, savePolicy: { .standard },
                                             loopPlayerFactory: { _ in lecteur })
        let url = try Self.writtenClip()
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        await session.beginEditing(video: url)
        session.look = ComposerPhotoLook(filter: .cool)
        session.saveTakeToPhotos()
        session.cancelEditing()
        await ComposerCaptureTakesTests.waitUntil(timeout: 30) { session.takeWrite == nil }
        XCTAssertEqual(galerie.saveVideoCount, 0)
        XCTAssertEqual(FeedbackToastManager.shared.currentToast?.message, ComposerCaptureCopy.saveToPhotosFailed,
                       "jamais un échec silencieux")
    }

    /// La caméra n'écrit plus le brut sans que le réglage le demande : chacune de
    /// ses trois écritures (photo, vidéo, repli du dernier segment) le consulte.
    func test_cameraModel_writesTheOriginalOnlyWhenThePolicySaysSo() throws {
        let camera = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Components/CameraModel.swift")
        let ecritures = camera.components(separatedBy: "PhotoLibraryManager.shared.save").count - 1
        let gardes = camera.components(separatedBy: "CaptureSavePolicy.stored().savesOriginal").count - 1
        XCTAssertEqual(ecritures, 3)
        XCTAssertEqual(gardes, ecritures, "chaque écriture du brut passe par la politique")
    }

    func test_cameraBar_offersTheSaveArrow_wiredToTheSession() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("onSave: { session.saveTakeToPhotos() }"))
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("arrow.down.to.line"))
        XCTAssertTrue(barre.contains("MeeshyControlSize.tapTarget"))
        XCTAssertFalse(ComposerCaptureCopy.saveToPhotos.isEmpty)
        XCTAssertFalse(ComposerCaptureCopy.savingToPhotos.isEmpty)
    }

    private static func emptyDefaults() -> UserDefaults {
        let nom = "capture-save-\(UUID().uuidString)"
        let reglages = UserDefaults(suiteName: nom) ?? .standard
        reglages.removePersistentDomain(forName: nom)
        return reglages
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
