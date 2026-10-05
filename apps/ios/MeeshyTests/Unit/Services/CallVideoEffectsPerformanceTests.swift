import CoreVideo
import QuartzCore
import XCTest
@testable import Meeshy

final class CallVideoEffectsPerformanceTests: XCTestCase {

    private static let framesPerIteration = 30

    private func makeFrames(count: Int = 4) -> [CVPixelBuffer] {
        (0..<count).map { CallSyntheticFrame.make(width: 1280, height: 720, phase: $0) }
    }

    private func measureProcess(_ config: VideoFilterConfig, pipeline: VideoFilterPipeline? = nil) {
        let frames = makeFrames()
        let sut = pipeline ?? VideoFilterPipeline(isPowerConstrained: { false })
        sut.config = config
        _ = sut.process(frames[0], averageBrightness: 120, rotation: 0)
        measure(metrics: [XCTClockMetric(), XCTMemoryMetric()]) {
            (0..<Self.framesPerIteration).forEach { index in
                _ = sut.process(frames[index % frames.count], averageBrightness: 120, rotation: 0)
            }
        }
    }

    func test_process_backgroundBlur_1280x720() {
        measureProcess(VideoFilterConfig.default.withBackgroundBlur(true))
    }

    /// Le simulateur n'a pas de segmentation de personne (« E5RT is not
    /// supported ») : un masque synthétique, livré sur la vraie file dédiée,
    /// mesure le flou réellement composé.
    func test_process_backgroundBlurWithMask_1280x720() {
        let pipeline = VideoFilterPipeline(
            segmenter: CountingSegmenter(maskValue: 96),
            segmentationExecutor: CallVisionQueueExecutor(label: "test.segmentation"),
            isPowerConstrained: { false }
        )
        measureProcess(VideoFilterConfig.default.withBackgroundBlur(true), pipeline: pipeline)
    }

    func test_process_backgroundBlurWithMask_reportsTheFrameP95() {
        let frames = makeFrames()
        let sut = VideoFilterPipeline(
            segmenter: CountingSegmenter(maskValue: 96),
            segmentationExecutor: CallVisionQueueExecutor(label: "test.segmentation.p95"),
            isPowerConstrained: { false }
        )
        sut.config = VideoFilterConfig.default.withBackgroundBlur(true)
        let durations = (0..<120).map { index -> Double in
            let start = CACurrentMediaTime()
            _ = sut.process(frames[index % frames.count], averageBrightness: 120, rotation: 0)
            return (CACurrentMediaTime() - start) * 1000
        }.dropFirst(10).sorted()
        let p95 = durations[Int(Double(durations.count - 1) * 0.95)]
        let report = "blur p95 = \(String(format: "%.2f", p95)) ms, dégradé = \(sut.isAutoDegraded) (simulateur, masque synthétique)"
        XCTContext.runActivity(named: report) { _ in }
        print("CallVideoEffectsPerformance", report)
    }

    // MARK: - Règle de dégradation, au temps simulé (#9454)

    private func makeScriptedSUT(frameMs: Double, segmenter: CountingSegmenter) -> (VideoFilterPipeline, TestClock) {
        let clock = TestClock()
        let stopwatch = ScriptedStopwatch(frameMs: frameMs)
        let sut = VideoFilterPipeline(
            faceEffects: CallFaceEffectsRenderer(detector: SilentFaceDetector(), executor: InlineVisionExecutor()),
            segmenter: segmenter,
            segmentationExecutor: InlineVisionExecutor(),
            clock: { clock.now },
            stopwatch: { stopwatch.read() },
            isPowerConstrained: { false }
        )
        sut.config = VideoFilterConfig.default.withBackgroundBlur(true)
        return (sut, clock)
    }

    private func feed(_ sut: VideoFilterPipeline, clock: TestClock, frames: Int) {
        let frame = CallSyntheticFrame.make(width: 64, height: 48)
        (0..<frames).forEach { _ in
            _ = sut.process(frame, averageBrightness: 120, rotation: 0)
            clock.now += 1.0 / 30
        }
    }

    func test_process_blurFramesUnderBudget_neverDegrade() {
        let segmenter = CountingSegmenter(maskValue: 96)
        let (sut, clock) = makeScriptedSUT(frameMs: CallVideoDegradation.restoreBudgetMs - 5, segmenter: segmenter)

        feed(sut, clock: clock, frames: 120)

        XCTAssertFalse(sut.isAutoDegraded)
        XCTAssertEqual(Set(segmenter.qualities), [.balanced], "sous le budget, le flou garde sa qualité d'origine")
    }

