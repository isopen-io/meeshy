import AVFoundation
import CoreMedia
import QuartzCore
import UIKit
import MeeshySDK

/// Custom video compositor that draws each export frame using the same shared
/// `StoryRenderer.render()` consumed by the live composer/viewer canvas.
///
/// Bit-exact equivalence rationale: AVFoundation invokes `startRequest(_:)`
/// on its own worker queue. `StoryRenderer.render` is `@MainActor`-isolated
/// because the CALayer subclasses it instantiates touch `UIScreen.main.scale`
/// and `AVPlayer` at configure time. We bridge the worker thread to the main
/// actor for the duration of one frame via `DispatchQueue.main.sync` +
/// `MainActor.assumeIsolated`.
///
/// Concurrency caveat:
///   `StoryExporter.export()` MUST NOT be called from `MainActor` synchronously
///   (e.g. inside a `DispatchQueue.main.sync` block) — that would deadlock when
///   the worker thread tries to bridge back to main. Always call from a `Task`.
public final class StoryAVCompositor: NSObject, nonisolated AVVideoCompositing, @unchecked Sendable {

    private nonisolated let contextQueue = DispatchQueue(label: "me.meeshy.story.compositor.context")
    private nonisolated(unsafe) var _renderContext: AVVideoCompositionRenderContext?
    private nonisolated(unsafe) var _shouldCancelAllRequests = false

    /// Layer-tree cache reused across the export's frames. AVFoundation
    /// instantiates one `StoryAVCompositor` per export session via
    /// `customVideoCompositorClass`, so the cache lifetime matches the export
    /// session — no manual reset needed between exports. The cache itself
    /// guards against scope drift (slide/language/mode changes) via
    /// `invalidateIfNeeded` at the top of `renderFrame`.
    ///
    /// Exposed `internal` so unit tests in the same module can observe
    /// `cacheHitCount` / `cacheMissCount` after driving frames through
    /// `startRequest`.
    internal nonisolated let layerCache = StoryRendererCache()

    /// Backdrop-capture instance reused across the export's frames. Lazily
    /// created on the main actor at the first `renderFrame` so we can stay
    /// `nonisolated` in `init` (AVFoundation instantiates the compositor via
    /// `customVideoCompositorClass` using `init()`, which must remain
    /// nonisolated).
    ///
    /// Why pool: a 10 s × 60 fps export drives `renderFrame` 600 times. Each
    /// `StoryBackdropCapture()` allocation is cheap on its own, but every
    /// call to `captureCanvasBackdrop` it serves leaks an `MTLTexture` of
    /// `renderSize` (~8 MB at 1080×1920 BGRA8) into the shared GPU/CPU heap
    /// until the next ARC sweep. Pooling collapses the peak shared-memory
    /// footprint from O(frames) to O(1) — the capture's `invalidate()` is
    /// called at the top of every `renderFrame`, which releases the
    /// previous frame's texture before the next `captureCanvasBackdrop`
    /// allocates its replacement.
    ///
    /// Long-lived Metal resources (device, command queue, pipeline state)
    /// live on `StoryRenderingContext.shared` and are never touched by
    /// `invalidate()`, so the only thing pooled here is the
    /// `StoryBackdropCapture` instance itself + its two `MTLTexture?` slots.
    ///
    /// Exposed `internal` so unit tests can swap the factory via
    /// `backdropCaptureFactory` and observe instance reuse.
    private nonisolated(unsafe) var _backdropCapture: (any BackdropCapturing)?

    /// Factory invoked once per compositor instance to produce the shared
    /// backdrop capture. Defaults to the production `StoryBackdropCapture`.
    /// Tests assign a fake factory before driving frames through
    /// `startRequest` to assert pooling behaviour without the full Metal +
    /// CARenderer pipeline.
    internal nonisolated(unsafe) var backdropCaptureFactory: @MainActor () -> any BackdropCapturing = {
        StoryBackdropCapture()
    }

    public override nonisolated init() {
        super.init()
    }

