import XCTest
@testable import Meeshy

/// **Deux intentions de prise** (#9351, spec § 3.1 / § 3.4) : la scène mène à
/// l'édition (puis à l'hôte), la miniature choisie part en galerie, brut ET rendu,
/// sans changer de phase ni retenir de segment.
@MainActor
final class ComposerCaptureTakesTests: XCTestCase {

    override func setUp() async throws {
        FeedbackToastManager.shared.clearAll()
    }

    func test_photoArrived_galleryIntent_savesTheRendered_andDeliversNothing() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        session.photoIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { galerie.saveImageCount == 1 && session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveImageCount, 1, "le RENDU part en galerie (le brut y est déjà, par CameraModel)")
        XCTAssertEqual(remis, 0, "on reste en capture")
        XCTAssertEqual(session.stage, .armed)
        XCTAssertEqual(session.photoIntent, .edit, "l'intention ne vaut que pour UNE prise")
        XCTAssertEqual(FeedbackToastManager.shared.currentToast?.message, ComposerCaptureCopy.savedToPhotos)
    }

    /// Décision porteur (#9351) : brut ET rendu partent TOUJOURS ensemble — sans
    /// effet, le rendu reste le canevas 9:16 qu'on voyait, distinct du brut.
    func test_photoArrived_galleryIntent_untouchedLook_stillSavesTheRendered() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.photoIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { galerie.saveImageCount == 1 && session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveImageCount, 1, "le rendu part avec le brut, même sans effet")
        XCTAssertEqual(session.photoIntent, .edit)
    }

    func test_saveRenderedPhoto_galleryRefuses_staysCapturingAndSaysNothingSaved() async {
        let galerie = MockComposerGallery(imageResult: false)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.photoIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { galerie.saveImageCount == 1 && session.pendingGallerySaves == 0 }
        XCTAssertEqual(session.stage, .armed)
        XCTAssertEqual(session.pendingGallerySaves, 0)
        XCTAssertFalse(session.isRenderingLook)
        XCTAssertNotEqual(FeedbackToastManager.shared.currentToast?.message, ComposerCaptureCopy.savedToPhotos,
                          "un enregistrement refusé ne se dit jamais « enregistré »")
    }

    func test_photoArrived_editIntent_deliversTheLookedPhoto() async {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.look = ComposerPhotoLook(filter: .warm)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        Self.publishPhoto(on: session)
        await Self.waitUntil { remis != nil }
        guard case .photo(let image, _)? = remis else { return XCTFail("la photo de la scène part vers l'hôte") }
        XCTAssertEqual(image.size.width / image.size.height, 9.0 / 16.0, accuracy: 0.01,
                       "elle part regardée, sur le canevas 9:16")
    }

    func test_photoArrived_editIntent_rawDelivery_handsTheTakeUntouched() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.look = ComposerPhotoLook(filter: .warm)
        session.deliversRawPhoto = true
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        Self.publishPhoto(on: session)
        guard case .photo(let image, _)? = remis else { return XCTFail("la porte qui revoit reçoit la prise") }
        XCTAssertTrue(image === session.camera.capturedPhoto, "la revue applique le look elle-même : jamais deux fois")
    }

    func test_photoArrived_afterDisarm_deliversNothing() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.deliversRawPhoto = true
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        session.disarm()
        Self.publishPhoto(on: session)
        XCTAssertEqual(remis, 0)
        XCTAssertNil(session.onDeliver, "un viseur fermé ne remet plus rien à son hôte")
    }

    func test_photographWhenReady_afterAGalleryRequest_takesForEdit() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.shootPhoto(intent: .gallery)
        XCTAssertEqual(session.photoIntent, .gallery)
        session.photographWhenReady()
        XCTAssertEqual(session.photoIntent, .edit, "la demande suivante de la scène ne part pas en galerie")
    }

    func test_perform_filmToGallery_cancelledBeforeFilming_leavesNoGalleryIntent() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.perform(.filmToGallery, item: nil)
        XCTAssertEqual(session.filmIntent, .gallery)
        session.endHold()
        XCTAssertEqual(session.filmIntent, .edit, "une tenue levée avant de filmer ne lègue pas son intention")
        session.beginHold()
        XCTAssertEqual(session.filmIntent, .edit, "l'appui long de la scène filme un segment")
    }

    func test_videoArrived_galleryIntent_keepsNoSegment() async throws {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.filmIntent = .gallery
        session.noteRecordingStarted()
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = UUID().uuidString
        await Self.waitUntil { session.pendingGallerySaves == 0 }
        XCTAssertTrue(session.segments.isEmpty, "une vidéo vers la galerie n'est jamais un segment")
        XCTAssertEqual(session.filmIntent, .edit)
        XCTAssertTrue(session.filmIntents.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path), "le brut est en galerie : le temporaire part")
    }

    func test_videoArrived_intentsAreMatchedInRecordingOrder() throws {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.filmIntent = .gallery
        session.noteRecordingStarted()
        session.filmIntent = .edit
        session.noteRecordingStarted()
        let versGalerie = try Self.tempFile(), segment = try Self.tempFile()
        session.camera.capturedVideoURL = versGalerie
        session.camera.capturedVideoId = UUID().uuidString
        session.camera.capturedVideoURL = segment
        session.camera.capturedVideoId = UUID().uuidString
        XCTAssertEqual(session.segments.map(\.url), [segment],
                       "un segment lancé avant l'arrivée du fichier galerie ne lui vole pas son intention")
    }

    func test_videoArrived_editIntent_isASegment() throws {
        let session = ComposerCaptureSession(stage: .armed)
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = UUID().uuidString
        XCTAssertEqual(session.segments.map(\.url), [url])
    }

    func test_videoArrived_afterDisarm_discardsFileAndKeepsNoSegment() throws {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.filmIntent = .gallery
        session.noteRecordingStarted()
        session.disarm()
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = UUID().uuidString
        XCTAssertTrue(session.segments.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path), "le brut est déjà en galerie : le fichier temporaire part")
        XCTAssertEqual(galerie.saveVideoCount, 0)
    }

    func test_perform_select_combinesWithTheCurrentLook() {
        let session = ComposerCaptureSession(stage: .armed)
        session.look = ComposerPhotoLook(filter: .vivid)
        session.perform(.select, item: .frame(.montage(.classic(.polaroid))))
        XCTAssertEqual(session.look, ComposerPhotoLook(filter: .vivid, frame: .montage(.classic(.polaroid))))
    }

    func test_hostsNoLongerObserveTheCamera_theSessionDoes() throws {
        for fichier in ["ComposerViewfinder.swift", "MeeshyComposerHost+Surfaces.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            XCTAssertFalse(code.contains("$capturedPhotoId"), "\(fichier) : la session reçoit les prises, une fois")
            XCTAssertFalse(code.contains("$capturedVideoId"), "\(fichier)")
        }
        let prises = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift")
        XCTAssertTrue(prises.contains("camera.$capturedPhotoId"))
        XCTAssertTrue(prises.contains("camera.$capturedVideoId"))
        let machine = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(machine.contains("noteRecordingStarted()"), "chaque enregistrement PARTI pose son intention")
    }

    // MARK: - Outils

    static func publishPhoto(on session: ComposerCaptureSession) {
        let contexte = CGContext(data: nil, width: 30, height: 40, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.4, green: 0.6, blue: 0.2, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 30, height: 40))
        session.camera.capturedPhoto = UIImage(cgImage: contexte.makeImage()!)
        session.camera.capturedPhotoId = UUID().uuidString
    }

    static func tempFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("prise_\(UUID().uuidString).mov")
        try Data([0, 1, 2]).write(to: url)
        return url
    }

    static func waitUntil(timeout: TimeInterval = 10, _ condition: @MainActor () -> Bool) async {
        let limite = Date().addingTimeInterval(timeout)
        while !condition(), Date() < limite {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}

final class MockComposerGallery: ComposerGalleryProviding, @unchecked Sendable {
    private let imageResult: Bool
    private let videoResult: Bool
    private(set) var saveImageCount = 0
    private(set) var saveVideoCount = 0

    nonisolated deinit {}

    init(imageResult: Bool = true, videoResult: Bool = true) {
        self.imageResult = imageResult
        self.videoResult = videoResult
    }

    @concurrent
    func saveImage(_ data: Data) async -> Bool {
        saveImageCount += 1
        return imageResult
    }

    @concurrent
    func saveVideo(at url: URL) async -> Bool {
        saveVideoCount += 1
        return videoResult
    }
}