    /// Juste SOUS le plafond, et non pile dessus : la durée passe par une
    /// soustraction de secondes en virgule flottante (`(t + 0,025) − t` vaut
    /// un cheveu de plus que 25 ms), donc l'égalité exacte ne s'observe pas à
    /// travers le pipeline. La frontière elle-même est jugée sur la règle pure
    /// (`CallVideoDegradationTests.test_recording_atTheBudget_neverCounts`).
    func test_process_blurFramesJustUnderTheBudget_neverDegrade() {
        let segmenter = CountingSegmenter(maskValue: 96)
        let (sut, clock) = makeScriptedSUT(frameMs: CallVideoDegradation.overBudgetMs - 1, segmenter: segmenter)

        feed(sut, clock: clock, frames: 120)

        XCTAssertFalse(sut.isAutoDegraded, "une image sous le plafond ne compte jamais")
        XCTAssertEqual(Set(segmenter.qualities), [.balanced])
    }

    func test_process_blurFramesOverBudget_descendOneTierPerStreakBeforeStopping() {
        let segmenter = CountingSegmenter(maskValue: 96)
        let (sut, clock) = makeScriptedSUT(frameMs: CallVideoDegradation.overBudgetMs + 5, segmenter: segmenter)
        let streak = CallVideoDegradation.overBudgetFrames

        feed(sut, clock: clock, frames: streak)
        XCTAssertFalse(sut.isAutoDegraded, "une série trop lente descend d'un palier, elle ne coupe pas le flou")
        XCTAssertEqual(Set(segmenter.qualities), [.balanced])

        let callsAtFast = segmenter.calls
        feed(sut, clock: clock, frames: streak)
        XCTAssertFalse(sut.isAutoDegraded)
        XCTAssertEqual(Set(segmenter.qualities.dropFirst(callsAtFast)), [.fast], "deuxième palier : segmentation rapide")

        feed(sut, clock: clock, frames: streak - 1)
        XCTAssertFalse(sut.isAutoDegraded)
        feed(sut, clock: clock, frames: 1)
        XCTAssertTrue(sut.isAutoDegraded, "trois séries trop lentes épuisent l'échelle")

        let callsWhenStopped = segmenter.calls
        feed(sut, clock: clock, frames: streak)
        XCTAssertEqual(segmenter.calls, callsWhenStopped, "au dernier palier, plus aucune segmentation")
    }

    func test_process_skinSmoothingWithFace_1280x720() {
        let renderer = CallFaceEffectsRenderer(
            detector: CountingFaceDetector(result: CallFaceDetection(boundingBox: CGRect(x: 0.3, y: 0.2, width: 0.4, height: 0.6), leftEye: nil, rightEye: nil)),
            executor: CallVisionQueueExecutor(label: "test.face")
        )
        measureProcess(VideoFilterConfig.default.selectingFaceEffect(.smoothing), pipeline: VideoFilterPipeline(faceEffects: renderer, isPowerConstrained: { false }))
    }

    func test_process_skinSmoothing_1280x720() {
        measureProcess(VideoFilterConfig.default.selectingFaceEffect(.smoothing))
    }

    func test_process_angel_1280x720() {
        measureProcess(VideoFilterConfig.default.selectingFaceEffect(.angel))
    }

    func test_process_volcano_1280x720() {
        measureProcess(VideoFilterConfig.default.selectingFaceEffect(.volcano))
    }
}

/// Chaque lecture avance d'une durée fixe : `process` lit le chronomètre au
/// début et à la fin d'une image, qui dure donc exactement `frameMs`.
final class ScriptedStopwatch: @unchecked Sendable {
    private let step: CFTimeInterval
    private var now: CFTimeInterval = 0

    init(frameMs: Double) {
        self.step = frameMs / 1000
    }

    func read() -> CFTimeInterval {
        now += step
        return now
    }
}

enum CallSyntheticFrame {
    static func make(width: Int, height: Int, phase: Int = 0) -> CVPixelBuffer {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer)
        precondition(status == kCVReturnSuccess, "CVPixelBufferCreate failed")
        let buffer = pixelBuffer!
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        (0..<height).forEach { y in
            let row = base + y * rowBytes
            (0..<width).forEach { x in
                let pixel = row + x * 4
                pixel[0] = UInt8(truncatingIfNeeded: x &+ phase * 7)
                pixel[1] = UInt8(truncatingIfNeeded: y &+ phase * 3)
                pixel[2] = UInt8(truncatingIfNeeded: (x ^ y) &+ phase)
                pixel[3] = 255
            }
        }
        return buffer
    }
}
