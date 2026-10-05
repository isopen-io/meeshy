import CoreGraphics
import XCTest
@testable import Meeshy

/// LES CADRES DANS LE MONTAGE (#8742, #8743) — un cadre choisi passe par `CallFrameRenderer`
/// (aperçu, photo, film), ses vignettes ne se rendent que pour la fenêtre visible et vivent dans
/// un cache borné, et le choix suit le nombre de personnes.
@MainActor
final class CallCaptureControllerFramesTests: XCTestCase {

    private func makeImage(width: Int = 64, height: Int = 96) -> CGImage {
        let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )!
        context.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.9, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage()!
    }

    private func makeSubjects(_ count: Int) -> [CallCaptureSubject] {
        let people = [
            CallCaptureSubject(id: "local", name: "Vous", handle: "awa", isSelf: true, isMirrored: true, showsVideo: true),
            CallCaptureSubject(id: "karim", name: "Karim", handle: "karim_k", isMirrored: false, showsVideo: true),
            CallCaptureSubject(id: "lina", name: "Lina", isMirrored: false, showsVideo: false),
            CallCaptureSubject(id: "tomas", name: "Tomás", isMirrored: false, showsVideo: true)
        ]
        return Array(people.prefix(count))
    }

    private lazy var snapshot = CallFrameSnapshot(images: ["local": makeImage(), "karim": makeImage(), "lina": makeImage(), "tomas": makeImage()])

    private func makeSUT(people: Int = 3, cache: CallFrameThumbnailCache = CallFrameThumbnailCache()) -> (sut: CallCaptureController, saver: FramesMockSaver) {
        let grabber = FramesMockGrabber()
        grabber.snapshotResult = snapshot
        let saver = FramesMockSaver()
        let sut = CallCaptureController(
            grabber: grabber,
            saver: saver,
            faceLocator: FramesMockFaceLocator(),
            recorder: FramesMockRecorder(),
            frameThumbnails: cache,
            now: { Date(timeIntervalSince1970: 1_790_000_000) }
        )
        sut.update(subjects: makeSubjects(people), tracks: [:])
        return (sut, saver)
    }

    private func firstFrame(forPeople people: Int) throws -> CallFrameDesign {
        try XCTUnwrap(CallFrameCatalogue.frames(forPeople: people).first)
    }

    // MARK: - Choisir un cadre

    func test_selectChoice_frame_isTheChoice_andKeepsTheLastClassic() throws {
        let (sut, _) = makeSUT()
        let frame = try firstFrame(forPeople: 3)
        sut.select(.polaroid)

        sut.select(choice: .frame(frame.id))

        XCTAssertEqual(sut.choice, .frame(frame.id))
        XCTAssertEqual(sut.frameId, frame.id)
        XCTAssertEqual(sut.style, .polaroid)
    }

    func test_selectClassic_afterAFrame_leavesTheFrame() throws {
        let (sut, _) = makeSUT()
        let frame = try firstFrame(forPeople: 3)
        sut.select(choice: .frame(frame.id))
        sut.select(.heart)
        XCTAssertNil(sut.frameId)
        XCTAssertEqual(sut.choice, .classic(.heart))
    }

    func test_refreshPreviews_frame_rendersThePreviewThroughTheFramePainter_notTheClassics() async throws {
        let (sut, _) = makeSUT()
        let frame = try firstFrame(forPeople: 3)
        sut.select(choice: .frame(frame.id))

        await sut.refreshPreviews()

        let preview = try XCTUnwrap(sut.preview)
        let expected = try XCTUnwrap(CallFrameRenderer.render(
            frame: frame,
            portraits: sut.framePortraits(from: snapshot),
            texts: sut.frameTexts,
            size: CallCaptureController.previewCanvas
        ))
        XCTAssertEqual(preview.height, Int(CallCaptureController.previewCanvas.height))
        XCTAssertEqual(preview.dataProvider?.data.map { $0 as Data }, expected.dataProvider?.data.map { $0 as Data }, "L'aperçu est le cadre, peint par CallFrameRenderer")
        XCTAssertTrue(sut.thumbnails.isEmpty, "Le carrousel des classiques n'est pas affiché : aucune vignette classique ne se rend")
    }

    func test_captureLook_frame_isTheCatalogueDesign_unknownFallsBackToTheClassic() throws {
        let (sut, _) = makeSUT()
        let frame = try firstFrame(forPeople: 3)
        sut.select(.gold)
        XCTAssertEqual(sut.captureLook(for: .frame(frame.id)), .frame(frame))
        XCTAssertEqual(sut.captureLook(for: .frame("inconnu.motif.duo")), .classic(.gold))
    }

    // MARK: - Vignettes : la fenêtre visible, un cache borné

    func test_refreshPreviews_frame_rendersOnlyTheWindowAroundTheSelectedFrame() async throws {
        let (sut, _) = makeSUT()
        let frame = try firstFrame(forPeople: 3)
        sut.select(choice: .frame(frame.id))
        let window = sut.frameWindow(for: sut.choice)

        await sut.refreshPreviews()

        XCTAssertFalse(window.isEmpty)
        XCTAssertLessThanOrEqual(window.count, 2 * CallCaptureController.thumbnailRadius + 1)
        window.forEach { XCTAssertNotNil(sut.frameThumbnail($0.id), $0.id) }
        XCTAssertEqual(sut.frameThumbnail(frame.id)?.width, Int(CallCaptureController.thumbnailCanvas.width))
        let elsewhere = CallFrameCatalogue.frames(forPeople: 3).filter { $0.mood != frame.mood }
        XCTAssertFalse(elsewhere.isEmpty)
        elsewhere.forEach { XCTAssertNil(sut.frameThumbnail($0.id), $0.id) }
    }

    func test_frameWindow_isTheMoodFramesForN_centredOnTheSelection() throws {
        let (sut, _) = makeSUT()
        let mood = try XCTUnwrap(CallFrameCatalogue.moods(forPeople: 3).first)
        let frames = CallFrameCatalogue.frames(forPeople: 3, mood: mood)
        let selected = try XCTUnwrap(frames.last)
        sut.select(choice: .frame(selected.id))

        let ids = sut.frameWindow(for: sut.choice).map(\.id)

        XCTAssertEqual(ids, CallCaptureController.thumbnailWindow(around: selected.id, in: frames.map(\.id), radius: CallCaptureController.thumbnailRadius))
    }

    func test_frameWindow_classicChoice_isEmpty() {
        let (sut, _) = makeSUT()
        XCTAssertTrue(sut.frameWindow(for: .classic(.screen)).isEmpty)
    }

    func test_thumbnailWindow_anyItems_staysWithinTheRadius() {
        let items = ["a", "b", "c", "d", "e"]
        XCTAssertEqual(CallCaptureController.thumbnailWindow(around: "c", in: items, radius: 1), ["b", "c", "d"])
        XCTAssertEqual(CallCaptureController.thumbnailWindow(around: "a", in: items, radius: 3), ["a", "b", "c", "d"])
        XCTAssertEqual(CallCaptureController.thumbnailWindow(around: "z", in: items, radius: 1), ["a", "b"])
        XCTAssertTrue(CallCaptureController.thumbnailWindow(around: "a", in: [String](), radius: 3).isEmpty)
    }

    func test_thumbnailCache_keysByFrameAndCountAndSize() {
        let cache = CallFrameThumbnailCache()
        cache.store(makeImage(), frameId: "signature.aurore.duo", people: 2, size: CGSize(width: 108, height: 192))
        XCTAssertNotNil(cache.image(frameId: "signature.aurore.duo", people: 2, size: CGSize(width: 108, height: 192)))
        XCTAssertNil(cache.image(frameId: "signature.aurore.duo", people: 3, size: CGSize(width: 108, height: 192)))
        XCTAssertNil(cache.image(frameId: "signature.aurore.duo", people: 2, size: CGSize(width: 540, height: 960)))
        cache.removeAll()
        XCTAssertNil(cache.image(frameId: "signature.aurore.duo", people: 2, size: CGSize(width: 108, height: 192)))
    }

    func test_stop_emptiesTheFrameThumbnails() async throws {
        let cache = CallFrameThumbnailCache()
        let (sut, _) = makeSUT(cache: cache)
        let frame = try firstFrame(forPeople: 3)
        sut.select(choice: .frame(frame.id))
        await sut.refreshPreviews()
        XCTAssertNotNil(sut.frameThumbnail(frame.id))

        sut.stop()

        XCTAssertNil(cache.image(frameId: frame.id, people: 3, size: CallCaptureController.thumbnailCanvas))
    }

    // MARK: - Capturer et filmer un cadre

    func test_capture_frame_savesOneFullHDPortrait() async throws {
        let (sut, saver) = makeSUT()
        let frame = try firstFrame(forPeople: 3)
        sut.select(choice: .frame(frame.id))

        await sut.capture()

        XCTAssertEqual(sut.status, .saved)
        XCTAssertEqual(saver.saved.first?.width, 1080)
        XCTAssertEqual(saver.saved.first?.height, 1920)
    }

    func test_capture_fixedStyle_ignoresTheSelectedFrame() async throws {
        let (sut, saver) = makeSUT()
        let frame = try firstFrame(forPeople: 3)
        sut.select(choice: .frame(frame.id))

        await sut.capture(style: .screen)

        XCTAssertEqual(saver.saved.count, 1)
        XCTAssertEqual(sut.frameId, frame.id)
    }

    // MARK: - Qui est dans le cadre

    func test_framePortraits_carryIdentity_andCameraOffKeepsItsSlot() {
        let (sut, _) = makeSUT()
        let portraits = sut.framePortraits(from: CallFrameSnapshot(images: ["local": makeImage(), "karim": makeImage(), "lina": makeImage()]))

        XCTAssertEqual(portraits.map(\.id), ["local", "karim", "lina"])
        XCTAssertEqual(portraits.map(\.handle), ["awa", "karim_k", nil])
        XCTAssertEqual(portraits.map(\.isSelf), [true, false, false])
        XCTAssertNotNil(portraits[0].image)
        XCTAssertNil(portraits[2].image, "Caméra coupée : la case reste, avec l'initiale")
    }

    // MARK: - Les puces et le nombre de personnes

    func test_show_mood_selectsItsFirstFrame_thenClassicsReturnsToTheLastClassic() throws {
        let (sut, _) = makeSUT()
        let mood = try XCTUnwrap(CallFrameCatalogue.moods(forPeople: 3).first)
        let first = try XCTUnwrap(CallFrameCatalogue.frames(forPeople: 3, mood: mood).first)
        sut.select(.film)

        sut.show(.mood(mood), people: 3)
        XCTAssertEqual(sut.choice, .frame(first.id))

        sut.show(.classics, people: 3)
        XCTAssertEqual(sut.choice, .classic(.film))
    }

    func test_reconcileFrame_peopleChange_takesTheSameMotifInTheNewBucket() throws {
        let all = CallFrameCatalogue.all
        let duo = try XCTUnwrap(all.first { duo in
            duo.bucket == .duo && all.contains { $0.motif == duo.motif && $0.bucket == .comite }
        })
        let comite = try XCTUnwrap(all.first { $0.motif == duo.motif && $0.bucket == .comite })
        let (sut, _) = makeSUT(people: 2)
        sut.select(choice: .frame(duo.id))

        sut.update(subjects: makeSubjects(3), tracks: [:])
        sut.reconcileFrame()

        XCTAssertEqual(sut.choice, .frame(comite.id))
    }

    func test_reconcileFrame_nobodyServed_fallsBackToTheFirstClassic() throws {
        let (sut, _) = makeSUT(people: 2)
        let frame = try firstFrame(forPeople: 2)
        sut.select(choice: .frame(frame.id))

        sut.update(subjects: makeSubjects(1), tracks: [:])
        sut.reconcileFrame()

        XCTAssertEqual(sut.choice, .classic(.screen))
    }

    func test_setFrameTexts_replacesWhatTheFrameWrites() {
        let (sut, _) = makeSUT()
        let texts = CallFrameTexts(groupName: "Les Copains", isGroup: true, date: "29 sept. 2026", accentHex: nil)
        sut.setFrameTexts(texts)
        XCTAssertEqual(sut.frameTexts, texts)
    }
}

private final class FramesMockGrabber: CallFrameGrabbing, @unchecked Sendable {
    var snapshotResult = CallFrameSnapshot.empty

    func attach(track: Any?, id: String, isMirrored: Bool) {}

    func keepOnly(_ ids: Set<String>) {}

    func detachAll() {}

    func snapshot(maxDimension: CGFloat?) async -> CallFrameSnapshot {
        snapshotResult
    }
}

@MainActor
private final class FramesMockSaver: CallCapturePhotoSaving {
    private(set) var saved: [CGImage] = []

    func requestAccess() async -> Bool {
        true
    }

    func save(_ image: CGImage) async -> Bool {
        saved.append(image)
        return true
    }

    func saveVideo(at url: URL) async -> Bool {
        true
    }
}

@MainActor
private final class FramesMockRecorder: CallMontageRecordingProviding {
    func start(canvas: CGSize) throws {}

    func append(_ frame: CGImage) {}

    func finish() async -> URL? {
        nil
    }

    func cancel() {}
}

private final class FramesMockFaceLocator: CallFaceLocating, @unchecked Sendable {
    func faceRect(in image: CGImage) -> CGRect? {
        nil
    }
}
