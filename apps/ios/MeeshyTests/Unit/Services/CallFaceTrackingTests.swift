import CoreImage
import CoreVideo
import ImageIO
import XCTest
@testable import Meeshy

// MARK: - Face tracking off the capture queue (#9102)

final class CallFaceTrackingTests: XCTestCase {

    private static let face = CallFaceDetection(
        boundingBox: CGRect(x: 0.3, y: 0.25, width: 0.4, height: 0.5),
        leftEye: CGPoint(x: 0.3, y: 0.65),
        rightEye: CGPoint(x: 0.7, y: 0.65)
    )

    private func makeRenderer(
        detector: CountingFaceDetector = CountingFaceDetector(result: face),
        executor: any CallVisionExecuting = InlineVisionExecutor(),
        reduceMotion: Bool = false,
        clock: TestClock = TestClock()
    ) -> CallFaceEffectsRenderer {
        CallFaceEffectsRenderer(
            detector: detector,
            executor: executor,
            isReduceMotionEnabled: { reduceMotion },
            clock: { clock.now }
        )
    }

    private func render(_ sut: CallFaceEffectsRenderer, _ effect: CallFaceEffect, frame: CVPixelBuffer, isDegraded: Bool = false) -> CIImage {
        sut.render(effect, on: CIImage(cvPixelBuffer: frame), pixelBuffer: frame, rotation: 0, intensity: 0.6, isDegraded: isDegraded)
    }

    func test_render_faceEffect_neverDetectsOnTheCurrentFrame() {
        let detector = CountingFaceDetector(result: Self.face)
        let executor = ManualVisionExecutor()
        let sut = makeRenderer(detector: detector, executor: executor)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)

        (0..<10).forEach { _ in _ = render(sut, .smoothing, frame: frame) }

        XCTAssertEqual(detector.calls, 0, "aucune détection pendant render() : elle part sur sa propre file")
        XCTAssertEqual(executor.pendingCount, 1, "une seule détection en vol, les suivantes ne s'empilent pas")
        executor.drain()
        XCTAssertEqual(detector.calls, 1)
    }

    func test_render_detectsAtTheStrideOnceAFaceIsKnown() {
        let detector = CountingFaceDetector(result: Self.face)
        let sut = makeRenderer(detector: detector)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)

        (0..<20).forEach { _ in _ = render(sut, .toad, frame: frame) }

        XCTAssertEqual(detector.calls, 5, "une détection d'amorce, puis une toutes les cinq images")
    }

    func test_tracker_detectionLandsOnTheNextFrame_inCanvasCoordinates() throws {
        let executor = ManualVisionExecutor()
        let tracker = CallFaceTracker(detector: CountingFaceDetector(result: Self.face), executor: executor)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)
        let canvas = CGSize(width: 200, height: 100)

        XCTAssertNil(tracker.landmarks(for: frame, orientation: .up, canvas: canvas, isDegraded: false))
        XCTAssertNil(tracker.landmarks(for: frame, orientation: .up, canvas: canvas, isDegraded: false))
        executor.drain()
        let landmarks = tracker.landmarks(for: frame, orientation: .up, canvas: canvas, isDegraded: false)

        let bounds = try XCTUnwrap(landmarks?.bounds)
        let leftEye = try XCTUnwrap(landmarks?.leftEye)
        XCTAssertEqual(bounds.minX, 60, accuracy: 0.001)
        XCTAssertEqual(bounds.minY, 25, accuracy: 0.001)
        XCTAssertEqual(bounds.width, 80, accuracy: 0.001)
        XCTAssertEqual(bounds.height, 50, accuracy: 0.001)
        XCTAssertEqual(leftEye.x, 84, accuracy: 0.001)
        XCTAssertEqual(leftEye.y, 57.5, accuracy: 0.001)
    }

    func test_tracker_resetDuringADetection_dropsTheStaleFace() {
        let executor = ManualVisionExecutor()
        let tracker = CallFaceTracker(detector: CountingFaceDetector(result: Self.face), executor: executor)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)
        _ = tracker.landmarks(for: frame, orientation: .up, canvas: CGSize(width: 64, height: 48), isDegraded: false)
        _ = tracker.landmarks(for: frame, orientation: .up, canvas: CGSize(width: 64, height: 48), isDegraded: false)

        tracker.reset()
        executor.drain()

        XCTAssertNil(tracker.landmarks(for: frame, orientation: .up, canvas: CGSize(width: 64, height: 48), isDegraded: false))
    }

    // MARK: - Smoothing cut to the face

    func test_smoothing_leavesEverythingOutsideTheFaceUntouched() {
        let sut = makeRenderer()
        let frame = CallSyntheticFrame.make(width: 64, height: 48)
        let original = PixelProbe.render(CIImage(cvPixelBuffer: frame))
        _ = render(sut, .smoothing, frame: frame)
        _ = render(sut, .smoothing, frame: frame)

        let smoothed = PixelProbe.render(render(sut, .smoothing, frame: frame))

        let corner = 0..<(4 * 8)
        XCTAssertEqual(Array(smoothed[corner]), Array(original[corner]))
        XCTAssertNotEqual(smoothed, original, "le visage, lui, est lissé")
    }

    // MARK: - Volcano embers

    func test_volcano_embersAreCachedSprites() {
        let clock = TestClock()
        let sut = makeRenderer(clock: clock)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)

        (0..<20).forEach { _ in
            _ = PixelProbe.render(render(sut, .volcano, frame: frame))
            clock.now += 1.0 / 30
        }

        XCTAssertLessThanOrEqual(sut.spriteDrawCount, CallFaceEffectBudget.emberOpacityLevels, "une braise est un sprite dessiné une fois par niveau d'opacité")
        XCTAssertGreaterThan(sut.spriteDrawCount, 0)
    }

    // MARK: - Reduce Motion

    func test_render_reduceMotion_freezesEveryAnimatedEffect() {
        let clock = TestClock()
        let sut = makeRenderer(reduceMotion: true, clock: clock)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)

        [CallFaceEffect.volcano, .angel, .demon].forEach { effect in
            _ = render(sut, effect, frame: frame)
            _ = render(sut, effect, frame: frame)
            let first = PixelProbe.render(render(sut, effect, frame: frame))
            clock.now += 0.37
            let later = PixelProbe.render(render(sut, effect, frame: frame))
            XCTAssertEqual(first, later, "\(effect) reste immobile quand Réduire les animations est actif")
        }
        XCTAssertEqual(sut.spriteDrawCount(prefix: "ember"), 0, "aucune braise animée sous Réduire les animations")
    }

    func test_render_withoutReduceMotion_volcanoMoves() {
        let clock = TestClock()
        let sut = makeRenderer(clock: clock)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)

        let first = PixelProbe.render(render(sut, .volcano, frame: frame))
        clock.now += 0.37
        let later = PixelProbe.render(render(sut, .volcano, frame: frame))

        XCTAssertNotEqual(first, later)
    }
}

// MARK: - Test doubles

final class CountingFaceDetector: CallFaceLandmarkDetecting, @unchecked Sendable {
    private let result: CallFaceDetection?
    private(set) var calls = 0

    init(result: CallFaceDetection?) {
        self.result = result
    }

    nonisolated func detect(in pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) -> CallFaceDetection? {
        calls += 1
        return result
    }
}

final class SilentFaceDetector: CallFaceLandmarkDetecting, @unchecked Sendable {
    nonisolated func detect(in pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) -> CallFaceDetection? { nil }
}
