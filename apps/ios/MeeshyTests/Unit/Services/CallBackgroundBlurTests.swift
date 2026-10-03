import CoreImage
import CoreVideo
import QuartzCore
import XCTest
@testable import Meeshy

// MARK: - Segmentation cadence (#9101)

final class CallBackgroundBlurTests: XCTestCase {

    private func makeSUT(
        segmenter: CountingSegmenter = CountingSegmenter(),
        executor: any CallVisionExecuting = InlineVisionExecutor(),
        clock: TestClock = TestClock(),
        isPowerConstrained: Bool = false,
        stopwatch: @escaping @Sendable () -> CFTimeInterval = { 0 },
        faceEffects: any CallFaceEffectsRendererProviding = CallFaceEffectsRenderer(detector: SilentFaceDetector(), executor: InlineVisionExecutor())
    ) -> VideoFilterPipeline {
        let pipeline = VideoFilterPipeline(
            faceEffects: faceEffects,
            segmenter: segmenter,
            segmentationExecutor: executor,
            clock: { clock.now },
            stopwatch: stopwatch,
            isPowerConstrained: { isPowerConstrained }
        )
        pipeline.config = VideoFilterConfig.default.withBackgroundBlur(true)
        return pipeline
    }

    private func feed(_ sut: VideoFilterPipeline, frames: Int, clock: TestClock, fps: Double = 30, frame: CVPixelBuffer? = nil) {
        let buffer = frame ?? CallSyntheticFrame.make(width: 64, height: 48)
        (0..<frames).forEach { _ in
            _ = sut.process(buffer, averageBrightness: 120, rotation: 0)
            clock.now += 1 / fps
        }
    }

    func test_process_blurAt30fps_segmentsAboutEveryOtherFrame() {
        let segmenter = CountingSegmenter()
        let clock = TestClock()
        let sut = makeSUT(segmenter: segmenter, clock: clock)

        feed(sut, frames: 60, clock: clock)

        XCTAssertEqual(Double(segmenter.calls), 30, accuracy: 1, "15 segmentations par seconde à 30 images/s")
        XCTAssertEqual(Set(segmenter.qualities), [.balanced])
    }

    func test_process_blur_neverSegmentsOnTheCaptureCall() {
        let segmenter = CountingSegmenter()
        let executor = ManualVisionExecutor()
        let sut = makeSUT(segmenter: segmenter, executor: executor)

        _ = sut.process(CallSyntheticFrame.make(width: 64, height: 48), averageBrightness: 120, rotation: 0)

        XCTAssertEqual(segmenter.calls, 0, "la segmentation ne tourne jamais pendant process()")
        executor.drain()
        XCTAssertEqual(segmenter.calls, 1)
    }

    func test_process_busySegmenter_dropsFramesInsteadOfQueuingThem() {
        let executor = ManualVisionExecutor()
        let clock = TestClock()
        let sut = makeSUT(executor: executor, clock: clock)

        feed(sut, frames: 60, clock: clock)

        XCTAssertEqual(executor.pendingCount, 1, "une seule segmentation en vol : la plus récente gagne, rien ne s'empile")
    }

    func test_process_betweenTwoSegmentations_reusesTheLastMask() {
        let segmenter = CountingSegmenter(maskValue: 0)
        let clock = TestClock()
        let sut = makeSUT(segmenter: segmenter, clock: clock)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)

        _ = sut.process(frame, averageBrightness: 120, rotation: 0)
        clock.now += 1.0 / 30
        let second = sut.process(frame, averageBrightness: 120, rotation: 0)

