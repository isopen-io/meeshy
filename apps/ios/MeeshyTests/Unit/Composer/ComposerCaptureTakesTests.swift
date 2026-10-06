import AVFoundation
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
        session.photoInFlightIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { galerie.saveImageCount == 1 && session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveImageCount, 1, "le RENDU part en galerie (le brut y est déjà, par CameraModel)")
        XCTAssertEqual(remis, 0, "on reste en capture")
        XCTAssertEqual(session.stage, .armed)
        XCTAssertEqual(session.photoInFlightIntent, .edit, "l'intention ne vaut que pour UNE prise")
        XCTAssertEqual(FeedbackToastManager.shared.currentToast?.message, ComposerCaptureCopy.savedToPhotos)
    }

    /// Décision porteur (#9351) : brut ET rendu partent TOUJOURS ensemble — sans
    /// effet, le rendu reste le canevas 9:16 qu'on voyait, distinct du brut.
    func test_photoArrived_galleryIntent_untouchedLook_stillSavesTheRendered() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.photoInFlightIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { galerie.saveImageCount == 1 && session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveImageCount, 1, "le rendu part avec le brut, même sans effet")
        XCTAssertEqual(session.photoInFlightIntent, .edit)
    }

    func test_saveRenderedPhoto_galleryRefuses_staysCapturingAndSaysNothingSaved() async {
        let galerie = MockComposerGallery(imageResult: false)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.photoInFlightIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { galerie.saveImageCount == 1 && session.pendingGallerySaves == 0 }
        XCTAssertEqual(session.stage, .armed)
        XCTAssertEqual(session.pendingGallerySaves, 0)
        XCTAssertFalse(session.isRenderingLook)
        XCTAssertNil(FeedbackToastManager.shared.currentToast, "un enregistrement refusé ne se dit jamais « enregistré »")
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

    func test_photographWhenReady_afterAGalleryRequest_takesForEdit() async {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, controls: objectif, gallery: MockComposerGallery())
        session.shootPhoto(intent: .gallery)
        session.photographWhenReady()
        await Self.waitUntil(timeout: 2) { !objectif.photoFlashes.isEmpty }
        XCTAssertEqual(objectif.photoFlashes.count, 1, "la seconde demande remplace la première")
        XCTAssertEqual(session.photoInFlightIntent, .edit, "la demande suivante de la scène ne part pas en galerie")
    }

    /// m-a : une attente « galerie » annulée par un appui long ne lègue rien au ( o ).
    func test_cancelledGalleryWait_leavesNothingForTheShutter() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, controls: objectif, gallery: MockComposerGallery())
        objectif.isSwitchingCamera = true
        session.shootPhoto(intent: .gallery)
        session.beginHold()
        session.endHold()
        objectif.isSwitchingCamera = false
        session.takePhoto()
        XCTAssertEqual(objectif.photoFlashes.count, 1)
        XCTAssertEqual(session.photoInFlightIntent, .edit)
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
        session.bindRecording(.gallery, to: "prise")
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = "prise"
        await Self.waitUntil { session.pendingGallerySaves == 0 }
        XCTAssertTrue(session.segments.isEmpty, "une vidéo vers la galerie n'est jamais un segment")
        XCTAssertTrue(session.filmIntents.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path), "le brut est en galerie : le temporaire part")
    }

    func test_videoArrived_twoCloseTakes_keepTheirOwnIntent() throws {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.bindRecording(.gallery, to: "galerie")
        session.bindRecording(.edit, to: "segment")
        let versGalerie = try Self.tempFile(), segment = try Self.tempFile()
        session.camera.capturedVideoURL = segment
        session.camera.capturedVideoId = "segment"
        session.camera.capturedVideoURL = versGalerie
        session.camera.capturedVideoId = "galerie"
        XCTAssertEqual(session.segments.map(\.url), [segment],
                       "chaque fichier retrouve l'intention de SON enregistrement, quel que soit l'ordre d'arrivée")
    }

    func test_videoArrived_afterAnAbandonedRecording_isNotShifted() throws {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.bindRecording(.gallery, to: "ratée")
        session.camera.abandonedRecordingId = "ratée"
        session.bindRecording(.edit, to: "segment")
        let segment = try Self.tempFile()
        session.camera.capturedVideoURL = segment
        session.camera.capturedVideoId = "segment"
        XCTAssertEqual(session.segments.map(\.url), [segment], "une fin sans fichier ne décale pas la suivante")
        XCTAssertTrue(session.filmIntents.isEmpty)
    }

    func test_arm_forgetsOrphanIntents() {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        session.bindRecording(.gallery, to: "orpheline")
        session.photoInFlightIntent = .gallery
        session.filmIntent = .gallery
        session.arm(mode: .photo)
        XCTAssertTrue(session.filmIntents.isEmpty)
        XCTAssertEqual(session.photoInFlightIntent, .edit)
        XCTAssertEqual(session.filmIntent, .edit)
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
        session.bindRecording(.gallery, to: "prise")
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
        XCTAssertTrue(machine.contains("noteRecordingStarted()"), "chaque enregistrement PARTI fige son intention")
    }

    // MARK: - L'intention suit LA photo (I2)

    func test_takePhoto_refusedGalleryRequest_nextShutterTakesForEdit() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, controls: objectif, gallery: MockComposerGallery())
        session.deliversRawPhoto = true
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        objectif.isSwitchingCamera = true
        session.takePhoto(intent: .gallery)
        XCTAssertTrue(objectif.photoFlashes.isEmpty, "aucune prise pendant une bascule")
        XCTAssertEqual(session.photoInFlightIntent, .edit, "une demande refusée ne lègue pas son intention")
        objectif.isSwitchingCamera = false
        session.takePhoto()
        Self.publishPhoto(on: session)
        XCTAssertEqual(remis, 1, "l'obturateur suivant prend pour la scène")
    }

    func test_takePhoto_duringTheFrontFlashRamp_keepsTheInFlightIntent() async {
        let objectif = MockComposerCaptureCamera()
        objectif.currentPosition = .front
        let session = ComposerCaptureSession(stage: .armed, controls: objectif, gallery: MockComposerGallery())
        session.flash = .on
        XCTAssertTrue(session.floorIsLit)
        session.takePhoto()
        session.takePhoto(intent: .gallery)
        XCTAssertEqual(session.photoInFlightIntent, .edit, "la seconde demande n'écrase pas la photo en vol")
        await Self.waitUntil(timeout: 2) { !objectif.photoFlashes.isEmpty && !session.photoIsRamping }
        try? await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertEqual(objectif.photoFlashes, [.off], "un seul déclenchement pour la rampe")
        session.disarm()
    }

    /// m-b : la rampe ne déclenche pas dans un viseur fermé.
    func test_takePhoto_closedDuringTheRamp_takesNothing() async {
        let objectif = MockComposerCaptureCamera()
        objectif.currentPosition = .front
        let session = ComposerCaptureSession(stage: .armed, controls: objectif, gallery: MockComposerGallery())
        session.flash = .on
        session.takePhoto()
        session.disarm()
        await Self.waitUntil(timeout: 2) { !session.photoIsRamping }
        XCTAssertTrue(objectif.photoFlashes.isEmpty, "aucune photo après la fermeture")
    }

    // MARK: - Le jeton suit LE fichier (R1)

    func test_recording_aSecondTakeDuringFinalization_eachKeepsItsIntent() async throws {
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        let session = ComposerCaptureSession(stage: .armed, camera: camera, gallery: MockComposerGallery())
        camera.startRecording()
        let a = try XCTUnwrap(camera.recordingId)
        session.bindRecording(.gallery, to: a)
        camera.stopRecording()
        camera.startRecording()
        XCTAssertEqual(camera.recordingId, a, "B attend que A soit livrée")
        XCTAssertFalse(camera.isRecordingVideo)
        await Self.waitUntil(timeout: 60) { camera.recordingId == nil && session.pendingGallerySaves == 0 }
        XCTAssertTrue(session.segments.isEmpty, "le fichier de A garde l'intention de A : la galerie")
        camera.startRecording()
        let b = try XCTUnwrap(camera.recordingId)
        XCTAssertNotEqual(a, b)
        session.bindRecording(.edit, to: b)
        camera.stopRecording()
        await Self.waitUntil(timeout: 60) { session.segments.count == 1 }
        XCTAssertEqual(session.segments.count, 1, "le fichier de B garde l'intention de B : un segment")
        session.discardSegments()
    }

    func test_recording_aLateEndOfA_keepsTheIntentOfB() throws {
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        let session = ComposerCaptureSession(stage: .armed, camera: camera, gallery: MockComposerGallery())
        camera.startRecording()
        let b = try XCTUnwrap(camera.recordingId)
        session.bindRecording(.gallery, to: b)
        camera.abandonRecording(token: "prise-A")
        XCTAssertEqual(session.filmIntents[b], .gallery, "une fin tardive de A n'efface pas l'intention de B")
        XCTAssertEqual(camera.recordingId, b)
    }

    // MARK: - Brut et rendu (I3, I4, M8)

    func test_saveRenderedPhoto_rawRefused_paintsNothingAndSaysNothing() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.camera.librarySave = Task { false }
        session.photoInFlightIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveImageCount, 0, "brut refusé : aucun rendu peint ni enregistré")
        XCTAssertNil(FeedbackToastManager.shared.currentToast, "ni « Enregistré » ni son haptique")
    }

    func test_videoArrived_galleryIntent_rawRefused_rendersNothingAndSaysNothing() async throws {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.bindRecording(.gallery, to: "film")
        session.camera.librarySave = Task { false }
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = "film"
        await Self.waitUntil { session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveVideoCount, 0)
        XCTAssertNil(FeedbackToastManager.shared.currentToast)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    /// R2 : la file retient les OCTETS de la prise, décodés au moment de peindre.
    func test_saveRenderedPhoto_fromTheTakeBytes_savesTheRendered() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.photoInFlightIntent = .gallery
        session.camera.capturedPhotoData = ComposerPhotoEncodingTests.takeWithExif()
        Self.publishPhoto(on: session)
        await Self.waitUntil { session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveImageCount, 1)
        let octets = ComposerPhotoEncodingTests.takeWithExif().flatMap(ComposerCaptureSession.uprightImage)
        XCTAssertEqual(octets?.width, 30, "la prise couchée (orientation 6) est décodée debout")
    }

    func test_saveRenderedPhoto_twoTakes_areSavedOneAfterTheOther() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.photoInFlightIntent = .gallery
        Self.publishPhoto(on: session)
        session.photoInFlightIntent = .gallery
        Self.publishPhoto(on: session)
        XCTAssertEqual(session.pendingGallerySaves, 2)
        await Self.waitUntil { session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveImageCount, 2)
        XCTAssertEqual(galerie.maxConcurrentSaves, 1, "jamais deux rendus pleine définition à la fois")
    }

    func test_videoArrived_galleryIntent_realMovie_savesTheRendered() async throws {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.bindRecording(.gallery, to: "film")
        let url = try await Self.tinyMovie()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = "film"
        await Self.waitUntil(timeout: 30) { session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveVideoCount, 1, "le rendu de la vidéo part en galerie")
        XCTAssertEqual(FeedbackToastManager.shared.currentToast?.message, ComposerCaptureCopy.savedToPhotos)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    /// M8 (#9351) : sans effet, brut et rendu sont identiques au pixel près — UN fichier.
    func test_videoArrived_galleryIntent_untouchedLook_savesOneFile() async throws {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.bindRecording(.gallery, to: "film")
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = "film"
        await Self.waitUntil { session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveVideoCount, 0, "le brut enregistré par la caméra est déjà le rendu")
        XCTAssertEqual(FeedbackToastManager.shared.currentToast?.message, ComposerCaptureCopy.savedToPhotos)
    }

    // MARK: - Outils

    /// Un vrai petit film H.264 de six images, 64×112.
    static func tinyMovie() async throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("film_\(UUID().uuidString).mov")
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 64, AVVideoHeightKey: 112])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: 64, kCVPixelBufferHeightKey as String: 112])
        writer.add(input)
        XCTAssertTrue(writer.startWriting())
        writer.startSession(atSourceTime: .zero)
        for image in 0..<6 {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 5_000_000) }
            var tampon: CVPixelBuffer?
            CVPixelBufferCreate(nil, 64, 112, kCVPixelFormatType_32BGRA, nil, &tampon)
            let pixels = try XCTUnwrap(tampon)
            CVPixelBufferLockBaseAddress(pixels, [])
            memset(CVPixelBufferGetBaseAddress(pixels), Int32(30 + 30 * image), CVPixelBufferGetDataSize(pixels))
            CVPixelBufferUnlockBaseAddress(pixels, [])
            XCTAssertTrue(adaptor.append(pixels, withPresentationTime: CMTime(value: CMTimeValue(image), timescale: 30)))
        }
        input.markAsFinished()
        await withCheckedContinuation { (fin: CheckedContinuation<Void, Never>) in
            writer.finishWriting { fin.resume() }
        }
        XCTAssertEqual(writer.status, .completed)
        return url
    }

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

    static func waitUntil(timeout: TimeInterval = 10, _ condition: @escaping @MainActor () -> Bool) async {
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
    private let verrou = NSLock()
    private var images = 0
    private var videos = 0
    private var enCours = 0
    private var pointe = 0

    nonisolated deinit {}

    init(imageResult: Bool = true, videoResult: Bool = true) {
        self.imageResult = imageResult
        self.videoResult = videoResult
    }

    var saveImageCount: Int { verrou.withLock { images } }
    var saveVideoCount: Int { verrou.withLock { videos } }
    /// Le plus grand nombre d'enregistrements vus EN MÊME TEMPS.
    var maxConcurrentSaves: Int { verrou.withLock { pointe } }

    @concurrent
    func saveImage(_ data: Data) async -> Bool {
        verrou.withLock {
            images += 1
            enCours += 1
            pointe = max(pointe, enCours)
        }
        try? await Task.sleep(nanoseconds: 50_000_000)
        verrou.withLock { enCours -= 1 }
        return imageResult
    }

    @concurrent
    func saveVideo(at url: URL) async -> Bool {
        verrou.withLock { videos += 1 }
        return videoResult
    }
}
