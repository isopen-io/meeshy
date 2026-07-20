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
                                         languages: instruction.languages,
                                         at: request.compositionTime,
                                         renderSize: renderContext.size,
                                         into: buffer,
                                         cache: cache,
                                         backdropCapture: backdropCapture,
                                         watermark: instruction.watermark)
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
    ///
    /// Renders into the pixel buffer in three layers (back to front) :
    ///   1. **Background** — resolved via `StoryRenderer.renderBackground`.
    ///      Solid color is painted directly; image background is drawn
    ///      `aspectFill`. Video backgrounds are supplied by the composition's
    ///      video track and the renderer leaves the substrate untouched.
    ///   2. **Foreground items** — `StoryRenderer.render` produces the layer
    ///      tree (text, media, stickers, persisted drawing).
    ///   3. **Opening transition** — `StoryRenderer.applyOpening` overlays
    ///      the slide's opening effect during the first 0.5s of playback so
    ///      the baked MP4 mirrors the live viewer/preview.
    @MainActor
    internal static func renderFrame(slide: StorySlide,
                                     languages: [String] = [],
                                     at time: CMTime,
                                     renderSize: CGSize,
                                     into buffer: CVPixelBuffer,
                                     cache: StoryRendererCache,
                                     backdropCapture: any BackdropCapturing,
                                     watermark: StoryExportWatermark? = nil) throws {
        // Scope check: flush the cache if the slide / languages / mode this
        // compositor is now processing differs from the previous frame's
        // scope.
        cache.invalidateIfNeeded(slideId: slide.id, languages: languages, mode: .play)

        let geometry = CanvasGeometry(renderSize: renderSize)

        backdropCapture.invalidate()
        _ = backdropCapture.captureCanvasBackdrop(slide: slide,
                                                  geometry: geometry,
                                                  time: time,
                                                  mode: .play,
                                                  languages: languages)

        // Foreground layer tree (text/media/stickers/drawing).
        let layer = StoryRenderer.render(slide: slide,
                                          into: geometry,
                                          at: time,
                                          mode: .play,
                                          languages: languages,
                                          cache: cache,
                                          backdropProvider: { frame in
                                              backdropCapture.cropRegion(frame)
                                          },
                                          contentsScale: 1.0)

        // Opening transition — only visible during the first 0.5s. The
        // live canvas uses `CABasicAnimation`, but `layer.render(in:)`
        // doesn't run the animation engine — it renders the model layer
        // as-is. So we apply the static state of the opening at the
        // current playhead directly on the model layer.
        if let opening = slide.effects.opening, time.seconds < 0.5 {
            applyStaticOpening(opening, rootLayer: layer, elapsed: time.seconds)
        }

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

        let width = CVPixelBufferGetWidth(buffer)
        let height = CVPixelBufferGetHeight(buffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        guard let baseAddress = CVPixelBufferGetBaseAddress(buffer) else {
            throw NSError(domain: "StoryAVCompositor", code: -4,
                          userInfo: [NSLocalizedDescriptionKey: "No base address"])
        }

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

        // Paint the slide background BEFORE the foreground tree so the
        // baked MP4 matches the live preview exactly. For video backgrounds
        // we leave the AVFoundation-supplied substrate frame untouched
        // (StoryExporter wires the bg video into the composition's video
        // track). For static (color/image) backgrounds the substrate is the
        // synthetic transparent track encoded as opaque black — we OVERPAINT
        // it with the slide's background.
        let bgKind = StoryRenderer.renderBackground(slide: slide, languages: languages)
        switch bgKind {
        case .video:
            // Substrate already carries video frames — nothing to overpaint.
            break
        case .solidColor(let color):
            cg.saveGState()
            cg.setFillColor(color.cgColor)
            cg.fill(CGRect(origin: .zero, size: CGSize(width: width, height: height)))
            cg.restoreGState()
        case .gradient(let colors, let direction):
            // Mirrors `StoryBackgroundLayer.configure` gradient setup so the
            // baked MP4 matches the live preview. The context is already
            // flipped (translateBy + scaleBy above) so coordinates are
            // UIKit-style — y=0 at top, y=height at bottom.
            let cgColors = colors.map { $0.cgColor } as CFArray
            let space = StoryRenderingContext.shared.workingColorSpace
            if let gradient = CGGradient(colorsSpace: space,
                                          colors: cgColors,
                                          locations: nil) {
                let w = CGFloat(width)
                let h = CGFloat(height)
                let start: CGPoint
                let end: CGPoint
                switch direction {
                case .topToBottom:
                    start = CGPoint(x: w / 2, y: 0)
                    end = CGPoint(x: w / 2, y: h)
                case .leftToRight:
                    start = CGPoint(x: 0, y: h / 2)
                    end = CGPoint(x: w, y: h / 2)
                case .topLeftToBottomRight:
                    start = .zero
                    end = CGPoint(x: w, y: h)
                }
                cg.saveGState()
                cg.drawLinearGradient(gradient, start: start, end: end, options: [])
                cg.restoreGState()
            } else if let first = colors.first {
                // Fallback : if gradient creation fails (e.g. zero colors)
                // paint the first color so the slide isn't pure black.
                cg.saveGState()
                cg.setFillColor(first.cgColor)
                cg.fill(CGRect(origin: .zero, size: CGSize(width: width, height: height)))
                cg.restoreGState()
            }
        case .image:
            // Image backgrounds resolve through `StoryBackgroundLayer.configure`
            // which reads the media object's local file URL OR fetches via
            // CacheCoordinator. Respect the user's videoFitMode override
            // (auto / "fit" / "fill") so the export matches the canvas.
            if let bgImage = resolveBackgroundImage(for: slide) {
                let canvasSize = CGSize(width: width, height: height)
                let mode = slide.effects.backgroundTransform?.videoFitMode
                let gravity = StoryBackgroundLayer.resolveImageGravity(
                    naturalSize: bgImage.size,
                    canvasSize: canvasSize,
                    override: mode)
                if gravity == .resizeAspect {
                    // Letterbox: paint the story background color first (revealed by bands)
                    if let bgHex = slide.effects.background,
                       let color = parseHex(bgHex) {
                        cg.saveGState()
                        cg.setFillColor(color.cgColor)
                        cg.fill(CGRect(origin: .zero, size: canvasSize))
                        cg.restoreGState()
                    }
                    paintAspectFit(image: bgImage, in: cg, size: canvasSize)
                } else {
                    paintAspectFill(image: bgImage, in: cg, size: canvasSize)
                }
            }
        }

        layer.render(in: cg)

        if let watermark {
            drawWatermark(watermark, in: cg,
                          renderSize: CGSize(width: width, height: height))
        }
    }

    /// Dessine le watermark par-dessus la frame composée, ancré bas-droite.
    /// Dernière passe du pipeline : rien ne doit se dessiner au-dessus.
    @MainActor
    private static func drawWatermark(_ watermark: StoryExportWatermark,
                                      in cg: CGContext,
                                      renderSize: CGSize) {
        let rect = watermark.frame(in: renderSize)
        cg.saveGState()
        cg.setAlpha(watermark.opacity)
        // Même compensation top-down que paintAspectFill : le contexte est
        // flippé pour CALayer.render(in:), CGContext.draw dessine bottom-up.
        cg.translateBy(x: rect.origin.x, y: rect.origin.y + rect.height)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(watermark.image, in: CGRect(origin: .zero, size: rect.size))
        cg.restoreGState()
    }

    /// Applies the static state of an opening transition to `rootLayer` at
    /// playback position `elapsed`. Mirrors `StoryRenderer.applyOpening` but
    /// without CABasicAnimation — `layer.render(in:)` doesn't run the
    /// animation engine, so we compute the model-layer state by hand each
    /// frame. Progress is `elapsed / 0.5` clamped to `[0, 1]`.
    @MainActor
    private static func applyStaticOpening(_ effect: StoryTransitionEffect,
                                           rootLayer: CALayer,
                                           elapsed: Double) {
        let progress = max(0.0, min(1.0, elapsed / 0.5))
        switch effect {
        case .fade:
            rootLayer.opacity = Float(progress)
        case .reveal:
            let mask = CAShapeLayer()
            mask.frame = rootLayer.bounds
            let center = CGPoint(x: rootLayer.bounds.midX, y: rootLayer.bounds.midY)
            let maxRadius = hypot(rootLayer.bounds.width, rootLayer.bounds.height) / 2
            let radius = max(1, maxRadius * CGFloat(progress))
            mask.path = UIBezierPath(arcCenter: center,
                                     radius: radius,
                                     startAngle: 0,
                                     endAngle: .pi * 2,
                                     clockwise: true).cgPath
            rootLayer.mask = mask
        case .zoom, .slide:
            break
        }
    }

    /// Resolves the bitmap for a slide whose background is an image. Looks
    /// for the first `mediaObjects` entry with `isBackground == true &&
    /// kind == .image`. Tries the local file URL first (composer in-memory
    /// case) then falls back to `mediaURL` as a file path. Returns `nil` if
    /// the image can't be loaded — caller leaves the substrate untouched.
    @MainActor
    private static func resolveBackgroundImage(for slide: StorySlide) -> UIImage? {
        guard let bg = slide.effects.mediaObjects?.first(where: {
            $0.isBackground && $0.kind == .image
        }) else { return nil }
        if let urlString = bg.mediaURL,
           let url = URL(string: urlString),
           url.isFileURL,
           let image = UIImage(contentsOfFile: url.path) {
            return image
        }
        if let path = bg.mediaURL, let image = UIImage(contentsOfFile: path) {
            return image
        }
        return nil
    }

    /// Paints `image` in `cg` to fill `size`, preserving aspect ratio
    /// (`UIView.ContentMode.scaleAspectFill`). Used by `renderFrame` to bake
    /// the slide's background image before the foreground tree renders on top.
    @MainActor
    private static func paintAspectFill(image: UIImage, in cg: CGContext, size: CGSize) {
        guard let cgImage = image.cgImage else { return }
        let imageSize = CGSize(width: cgImage.width, height: cgImage.height)
        let imageAspect = imageSize.width / imageSize.height
        let targetAspect = size.width / size.height
        let drawRect: CGRect
        if imageAspect > targetAspect {
            // image is wider — match height, crop horizontally
            let scaledWidth = size.height * imageAspect
            drawRect = CGRect(x: (size.width - scaledWidth) / 2,
                              y: 0,
                              width: scaledWidth,
                              height: size.height)
        } else {
            // image is taller — match width, crop vertically
            let scaledHeight = size.width / imageAspect
            drawRect = CGRect(x: 0,
                              y: (size.height - scaledHeight) / 2,
                              width: size.width,
                              height: scaledHeight)
        }
        cg.saveGState()
        // The caller flipped the context so CALayer.render(in:) consumes
        // a UIKit-style top-down space. `CGContext.draw(_:in:)` draws
        // bottom-up natively, so we re-flip locally around `drawRect`
        // before drawing the CGImage — otherwise the background appears
        // upside-down vs. the live canvas.
        cg.translateBy(x: drawRect.origin.x, y: drawRect.origin.y + drawRect.size.height)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(cgImage, in: CGRect(origin: .zero, size: drawRect.size))
        cg.restoreGState()
    }

    /// Parses a `#RRGGBB` or `RRGGBB` hex string into a UIColor. Returns nil if
    /// the input doesn't match. Local helper to avoid leaking visibility from
    /// the file-private `UIColor(hex:)` declared in StorySlideRenderer.
    @MainActor
    private static func parseHex(_ hex: String) -> UIColor? {
        var s = hex
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xff) / 255,
                       green: CGFloat((v >> 8) & 0xff) / 255,
                       blue: CGFloat(v & 0xff) / 255,
                       alpha: 1)
    }

    /// Paints `image` in `cg` to FIT entirely inside `size`, preserving aspect
    /// ratio (`UIView.ContentMode.scaleAspectFit`). Letterbox bands appear if
    /// the image aspect ratio differs from the canvas. Caller paints the
    /// background color first so bands are coloured, not transparent.
    @MainActor
    private static func paintAspectFit(image: UIImage, in cg: CGContext, size: CGSize) {
        guard let cgImage = image.cgImage else { return }
        let imageSize = CGSize(width: cgImage.width, height: cgImage.height)
        guard imageSize.width > 0, imageSize.height > 0 else { return }
        let scale = min(size.width / imageSize.width, size.height / imageSize.height)
        let drawSize = CGSize(width: imageSize.width * scale,
                              height: imageSize.height * scale)
        let drawRect = CGRect(x: (size.width - drawSize.width) / 2,
                              y: (size.height - drawSize.height) / 2,
                              width: drawSize.width,
                              height: drawSize.height)
        cg.saveGState()
        // Same UIKit top-down compensation as paintAspectFill — flip locally.
        cg.translateBy(x: drawRect.origin.x, y: drawRect.origin.y + drawRect.size.height)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(cgImage, in: CGRect(origin: .zero, size: drawRect.size))
        cg.restoreGState()
    }
}

/// Composition instruction carrying the `StorySlide` whose frame at any given
/// `CMTime` is delegated to `StoryRenderer.render` by `StoryAVCompositor`.
/// `languages` is threaded so the baked MP4 reflects the author's chosen
/// export language (Prisme Linguistique).
public final class StoryCompositionInstruction: NSObject,
                                                 AVVideoCompositionInstructionProtocol,
                                                 @unchecked Sendable {
    public let slide: StorySlide
    public let languages: [String]
    public let timeRange: CMTimeRange
    public let watermark: StoryExportWatermark?
    public let enablePostProcessing: Bool = false
    public let containsTweening: Bool = true
    public let requiredSourceTrackIDs: [NSValue]? = nil
    public let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    public nonisolated init(slide: StorySlide, languages: [String] = [],
                            timeRange: CMTimeRange,
                            watermark: StoryExportWatermark? = nil) {
        self.slide = slide
        self.languages = languages
        self.timeRange = timeRange
        self.watermark = watermark
        super.init()
    }
}