        XCTAssertEqual(segmenter.calls, 1)
        XCTAssertNotEqual(PixelProbe.bytes(of: second), PixelProbe.bytes(of: frame), "l'image sans segmentation reste floutée avec le dernier masque")
    }

    func test_process_uniformFrame_blurDoesNotDarkenTheEdges() {
        let sut = makeSUT(segmenter: CountingSegmenter(maskValue: 0))
        sut.config.backgroundBlurRadius = 20
        let frame = PixelProbe.uniform(width: 64, height: 48, gray: 128)

        let output = sut.process(frame, averageBrightness: 120, rotation: 0)

        let corners = [PixelProbe.pixel(output, x: 0, y: 0), PixelProbe.pixel(output, x: 63, y: 47), PixelProbe.pixel(output, x: 0, y: 47)]
        corners.forEach { XCTAssertEqual(Double($0), 128, accuracy: 4, "un bord flouté garde sa luminosité") }
    }

    func test_process_powerConstrained_segmentsFastAt10fps() {
        let segmenter = CountingSegmenter()
        let clock = TestClock()
        let sut = makeSUT(segmenter: segmenter, clock: clock, isPowerConstrained: true)

        feed(sut, frames: 60, clock: clock)

        XCTAssertEqual(Double(segmenter.calls), 20, accuracy: 1)
        XCTAssertEqual(Set(segmenter.qualities), [.fast])
    }

    func test_process_overBudget_lowersQualityBeforeStoppingTheBlur() {
        let segmenter = CountingSegmenter()
        let clock = TestClock()
        let sut = makeSUT(segmenter: segmenter, clock: clock, stopwatch: { CACurrentMediaTime() }, faceEffects: SlowFaceRenderer(delay: 0.03))
        sut.config = sut.config.selectingFaceEffect(.volcano)

        feed(sut, frames: 10, clock: clock)
        XCTAssertFalse(sut.isAutoDegraded, "dix images trop lentes ne coupent plus le flou d'un coup")
        let callsAfterFirstStep = segmenter.calls
        feed(sut, frames: 2, clock: clock)
        XCTAssertEqual(segmenter.qualities.last, .fast)
        XCTAssertGreaterThan(segmenter.calls, callsAfterFirstStep)

        feed(sut, frames: 30, clock: clock)
        XCTAssertTrue(sut.isAutoDegraded)
        let callsWhenStopped = segmenter.calls
        feed(sut, frames: 6, clock: clock)
        XCTAssertEqual(segmenter.calls, callsWhenStopped, "au dernier palier, plus aucune segmentation")
    }

    func test_reset_forgetsTheLastMask() {
        let segmenter = CountingSegmenter(maskValue: 0)
        let executor = ManualVisionExecutor()
        let sut = makeSUT(segmenter: segmenter, executor: executor)
        let frame = CallSyntheticFrame.make(width: 64, height: 48)
        _ = sut.process(frame, averageBrightness: 120, rotation: 0)
        executor.drain()

        sut.reset()
        sut.config = VideoFilterConfig.default.withBackgroundBlur(true)
        let output = sut.process(frame, averageBrightness: 120, rotation: 0)

        XCTAssertEqual(PixelProbe.bytes(of: output), PixelProbe.bytes(of: frame), "sans masque, l'image part nette plutôt qu'avec le masque d'un autre appel")
    }
}

// MARK: - Degradation ladder

final class CallVideoDegradationTests: XCTestCase {

    private func record(_ ladder: CallVideoDegradation, elapsedMs: Double, frames: Int, blurActive: Bool = true) -> CallVideoDegradation {
        (0..<frames).reduce(ladder) { current, _ in current.recording(elapsedMs: elapsedMs, blurActive: blurActive) }
    }

    func test_recording_overBudgetWithBlur_descendsOneTierPerStreak() {
        let start = CallVideoDegradation()
        let fast = record(start, elapsedMs: 30, frames: 10)
        let slow = record(fast, elapsedMs: 30, frames: 10)
        let off = record(slow, elapsedMs: 30, frames: 10)

        XCTAssertEqual([start.tier, fast.tier, slow.tier, off.tier], [.balanced, .fast, .slow, .off])
        XCTAssertEqual([start, fast, slow].map(\.isExhausted), [false, false, false])
        XCTAssertTrue(off.isExhausted)
    }

    func test_recording_overBudgetWithoutBlur_isExhaustedAtOnce() {
        let ladder = record(CallVideoDegradation(), elapsedMs: 30, frames: 10, blurActive: false)
        XCTAssertTrue(ladder.isExhausted)
    }

    func test_recording_underBudget_climbsBackOneTierAtATime() {
        let off = record(CallVideoDegradation(), elapsedMs: 30, frames: 30)
        let slow = record(off, elapsedMs: 5, frames: 30)
        let fast = record(slow, elapsedMs: 5, frames: 30)
        let balanced = record(fast, elapsedMs: 5, frames: 30)
        XCTAssertEqual([slow.tier, fast.tier, balanced.tier], [.slow, .fast, .balanced])
    }

    func test_recording_middleZone_holdsTheTier() {
        let fast = record(CallVideoDegradation(), elapsedMs: 30, frames: 10)
        XCTAssertEqual(record(fast, elapsedMs: 20, frames: 100).tier, .fast)
    }