    public nonisolated let sourcePixelBufferAttributes: [String: any Sendable]? = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    public nonisolated let requiredPixelBufferAttributesForRenderContext: [String: any Sendable] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    public nonisolated func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
        contextQueue.sync { _renderContext = newRenderContext }
    }

    public nonisolated func cancelAllPendingVideoCompositionRequests() {
        // Set the cancel flag immediately (sync) so any startRequest reaching
        // `contextQueue.sync { _shouldCancelAllRequests }` next observes it.
        // Then clear it asynchronously — the async runs AFTER all pending sync
        // blocks drain on the serial contextQueue, so every in-flight request
        // sees true, and any fresh session that reuses this compositor sees
        // false again. The original implementation cleared synchronously in a
        // second `sync` block, which made the cancellation window essentially
        // zero — in-flight requests almost never observed it, silently leaking
        // export sessions when the user dismissed the export UI mid-render.
        contextQueue.sync { _shouldCancelAllRequests = true }
        contextQueue.async { [weak self] in
            self?._shouldCancelAllRequests = false
        }
    }

    public nonisolated func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        let cancelled = contextQueue.sync { _shouldCancelAllRequests }
        if cancelled {
            request.finishCancelledRequest()
            return
        }
        guard let renderContext = contextQueue.sync(execute: { _renderContext }) else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -1,
                                          userInfo: [NSLocalizedDescriptionKey: "No render context"]))
            return
        }
        guard let instruction = request.videoCompositionInstruction as? StoryCompositionInstruction else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -2,
                                          userInfo: [NSLocalizedDescriptionKey: "Unsupported instruction"]))
            return
        }
        guard let buffer = renderContext.newPixelBuffer() else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -3,
                                          userInfo: [NSLocalizedDescriptionKey: "Pixel buffer alloc failed"]))
            return
        }

        // The pixel buffer is produced and consumed on the main actor (where
        // StoryRenderer.render runs) — finishing the request from inside the
        // bridged main-actor block keeps `buffer` from crossing isolation
        // boundaries (CVPixelBuffer is not Sendable in Swift 6).
        let cache = layerCache
        DispatchQueue.main.sync {
            MainActor.assumeIsolated {
                do {
                    let backdropCapture = self.sharedBackdropCapture()
                    try Self.renderFrame(slide: instruction.slide,
                                         at: request.compositionTime,
                                         renderSize: renderContext.size,
                                         into: buffer,
                                         cache: cache,
                                         backdropCapture: backdropCapture)
                    request.finish(withComposedVideoFrame: buffer)
                } catch {
                    request.finish(with: error)
                }
            }
        }
    }

    /// Lazily creates (on first call) and returns the per-export shared
    /// `BackdropCapturing` instance. Must be called on the main actor — the
    /// factory closure is `@MainActor` because `StoryBackdropCapture` is
    /// MainActor-isolated.
    @MainActor
    internal func sharedBackdropCapture() -> any BackdropCapturing {
        if let existing = _backdropCapture {
            return existing
        }
        let created = backdropCaptureFactory()
        _backdropCapture = created
        return created
    }

    /// Per-frame render entry point. Exposed `internal` so tests can drive it
    /// directly with a counting `BackdropCapturing` fake without standing up
    /// the full AVFoundation request pipeline.
    @MainActor
    internal static func renderFrame(slide: StorySlide,
                                     at time: CMTime,
                                     renderSize: CGSize,
                                     into buffer: CVPixelBuffer,
                                     cache: StoryRendererCache,
                                     backdropCapture: any BackdropCapturing) throws {
        // Scope check: flush the cache if the slide / languages / mode this
        // compositor is now processing differs from the previous frame's
        // scope. For a single export session this is true only on the first
        // frame, so the cache is a no-op miss-then-hit-forever steady state.
        cache.invalidateIfNeeded(slideId: slide.id, languages: [], mode: .play)

        let geometry = CanvasGeometry(renderSize: renderSize)

        // Per-frame backdrop reset: drop the previous frame's
        // `MTLTexture` snapshot so `captureCanvasBackdrop` rebuilds against
        // the current `time` / slide state. The capture *instance itself* is
        // shared across all frames of the export (see `_backdropCapture`),
        // which collapses peak shared-memory footprint from
        // O(frames × renderSize) to O(renderSize). The capture is a no-op
        // when the slide has no glass-style text — common path remains
        // untouched.
        backdropCapture.invalidate()
        _ = backdropCapture.captureCanvasBackdrop(slide: slide,
                                                  geometry: geometry,
                                                  time: time,
                                                  mode: .play,
                                                  languages: [])

        let layer = StoryRenderer.render(slide: slide,
                                          into: geometry,
                                          at: time,
                                          mode: .play,
                                          languages: [],
                                          cache: cache,
                                          backdropProvider: { frame in
                                              backdropCapture.cropRegion(frame)
                                          })

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

        let width = CVPixelBufferGetWidth(buffer)
        let height = CVPixelBufferGetHeight(buffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        guard let baseAddress = CVPixelBufferGetBaseAddress(buffer) else {
            throw NSError(domain: "StoryAVCompositor", code: -4,
                          userInfo: [NSLocalizedDescriptionKey: "No base address"])
        }

        // 32BGRA = byte order little-endian + premultiplied first alpha.
        // Without `byteOrder32Little`, CoreGraphics interprets bytes in big-endian
        // order (ARGB) and channels come out swapped (red↔blue).
        let bitmapInfo = CGImageByteOrderInfo.order32Little.rawValue
            | CGImageAlphaInfo.premultipliedFirst.rawValue

        guard let cg = CGContext(data: baseAddress,
                                  width: width,
                                  height: height,
                                  bitsPerComponent: 8,
                                  bytesPerRow: bytesPerRow,
                                  space: StoryRenderingContext.shared.workingColorSpace,
                                  bitmapInfo: bitmapInfo) else {
            throw NSError(domain: "StoryAVCompositor", code: -5,
                          userInfo: [NSLocalizedDescriptionKey: "CGContext creation failed"])
        }

        // CALayer renders in UIKit top-down coordinates ; CGContext defaults to
        // bottom-up. Flip Y so the buffer lays out frames upright.
        cg.translateBy(x: 0, y: CGFloat(height))
        cg.scaleBy(x: 1, y: -1)

        layer.render(in: cg)
    }
}

/// Composition instruction carrying the `StorySlide` whose frame at any given
/// `CMTime` is delegated to `StoryRenderer.render` by `StoryAVCompositor`.
public final class StoryCompositionInstruction: NSObject,
                                                 AVVideoCompositionInstructionProtocol,
                                                 @unchecked Sendable {
    public let slide: StorySlide
    public let timeRange: CMTimeRange
    public let enablePostProcessing: Bool = false
    public let containsTweening: Bool = true
    public let requiredSourceTrackIDs: [NSValue]? = nil
    public let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    public nonisolated init(slide: StorySlide, timeRange: CMTimeRange) {
        self.slide = slide
        self.timeRange = timeRange
        super.init()
    }
}
