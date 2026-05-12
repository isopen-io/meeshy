import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import QuartzCore
import Metal
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests the backdrop-capture pooling contract on `StoryAVCompositor` (P0
/// perf fix).
///
/// Background: prior to this fix `renderFrame` instantiated a fresh
/// `StoryBackdropCapture` on every exported frame, which in turn allocated a
/// `renderSize` BGRA8 `MTLTexture` (~8 MB at 1080×1920) on the shared GPU/CPU
/// heap. A 10 s × 60 fps export amortized to ~4.8 GB peak shared memory and a
/// `customVideoCompositorClass`-initiated leak chain on cancellation.
///
/// The fix moves the capture instance to a lazily-created per-compositor slot
/// reused across all frames, with `invalidate()` called at the top of every
/// `renderFrame` to drop the previous frame's `MTLTexture` snapshot. Tests
/// below pin both halves of that contract — instance reuse and per-frame
/// invalidate — through a counting `BackdropCapturing` fake injected via
/// `backdropCaptureFactory`.
@MainActor
final class StoryAVCompositor_BackdropLifecycleTests: XCTestCase {

    // MARK: - Instance reuse

    func test_renderFrame_repeated_reusesSameBackdropInstance() {
        let compositor = StoryAVCompositor()
        CountingBackdropCapture.resetGlobalInitCount()
        compositor.backdropCaptureFactory = { CountingBackdropCapture() }

        // Drive 10 acquisitions through the same seam that `startRequest`'s
        // bridged main-actor block uses.
        var captures: [ObjectIdentifier] = []
        for _ in 0..<10 {
            let capture = compositor.sharedBackdropCapture()
            captures.append(ObjectIdentifier(capture))
        }

        XCTAssertEqual(CountingBackdropCapture.globalInitCount, 1,
                       "Factory must be invoked exactly once across 10 acquisitions")
        XCTAssertEqual(Set(captures).count, 1,
                       "All 10 acquisitions must return the same backdrop instance")
    }

    func test_sharedBackdropCapture_distinctCompositors_eachGetOwnInstance() {
        // Sanity guard against accidental static-storage promotion of the
        // shared slot: AVFoundation instantiates one `StoryAVCompositor` per
        // export session, so two compositors MUST own two distinct captures.
        CountingBackdropCapture.resetGlobalInitCount()

        let compositorA = StoryAVCompositor()
        compositorA.backdropCaptureFactory = { CountingBackdropCapture() }
        let captureA = compositorA.sharedBackdropCapture()

        let compositorB = StoryAVCompositor()
        compositorB.backdropCaptureFactory = { CountingBackdropCapture() }
        let captureB = compositorB.sharedBackdropCapture()

        XCTAssertEqual(CountingBackdropCapture.globalInitCount, 2,
                       "Each compositor must request its own capture from the factory")
        XCTAssertFalse(ObjectIdentifier(captureA) == ObjectIdentifier(captureB),
                       "Different compositors must own different capture instances")
    }

    // MARK: - Per-frame invalidate contract

    func test_renderFrame_invalidatesBackdropBeforeEachCapture() throws {
        // Drive `renderFrame` 5 times against a counting fake. The contract
        // we pin: every frame issues `invalidate()` BEFORE
        // `captureCanvasBackdrop` so the previous frame's `MTLTexture` is
        // released before the new one is allocated.
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil,
                      "renderFrame walks the CALayer pipeline which needs a Metal device")

        let fake = CountingBackdropCapture()
        let cache = StoryRendererCache()
        let slide = makeTrivialSlide()
        let renderSize = CGSize(width: 64, height: 64)
        let buffer = try makeRGBABuffer(width: 64, height: 64)

        let frameCount = 5
        for i in 0..<frameCount {
            let time = CMTime(value: CMTimeValue(i), timescale: 60)
            try StoryAVCompositor.renderFrame(slide: slide,
                                              at: time,
                                              renderSize: renderSize,
                                              into: buffer,
                                              cache: cache,
                                              backdropCapture: fake)
        }

        XCTAssertEqual(fake.invalidateCount, frameCount,
                       "Every frame must call invalidate() exactly once")
        XCTAssertEqual(fake.captureCount, frameCount,
                       "Every frame must call captureCanvasBackdrop exactly once")
        XCTAssertEqual(fake.invalidateBeforeCaptureCount, frameCount,
                       "invalidate() must always precede captureCanvasBackdrop on every frame")
    }

    // MARK: - Fixtures

    private func makeTrivialSlide() -> StorySlide {
        // A slide with no glass text — `captureCanvasBackdrop` will fast-exit
        // (no Metal allocation) but the fake still records the call. Keeps
        // the test off the real Metal path.
        var effects = StoryEffects()
        effects.textObjects = []
        return StorySlide(id: "test-slide", effects: effects, duration: 1.0, order: 0)
    }

    private func makeRGBABuffer(width: Int, height: Int) throws -> CVPixelBuffer {
        let attrs: [CFString: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary
        ]
        var buffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(kCFAllocatorDefault,
                                          width,
                                          height,
                                          kCVPixelFormatType_32BGRA,
                                          attrs as CFDictionary,
                                          &buffer)
        guard status == kCVReturnSuccess, let result = buffer else {
            throw NSError(domain: "BackdropLifecycleTests", code: Int(status),
                          userInfo: [NSLocalizedDescriptionKey: "CVPixelBufferCreate failed"])
        }
        return result
    }
}

// MARK: - Counting fake

/// `BackdropCapturing` fake that records init / invalidate / capture call
/// counts so tests can assert pooling + invalidation semantics without
/// touching the real Metal + CARenderer pipeline.
///
/// Tracks a global init counter so tests can swap the compositor's factory
/// closure with `{ CountingBackdropCapture() }` and still observe how many
/// times the factory fired.
@MainActor
private final class CountingBackdropCapture: BackdropCapturing {

    static var globalInitCount: Int = 0

    static func resetGlobalInitCount() {
        globalInitCount = 0
    }

    private(set) var invalidateCount: Int = 0
    private(set) var captureCount: Int = 0
    /// Increments every time `captureCanvasBackdrop` is called WHILE the
    /// previous operation on this fake was `invalidate()` (i.e. the
    /// invalidate→capture ordering held for that frame).
    private(set) var invalidateBeforeCaptureCount: Int = 0

    private var lastWasInvalidate: Bool = false

    init() {
        Self.globalInitCount += 1
    }

    @discardableResult
    func captureCanvasBackdrop(slide: StorySlide,
                               geometry: CanvasGeometry,
                               time: CMTime,
                               mode: RenderMode,
                               languages: [String]) -> MTLTexture? {
        captureCount += 1
        if lastWasInvalidate { invalidateBeforeCaptureCount += 1 }
        lastWasInvalidate = false
        return nil
    }

    func cropRegion(_ frame: CGRect) -> MTLTexture? {
        lastWasInvalidate = false
        return nil
    }

    func invalidate() {
        invalidateCount += 1
        lastWasInvalidate = true
    }
}
