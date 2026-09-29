import Combine
import CoreGraphics
import XCTest
@testable import Meeshy

@MainActor
final class CallCaptureControllerTests: XCTestCase {

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

    private func makeSubjects() -> [CallCaptureSubject] {
        [
            CallCaptureSubject(id: "remote", name: "Awa", isMirrored: false, showsVideo: true),
            CallCaptureSubject(id: "local", name: "Moi", isMirrored: true, showsVideo: true),
            CallCaptureSubject(id: "avatar", name: "Bintou", isMirrored: false, showsVideo: false)
        ]
    }

    private func makeSUT(
        frames: [String: CGImage]? = nil,
        access: Bool = true,
        saves: Bool = true,
        face: CGRect? = CGRect(x: 0.3, y: 0.4, width: 0.3, height: 0.25),
        recorder: MockCallMontageRecorder = MockCallMontageRecorder()
    ) -> (sut: CallCaptureController, grabber: MockCallFrameGrabber, saver: MockCapturePhotoSaver) {
        let grabber = MockCallFrameGrabber()
        grabber.snapshotResult = CallFrameSnapshot(images: frames ?? ["remote": makeImage(), "local": makeImage(width: 48, height: 64)])
        let saver = MockCapturePhotoSaver()
        saver.accessResult = access
        saver.saveResult = saves
        let sut = CallCaptureController(
            grabber: grabber,
            saver: saver,
            faceLocator: MockFaceLocator(rect: face),
            recorder: recorder,
            now: { Date(timeIntervalSince1970: 1_790_000_000) }
        )
        sut.update(subjects: makeSubjects(), tracks: [:])
        return (sut, grabber, saver)
    }

    // MARK: - Branchement des sources

    func test_update_attachesEverySubjectWithItsMirroring() {
        let (_, grabber, _) = makeSUT()
        XCTAssertEqual(grabber.attached.map(\.id), ["remote", "local", "avatar"])
        XCTAssertEqual(grabber.attached.map(\.isMirrored), [false, true, false])
        XCTAssertEqual(grabber.keptIds.last, Set(["remote", "local", "avatar"]))
    }

    func test_stop_detachesEverythingAndClearsThePreviews() async {
        let (sut, grabber, _) = makeSUT()
        await sut.refreshPreviews()
        sut.stop()
        XCTAssertEqual(grabber.detachAllCount, 1)
        XCTAssertTrue(sut.thumbnails.isEmpty)
        XCTAssertNil(sut.preview)
        XCTAssertFalse(sut.isRunning)
    }

    // MARK: - Aperçu en direct

    func test_refreshPreviews_rendersEveryStyleAndTheSelectedPreview() async {
        let (sut, grabber, _) = makeSUT()
        await sut.refreshPreviews()
        XCTAssertEqual(Set(sut.thumbnails.keys), Set(CallMontageStyle.allCases))
        XCTAssertEqual(sut.thumbnails[.heart]?.width, Int(CallCaptureController.thumbnailCanvas.width))
        XCTAssertEqual(sut.preview?.height, Int(CallCaptureController.previewCanvas.height))
        XCTAssertEqual(grabber.requestedDimensions, [CallCaptureController.previewMaxDimension])
    }

    /// #8578 — l'aperçu plein écran suit l'appel en direct ; les vignettes du
    /// carrousel, treize rendus, ne se refont qu'environ une fois par seconde.
    func test_refreshPreviews_betweenThumbnailRounds_keepsTheThumbnails_refreshesThePreview() async {
        let (sut, _, _) = makeSUT()
        await sut.refreshPreviews()
        let firstThumbnail = sut.thumbnails[.grid]
        XCTAssertNotNil(firstThumbnail)
        let firstPreview = sut.preview
        await sut.refreshPreviews()
        XCTAssertTrue(sut.thumbnails[.grid] === firstThumbnail)
        XCTAssertFalse(sut.preview === firstPreview)
    }

    func test_rendersThumbnails_noneYet_rendersAtOnce() {
        XCTAssertTrue(CallCaptureController.rendersThumbnails(hasThumbnails: false, previewsSinceThumbnails: 1))
    }

    func test_rendersThumbnails_everyFewPreviews() {
        let every = CallCaptureController.thumbnailEveryPreviews
        XCTAssertFalse(CallCaptureController.rendersThumbnails(hasThumbnails: true, previewsSinceThumbnails: every - 1))
        XCTAssertTrue(CallCaptureController.rendersThumbnails(hasThumbnails: true, previewsSinceThumbnails: every))
    }