    func test_blurTier_constrainedDevice_isCappedAtSlow() {
        XCTAssertEqual(CallVideoDegradation().blurTier(isConstrained: true), .slow)
        XCTAssertEqual(CallVideoDegradation().blurTier(isConstrained: false), .balanced)
        let off = record(CallVideoDegradation(), elapsedMs: 30, frames: 30)
        XCTAssertEqual(off.blurTier(isConstrained: true), .off)
    }

    func test_tiers_followTheAgreedCadence() {
        XCTAssertEqual(CallBlurTier.balanced.segmentation, CallBlurTier.Segmentation(quality: .balanced, framesPerSecond: 15))
        XCTAssertEqual(CallBlurTier.fast.segmentation, CallBlurTier.Segmentation(quality: .fast, framesPerSecond: 15))
        XCTAssertEqual(CallBlurTier.slow.segmentation, CallBlurTier.Segmentation(quality: .fast, framesPerSecond: 10))
        XCTAssertNil(CallBlurTier.off.segmentation)
    }
}

// MARK: - Test doubles

final class TestClock: @unchecked Sendable {
    var now: CFTimeInterval = 100
}

final class InlineVisionExecutor: CallVisionExecuting, @unchecked Sendable {
    nonisolated func execute(_ work: @escaping @Sendable () -> Void) { work() }
}

final class ManualVisionExecutor: CallVisionExecuting, @unchecked Sendable {
    private var pending: [@Sendable () -> Void] = []

    var pendingCount: Int { pending.count }

    nonisolated func execute(_ work: @escaping @Sendable () -> Void) { pending.append(work) }

    func drain() {
        while !pending.isEmpty {
            let work = pending.removeFirst()
            work()
        }
    }
}

final class CountingSegmenter: CallPersonSegmentationProviding, @unchecked Sendable {
    private let maskValue: UInt8
    private(set) var qualities: [CallSegmentationQuality] = []
    var calls: Int { qualities.count }

    init(maskValue: UInt8 = 255) {
        self.maskValue = maskValue
    }

    nonisolated func segment(_ pixelBuffer: CVPixelBuffer, quality: CallSegmentationQuality) -> CVPixelBuffer? {
        qualities.append(quality)
        return PixelProbe.mask(width: 32, height: 24, value: maskValue)
    }
}

final class SlowFaceRenderer: CallFaceEffectsRendererProviding, @unchecked Sendable {
    private let delay: TimeInterval

    init(delay: TimeInterval) {
        self.delay = delay
    }

    nonisolated func render(_ effect: CallFaceEffect, on image: CIImage, pixelBuffer: CVPixelBuffer, rotation: Int, intensity: Float, isDegraded: Bool) -> CIImage {
        Thread.sleep(forTimeInterval: delay)
        return image
    }

    nonisolated func reset() {}
}

enum PixelProbe {
    static func uniform(width: Int, height: Int, gray: UInt8) -> CVPixelBuffer {
        let buffer = CallSyntheticFrame.make(width: width, height: height)
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        (0..<height).forEach { y in
            (0..<width).forEach { x in
                let pixel = base + y * rowBytes + x * 4
                pixel[0] = gray
                pixel[1] = gray
                pixel[2] = gray
                pixel[3] = 255
            }
        }
        return buffer
    }

    static func mask(width: Int, height: Int, value: UInt8) -> CVPixelBuffer {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_OneComponent8, attrs as CFDictionary, &pixelBuffer)
        let buffer = pixelBuffer!
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        memset(base, Int32(value), CVPixelBufferGetBytesPerRow(buffer) * height)
        return buffer
    }

    static func bytes(of buffer: CVPixelBuffer) -> [UInt8] {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        let width = CVPixelBufferGetWidth(buffer)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        return (0..<CVPixelBufferGetHeight(buffer)).flatMap { y in
            Array(UnsafeBufferPointer(start: base + y * rowBytes, count: width * 4))
        }
    }

    static func pixel(_ buffer: CVPixelBuffer, x: Int, y: Int) -> UInt8 {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        return base[y * CVPixelBufferGetBytesPerRow(buffer) + x * 4 + 1]
    }

    static func render(_ image: CIImage, context: CIContext = CIContext(options: [.workingColorSpace: NSNull()])) -> [UInt8] {
        let extent = image.extent.integral
        var bytes = [UInt8](repeating: 0, count: Int(extent.width) * Int(extent.height) * 4)
        context.render(image, toBitmap: &bytes, rowBytes: Int(extent.width) * 4, bounds: extent, format: .RGBA8, colorSpace: nil)
        return bytes
    }
}
