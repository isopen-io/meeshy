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
        XCTContext.runActivity(named: "blur p95 = \(String(format: "%.2f", p95)) ms (simulateur, masque synthétique)") { _ in }
        print("CallVideoEffectsPerformance blur p95 ms:", String(format: "%.2f", p95))
        XCTAssertFalse(sut.isAutoDegraded)
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