    func test_renderPreviews_withoutThumbnails_rendersOnlyThePreview() {
        let portraits = [CallMontagePortrait(id: "a", name: "Awa", image: makeImage())]
        let caption = CallMontageCaption(title: "Meeshy", subtitle: "")
        let rendered = CallCaptureController.renderPreviews(portraits: portraits, selected: .grid, caption: caption, includesThumbnails: false)
        XCTAssertTrue(rendered.thumbnails.isEmpty)
        XCTAssertNotNil(rendered.preview)
    }

    func test_select_changesTheStyle() {
        let (sut, _, _) = makeSUT()
        sut.select(.polaroid)
        XCTAssertEqual(sut.style, .polaroid)
    }

    func test_portraits_followTheSubjectOrderAndHideCamerasOff() {
        let (sut, _, _) = makeSUT()
        let portraits = sut.portraits(from: CallFrameSnapshot(images: ["remote": makeImage(), "local": makeImage(), "avatar": makeImage()]))
        XCTAssertEqual(portraits.map(\.id), ["remote", "local", "avatar"])
        XCTAssertNil(portraits[2].image)
        XCTAssertNotNil(portraits[0].image)
    }

    // MARK: - Capturer

    func test_capture_savesOneFullHDPortrait() async {
        let (sut, _, saver) = makeSUT()
        await sut.capture()
        XCTAssertEqual(sut.status, .saved)
        XCTAssertEqual(saver.saved.count, 1)
        XCTAssertEqual(saver.saved.first?.width, 1080)
        XCTAssertEqual(saver.saved.first?.height, 1920)
        XCTAssertEqual(sut.flashCount, 1)
    }

    func test_capture_everyStyle_rendersTheFullSize() async {
        for style in CallMontageStyle.allCases {
            let (sut, _, saver) = makeSUT()
            sut.select(style)
            await sut.capture()
            XCTAssertEqual(saver.saved.first?.height, 1920, "\(style)")
        }
    }

    func test_capture_accessDenied_savesNothing() async {
        let (sut, grabber, saver) = makeSUT(access: false)
        await sut.capture()
        XCTAssertEqual(sut.status, .denied)
        XCTAssertTrue(saver.saved.isEmpty)
        XCTAssertTrue(grabber.requestedDimensions.isEmpty)
    }

    func test_capture_noFrameYet_reportsNoVideo() async {
        let (sut, _, saver) = makeSUT(frames: [:])
        await sut.capture()
        XCTAssertEqual(sut.status, .noVideo)
        XCTAssertTrue(saver.saved.isEmpty)
    }

    func test_capture_saveFails_reportsFailure() async {
        let (sut, _, _) = makeSUT(saves: false)
        await sut.capture()
        XCTAssertEqual(sut.status, .failed)
    }

    func test_capture_readsFramesAtFullResolution() async {
        let (sut, grabber, _) = makeSUT()
        await sut.capture()
        XCTAssertEqual(grabber.requestedDimensions, [nil])
    }

    // MARK: - Chaque visage

    func test_captureFaces_savesOneSquarePerVisibleCamera() async {
        let (sut, _, saver) = makeSUT()
        await sut.captureFaces()
        XCTAssertEqual(sut.status, .facesSaved(2))
        XCTAssertEqual(saver.saved.count, 2)
        XCTAssertTrue(saver.saved.allSatisfy { $0.width == 1080 && $0.height == 1080 })
    }

    func test_captureFaces_noFaceFound_stillCropsTheCentre() async {
        let (sut, _, saver) = makeSUT(face: nil)
        await sut.captureFaces()
        XCTAssertEqual(saver.saved.count, 2)
    }

    func test_captureFaces_cameraOffIsNeverCaptured() async {
        let (sut, _, saver) = makeSUT(frames: ["avatar": makeImage()])
        await sut.captureFaces()
        XCTAssertEqual(sut.status, .noVideo)
        XCTAssertTrue(saver.saved.isEmpty)
    }

    func test_captureFaces_accessDenied_savesNothing() async {
        let (sut, _, saver) = makeSUT(access: false)
        await sut.captureFaces()
        XCTAssertEqual(sut.status, .denied)
        XCTAssertTrue(saver.saved.isEmpty)
    }

    // MARK: - Capturer un style imposé (mode Effets)

    func test_capture_withAFixedStyle_keepsTheCarouselStyle() async {
        let (sut, _, saver) = makeSUT()
        sut.select(.polaroid)

        await sut.capture(style: .screen)

        XCTAssertEqual(saver.saved.count, 1)
        XCTAssertEqual(sut.style, .polaroid)
    }

    // MARK: - Filmer (#8625)

    func test_startRecording_accessGranted_startsTheRecorderAtTheRecordingSize() async {
        let recorder = MockCallMontageRecorder()
        let (sut, _, _) = makeSUT(recorder: recorder)

        await sut.startRecording()

        XCTAssertEqual(recorder.startedCanvases, [CallCaptureController.recordingCanvas])
        XCTAssertEqual(sut.recordingStartedAt, Date(timeIntervalSince1970: 1_790_000_000))
        XCTAssertTrue(sut.isRecording)
        sut.stop()
    }

    func test_startRecording_accessDenied_recordsNothing() async {
        let recorder = MockCallMontageRecorder()
        let (sut, _, _) = makeSUT(access: false, recorder: recorder)

        await sut.startRecording()

        XCTAssertEqual(sut.status, .denied)
        XCTAssertTrue(recorder.startedCanvases.isEmpty)
        XCTAssertFalse(sut.isRecording)
    }

    func test_startRecording_writerUnavailable_reportsFailure() async {
        let recorder = MockCallMontageRecorder()
        recorder.startError = CallMontageRecordingError.writerUnavailable
        let (sut, _, _) = makeSUT(recorder: recorder)

        await sut.startRecording()

        XCTAssertEqual(sut.status, .failed)
        XCTAssertFalse(sut.isRecording)
    }

    func test_startRecording_twice_startsOnce() async {
        let recorder = MockCallMontageRecorder()
        let (sut, _, _) = makeSUT(recorder: recorder)

        await sut.startRecording()
        await sut.startRecording()

        XCTAssertEqual(recorder.startedCanvases.count, 1)
        sut.stop()
    }

    func test_recordFrame_appendsTheRenderedMontageAndShowsIt() async {
        let recorder = MockCallMontageRecorder()
        let (sut, _, _) = makeSUT(recorder: recorder)
        await sut.startRecording()

        await sut.recordFrame(style: nil)

        XCTAssertFalse(recorder.appended.isEmpty)
        XCTAssertTrue(recorder.appended.allSatisfy { $0.width == Int(CallCaptureController.recordingCanvas.width) })
        XCTAssertEqual(sut.preview?.height, Int(CallCaptureController.recordingCanvas.height))
        sut.stop()
    }

    /// Une lenteur est un bug : l'écran d'appel observe le contrôleur, jamais
    /// l'image qui change à chaque trame — seul le flux d'aperçu la publie.
    func test_recordFrame_publishesTheFrameOnThePreviewFeedOnly() async {
        let (sut, _, _) = makeSUT()
        await sut.startRecording()
        var controllerChanges = 0
        var feedChanges = 0
        let controllerWatch = sut.objectWillChange.sink { _ in controllerChanges += 1 }
        let feedWatch = sut.previewFeed.objectWillChange.sink { _ in feedChanges += 1 }

        for _ in 0 ..< 3 { await sut.recordFrame(style: nil) }

        // La boucle lancée par `startRecording` enregistre aussi : le fil en
        // reçoit AU MOINS trois, le contrôleur jamais aucune.
        XCTAssertEqual(controllerChanges, 0)
        XCTAssertGreaterThanOrEqual(feedChanges, 3)
        controllerWatch.cancel()
        feedWatch.cancel()
        sut.stop()
    }

    func test_refreshPreviews_publishesThePreviewOnTheFeedOnly() async {
        let (sut, _, _) = makeSUT()
        await sut.refreshPreviews()
        var controllerChanges = 0
        let controllerWatch = sut.objectWillChange.sink { _ in controllerChanges += 1 }

        await sut.refreshPreviews()

        XCTAssertEqual(controllerChanges, 0)
        XCTAssertNotNil(sut.previewFeed.image)
        controllerWatch.cancel()
    }

    func test_recordFrame_notRecording_appendsNothing() async {
        let recorder = MockCallMontageRecorder()
        let (sut, _, _) = makeSUT(recorder: recorder)

        await sut.recordFrame(style: nil)

        XCTAssertTrue(recorder.appended.isEmpty)
    }

    func test_refreshPreviews_whileRecording_leavesTheImageToTheRecording() async {
        let (sut, _, _) = makeSUT()
        await sut.startRecording()

        await sut.refreshPreviews()

        XCTAssertTrue(sut.thumbnails.isEmpty)
        sut.stop()
    }

    func test_stopRecording_savesTheVideoToThePhotoLibrary() async {
        let recorder = MockCallMontageRecorder()
        let (sut, _, saver) = makeSUT(recorder: recorder)
        await sut.startRecording()

        await sut.stopRecording()

        XCTAssertEqual(saver.savedVideos, [recorder.finishURL])
        XCTAssertEqual(sut.status, .videoSaved)
        XCTAssertNil(sut.recordingStartedAt)
    }

    func test_stopRecording_nothingFilmed_reportsFailure() async {
        let recorder = MockCallMontageRecorder()
        recorder.finishURL = nil
        let (sut, _, saver) = makeSUT(recorder: recorder)
        await sut.startRecording()

        await sut.stopRecording()

        XCTAssertEqual(sut.status, .failed)
        XCTAssertTrue(saver.savedVideos.isEmpty)
    }

    func test_stopRecording_saveFails_reportsFailure() async {
        let (sut, _, _) = makeSUT(saves: false)
        await sut.startRecording()

        await sut.stopRecording()

        XCTAssertEqual(sut.status, .failed)
    }

    func test_stop_whileRecording_stillSavesTheVideo() async {
        let recorder = MockCallMontageRecorder()
        let (sut, _, saver) = makeSUT(recorder: recorder)
        let saved = expectation(description: "video saved")
        saver.onSaveVideo = { saved.fulfill() }
        await sut.startRecording()

        sut.stop()

        await fulfillment(of: [saved], timeout: 2)
        XCTAssertEqual(recorder.finishCount, 1)
    }

    // MARK: - Recadrage

    func test_faceSquare_isSquareAtTheRequestedSide() {
        let square = CallMontageRenderer.faceSquare(from: makeImage(width: 720, height: 1280), face: CGRect(x: 0.4, y: 0.5, width: 0.2, height: 0.12), side: 1080)
        XCTAssertEqual(square?.width, 1080)
        XCTAssertEqual(square?.height, 1080)
    }
}

private final class MockCallFrameGrabber: CallFrameGrabbing, @unchecked Sendable {
    struct Attachment: Equatable {
        let id: String
        let isMirrored: Bool
    }

    var snapshotResult = CallFrameSnapshot.empty
    private(set) var attached: [Attachment] = []
    private(set) var keptIds: [Set<String>] = []
    private(set) var detachAllCount = 0
    private(set) var requestedDimensions: [CGFloat?] = []

    func attach(track: Any?, id: String, isMirrored: Bool) {
        attached.append(Attachment(id: id, isMirrored: isMirrored))
    }

    func keepOnly(_ ids: Set<String>) {
        keptIds.append(ids)
    }

    func detachAll() {
        detachAllCount += 1
    }

    func snapshot(maxDimension: CGFloat?) async -> CallFrameSnapshot {
        requestedDimensions.append(maxDimension)
        return snapshotResult
    }
}

@MainActor
private final class MockCapturePhotoSaver: CallCapturePhotoSaving {
    var accessResult = true
    var saveResult = true
    var onSaveVideo: (() -> Void)?
    private(set) var saved: [CGImage] = []
    private(set) var savedVideos: [URL?] = []

    func requestAccess() async -> Bool {
        accessResult
    }

    func save(_ image: CGImage) async -> Bool {
        saved.append(image)
        return saveResult
    }

    func saveVideo(at url: URL) async -> Bool {
        savedVideos.append(url)
        onSaveVideo?()
        return saveResult
    }
}

@MainActor
private final class MockCallMontageRecorder: CallMontageRecordingProviding {
    var startError: Error?
    var finishURL: URL? = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("montage-mock.mp4")
    private(set) var startedCanvases: [CGSize] = []
    private(set) var appended: [CGImage] = []
    private(set) var finishCount = 0
    private(set) var cancelCount = 0

    func start(canvas: CGSize) throws {
        if let startError { throw startError }
        startedCanvases.append(canvas)
    }

    func append(_ frame: CGImage) {
        appended.append(frame)
    }

    func finish() async -> URL? {
        finishCount += 1
        return finishURL
    }

    func cancel() {
        cancelCount += 1
    }
}

private final class MockFaceLocator: CallFaceLocating, @unchecked Sendable {
    let rect: CGRect?

    init(rect: CGRect?) {
        self.rect = rect
    }

    func faceRect(in image: CGImage) -> CGRect? {
        rect
    }
}
