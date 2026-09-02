import AVFoundation
import CoreImage
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

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

    /// Decodes foreground overlay video frames per export tick. One instance per
    /// export session (like `layerCache`); it memoises an `AVAssetImageGenerator`
    /// per media id. The live foreground video renders through an `AVPlayerLayer`
    /// that `CALayer.render(in:)` cannot capture, so the compositor paints a
    /// decoded frame from here as the media layer's contents instead.
    private nonisolated let foregroundVideoFrameSource = StoryForegroundVideoFrameSource()

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

        // Pull the decoded frame of the (single) source video track. With a
        // custom compositor NOTHING reaches the output unless we draw it —
        // `newPixelBuffer()` hands back an EMPTY buffer. When the slide has a
        // background video this frame carries its footage and `renderFrame`
        // paints it for the `.video` background case. Without this the exported
        // MP4 shows a black background while the audio (baked into a separate
        // track) still plays — the "sound over black" bug. nil for
        // static-only / image-background slides (their substrate is overpainted).
        // Le substrat de la STORY vient de sa piste nommée. On ne peut plus se
        // contenter de `sourceTrackIDs.first` : depuis que l'emballage de marque
        // est composé dans cette même passe, la composition porte jusqu'à trois
        // pistes vidéo et l'ordre n'est pas garanti.
        let storyTrackID = instruction.storyTrackID != kCMPersistentTrackID_Invalid
            ? instruction.storyTrackID
            : (request.sourceTrackIDs.first?.int32Value ?? kCMPersistentTrackID_Invalid)
        let sourceVideoFrame: CVPixelBuffer? = request.sourceFrame(byTrackID: storyTrackID)
        let introFrame: CVPixelBuffer? = instruction.introTrackID
            .flatMap { request.sourceFrame(byTrackID: $0) }
        let outroFrame: CVPixelBuffer? = instruction.outroTrackID
            .flatMap { request.sourceFrame(byTrackID: $0) }

        // Temps de STORY : les keyframes, transitions et le filigrane restent
        // datés depuis le début de la slide, pas depuis celui de l'interlude.
        let storyTime = CMTimeSubtract(request.compositionTime, instruction.storyStart)
        let storyAlpha = instruction.storyOpacity(at: request.compositionTime)
        let outroAlpha = instruction.outroOpacity(at: request.compositionTime)

        // The pixel buffer is produced and consumed on the main actor (where
        // StoryRenderer.render runs) — finishing the request from inside the
        // bridged main-actor block keeps `buffer` from crossing isolation
        // boundaries (CVPixelBuffer is not Sendable in Swift 6).
        let cache = layerCache
        // Decode foreground overlay frames HERE, on the compositor's worker
        // queue — NEVER inside the bridged `main.sync` below, where a synchronous
        // `AVAssetImageGenerator` decode deadlocks against AVFoundation (the
        // export would hang indefinitely). The provider then just looks up the
        // pre-decoded frame by media id.
        let overlayFrames = foregroundVideoFrameSource.decodeOverlayFrames(
            slide: instruction.slide, at: storyTime)
        DispatchQueue.main.sync {
            MainActor.assumeIsolated {
                do {
                    let backdropCapture = self.sharedBackdropCapture()
                    try Self.renderFrame(slide: instruction.slide,
                                         languages: instruction.languages,
                                         at: storyTime,
                                         renderSize: renderContext.size,
                                         into: buffer,
                                         backgroundVideoFrame: sourceVideoFrame,
                                         backgroundVideoTransform: instruction.backgroundVideoTransform,
                                         cache: cache,
                                         backdropCapture: backdropCapture,
                                         mediaFrameProvider: { media, _ in
                                             overlayFrames[media.id]
                                         },
                                         watermark: instruction.watermark,
                                         brandUnderlay: introFrame,
                                         storyOpacity: storyAlpha,
                                         brandOverlay: outroFrame,
                                         overlayOpacity: outroAlpha)
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
    ///      the slide's opening effect during the first
    ///      `StoryRenderer.slideTransitionDuration` of playback so the baked
    ///      MP4 mirrors the live viewer/preview.
    @MainActor
    internal static func renderFrame(slide: StorySlide,
                                     languages: [String] = [],
                                     at time: CMTime,
                                     renderSize: CGSize,
                                     into buffer: CVPixelBuffer,
                                     backgroundVideoFrame: CVPixelBuffer? = nil,
                                     backgroundVideoTransform: CGAffineTransform = .identity,
                                     cache: StoryRendererCache,
                                     backdropCapture: any BackdropCapturing,
                                     mediaFrameProvider: ((StoryMediaObject, CMTime) -> CGImage?)? = nil,
                                     watermark: StoryExportWatermark? = nil,
                                     brandUnderlay: CVPixelBuffer? = nil,
                                     storyOpacity: CGFloat = 1,
                                     brandOverlay: CVPixelBuffer? = nil,
                                     overlayOpacity: CGFloat = 0) throws {
        // Pendant la tenue de l'interlude de marque, la story est totalement
        // masquée : ni backdrop, ni arbre de layers, ni rasterisation. C'est
        // l'étage le plus cher du pipeline — le sauter rend ces frames-là
        // quasi gratuites.
        let paintsStory = storyOpacity > 0.001
        var layer: CALayer?
        if paintsStory {
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
            let tree = StoryRenderer.render(slide: slide,
                                            into: geometry,
                                            at: time,
                                            mode: .play,
                                            languages: languages,
                                            cache: cache,
                                            backdropProvider: { frame in
                                                backdropCapture.cropRegion(frame)
                                            },
                                            mediaFrameProvider: mediaFrameProvider,
                                            contentsScale: 1.0,
                                            reduceMotion: false)

            // Opening transition — only visible during the first
            // `StoryRenderer.slideTransitionDuration`. The live canvas uses
            // `CABasicAnimation`, but `layer.render(in:)` doesn't run the
            // animation engine — it renders the model layer as-is. So we
            // apply the static state of the opening at the current playhead
            // directly on the model layer.
            applyStaticOpening(slide.effects.opening, rootLayer: tree, elapsed: time.seconds)
            layer = tree
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

        let canvasSize = CGSize(width: width, height: height)

        // Couche du DESSOUS — l'interlude de marque. Il tient à pleine opacité
        // puis la story se lève par-dessus : c'est ce recouvrement progressif
        // qui produit le fondu croisé, sans piste ni passe supplémentaire.
        if let brandUnderlay {
            Self.paintBrandFrame(brandUnderlay, in: cg, size: canvasSize)
        }

        // Story invisible (on est dans la tenue de l'interlude) : rien à peindre
        // et surtout rien à rendre — l'arbre de layers n'a même pas été
        // construit plus haut.
        guard let layer else {
            if let brandOverlay, overlayOpacity > 0.001 {
                cg.saveGState()
                cg.setAlpha(overlayOpacity)
                Self.paintBrandFrame(brandOverlay, in: cg, size: canvasSize)
                cg.restoreGState()
            }
            return
        }

        // La story se compose en UN SEUL groupe : appliquer l'alpha primitive
        // par primitive éclaircirait les recouvrements internes de la slide.
        let blendsStory = storyOpacity < 0.999
        if blendsStory {
            cg.saveGState()
            cg.setAlpha(storyOpacity)
            cg.beginTransparencyLayer(auxiliaryInfo: nil)
        }

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
            // Draw the decoded source frame of the background video track. The
            // custom compositor receives an EMPTY destination buffer, so unless
            // we paint the frame here the exported MP4 shows a black background
            // (with the video's audio still baked into a separate track — the
            // "sound over black" bug). nil during a transparent no-loop tail.
            if let videoFrame = backgroundVideoFrame {
                Self.paintVideoFrame(videoFrame,
                                     transform: backgroundVideoTransform,
                                     slide: slide,
                                     in: cg,
                                     size: CGSize(width: width, height: height))
            }
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
            watermark.draw(in: cg,
                           renderSize: canvasSize,
                           at: time.seconds)
        }

        if blendsStory {
            cg.endTransparencyLayer()
            cg.restoreGState()
        }

        // Couche du DESSUS — la carte de fin, qui monte en fondu sur la fin.
        if let brandOverlay, overlayOpacity > 0.001 {
            cg.saveGState()
            cg.setAlpha(overlayOpacity)
            Self.paintBrandFrame(brandOverlay, in: cg, size: canvasSize)
            cg.restoreGState()
        }
    }

    /// Peint plein cadre une frame de clip de marque. Ces clips sont encodés au
    /// gabarit exact de la composition : ni recadrage ni orientation à gérer.
    @MainActor
    private static func paintBrandFrame(_ pixelBuffer: CVPixelBuffer,
                                        in cg: CGContext,
                                        size: CGSize) {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        guard let cgImage = StoryRenderingContext.shared.ciContext.createCGImage(
            ciImage, from: ciImage.extent) else { return }
        cg.saveGState()
        // Le contexte est en repère UIKit (flip global) ; `draw` dessine
        // bottom-up, d'où le re-flip local.
        cg.translateBy(x: 0, y: size.height)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(cgImage, in: CGRect(origin: .zero, size: size))
        cg.restoreGState()
    }

    /// Applies the static state of an opening transition to `rootLayer` at
    /// playback position `elapsed` — the frame-by-frame twin of
    /// `StoryRenderer.applyOpening` (same signature, same window, no-op past
    /// it or without effect). `layer.render(in:)` doesn't run the animation
    /// engine, so the value a `CABasicAnimation` would be interpolating is
    /// written by hand on the model layer: `.zoom` / `.slide` sample
    /// `StoryRenderer.openingSublayerTransform`, the very curve the live
    /// animation runs between its two ends. Progress is
    /// `elapsed / StoryRenderer.slideTransitionDuration` clamped to `[0, 1]`.
    @MainActor
    static func applyStaticOpening(_ effect: StoryTransitionEffect?,
                                   rootLayer: CALayer,
                                   elapsed: Double) {
        guard let effect, elapsed < StoryRenderer.slideTransitionDuration else { return }
        let progress = max(0.0, min(1.0, elapsed / StoryRenderer.slideTransitionDuration))
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
            rootLayer.sublayerTransform = StoryRenderer.openingSublayerTransform(
                effect, progress: progress, canvasWidth: rootLayer.bounds.width)
        }
    }

    /// Dernier bitmap de fond décodé, mémoïsé par adresse.
    ///
    /// `resolveBackgroundImage` est appelé à CHAQUE frame ; sans mémo, une story
    /// de 10 s re-décode 300 fois le même JPEG plein cadre. Une seule entrée
    /// suffit : une slide n'a qu'un fond, et l'entrée se remplace d'elle-même dès
    /// que l'adresse change. Isolé `@MainActor` comme `renderFrame`, son unique
    /// lecteur.
    ///
    /// Contrepartie assumée : un bitmap (≈ 8 Mo en 1080×1920) reste retenu après
    /// le dernier export, jusqu'à ce que l'export suivant le remplace. C'est le
    /// prix d'un slot unique sans `deinit` — un `deinit` isolé sur ce type ferait
    /// courir le risque de double-libération documenté par SE-0466 sur iOS < 26.
    @MainActor
    private static var backgroundImageMemo: (key: String, image: UIImage)?

    /// Resolves the bitmap for a slide whose background is an image.
    ///
    /// Priorité IDENTIQUE à celle de `StoryRenderer.renderBackground` : l'entrée
    /// `mediaObjects` marquée `isBackground && kind == .image` d'abord, puis le
    /// fond legacy porté par `StorySlide.mediaURL` (stories d'avant les
    /// mediaObjects, et backdrop statique d'une story moderne — cf.
    /// `StoryItem.toRenderableSlide`). Ce second cas n'était pas couvert : le
    /// renderer annonçait `.image`, le compositor ne trouvait rien, et le fond
    /// sortait noir du MP4.
    ///
    /// L'adresse est attendue LOCALE — `StoryExporter.hydratingLocalMedia` a
    /// rapatrié les URLs distantes avant que la composition ne commence, parce
    /// qu'ici on est sur le main actor, en synchrone, une fois par frame.
    /// Retourne `nil` si l'image ne charge pas — l'appelant laisse alors le
    /// substrat intact.
    @MainActor
    private static func resolveBackgroundImage(for slide: StorySlide) -> UIImage? {
        let candidate: String?
        if let bg = slide.effects.mediaObjects?.first(where: {
            $0.isBackground && $0.kind == .image
        }) {
            candidate = bg.mediaURL
        } else {
            candidate = slide.mediaURL
        }
        guard let candidate, !candidate.isEmpty else { return nil }

        if let memo = backgroundImageMemo, memo.key == candidate { return memo.image }

        let loaded: UIImage?
        if let url = URL(string: candidate), url.isFileURL {
            loaded = UIImage(contentsOfFile: url.path)
        } else {
            loaded = UIImage(contentsOfFile: candidate)
        }
        guard let image = loaded else { return nil }
        backgroundImageMemo = (candidate, image)
        return image
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

    /// Draws the decoded frame of the background video track into `cg`,
    /// honouring the track's `preferredTransform` (camera clips are commonly
    /// stored rotated) and the slide's `videoFitMode` — a direct mirror of the
    /// `.image` background case. `paintAspectFill` / `paintAspectFit` apply the
    /// same UIKit top-down flip the image path relies on.
    @MainActor
    private static func paintVideoFrame(_ pixelBuffer: CVPixelBuffer,
                                        transform: CGAffineTransform,
                                        slide: StorySlide,
                                        in cg: CGContext,
                                        size: CGSize) {
        var ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        if !transform.isIdentity {
            ciImage = ciImage.transformed(by: transform)
            // Re-seat the extent at the origin after a rotating/translating
            // preferredTransform so `createCGImage` captures the whole frame.
            ciImage = ciImage.transformed(
                by: CGAffineTransform(translationX: -ciImage.extent.origin.x,
                                      y: -ciImage.extent.origin.y))
        }
        guard let cgImage = StoryRenderingContext.shared.ciContext.createCGImage(
            ciImage, from: ciImage.extent) else { return }

        let image = UIImage(cgImage: cgImage)
        let gravity = StoryBackgroundLayer.resolveImageGravity(
            naturalSize: image.size,
            canvasSize: size,
            override: slide.effects.backgroundTransform?.videoFitMode)
        if gravity == .resizeAspect {
            if let bgHex = slide.effects.background, let color = parseHex(bgHex) {
                cg.saveGState()
                cg.setFillColor(color.cgColor)
                cg.fill(CGRect(origin: .zero, size: size))
                cg.restoreGState()
            }
            paintAspectFit(image: image, in: cg, size: size)
        } else {
            paintAspectFill(image: image, in: cg, size: size)
        }
    }
}

/// Composition instruction carrying the `StorySlide` whose frame at any given
/// `CMTime` is delegated to `StoryRenderer.render` by `StoryAVCompositor`.
/// `languages` is threaded so the baked MP4 reflects the author's chosen
/// export language (Prisme Linguistique).
public final class StoryCompositionInstruction: NSObject,
                                                 AVVideoCompositionInstructionProtocol,
                                                 @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public let slide: StorySlide
    public let languages: [String]
    public let timeRange: CMTimeRange
    public let watermark: StoryExportWatermark?
    /// `preferredTransform` of the background video track (identity when the
    /// slide has no background video). The custom compositor receives decoded
    /// source frames in their storage orientation, so it must apply this itself.
    public let backgroundVideoTransform: CGAffineTransform
    /// Décalage de la story dans la composition — non nul quand un interlude de
    /// marque la précède. TOUT le rendu de la slide se fait à
    /// `compositionTime - storyStart` : keyframes, transitions et filigrane
    /// restent datés en temps de story.
    public let storyStart: CMTime
    /// Piste portant le substrat de la story (fond vidéo ou substrat synthétique).
    public let storyTrackID: CMPersistentTrackID
    /// Pistes des clips de marque, `nil` quand l'emballage est absent.
    public let introTrackID: CMPersistentTrackID?
    public let outroTrackID: CMPersistentTrackID?
    /// Fenêtres de fondu, en temps de COMPOSITION.
    public let introFade: CMTimeRange?
    public let outroFade: CMTimeRange?
    public let enablePostProcessing: Bool = false
    public let containsTweening: Bool = true
    /// Pistes que ce segment consomme RÉELLEMENT.
    ///
    /// `nil` signifie « toutes les pistes de la composition » : AVFoundation
    /// décode alors les trois pistes (story + interlude + carte de fin) pour
    /// CHAQUE frame, y compris là où deux d'entre elles sont invisibles. Avec
    /// l'emballage composé dans le bake, ça multipliait le coût de l'export.
    /// `StoryExporter` segmente donc la timeline et déclare, segment par
    /// segment, les seules pistes utiles.
    public let requiredSourceTrackIDs: [NSValue]?
    public let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    public nonisolated init(slide: StorySlide, languages: [String] = [],
                            timeRange: CMTimeRange,
                            watermark: StoryExportWatermark? = nil,
                            backgroundVideoTransform: CGAffineTransform = .identity,
                            storyStart: CMTime = .zero,
                            storyTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid,
                            introTrackID: CMPersistentTrackID? = nil,
                            outroTrackID: CMPersistentTrackID? = nil,
                            introFade: CMTimeRange? = nil,
                            outroFade: CMTimeRange? = nil,
                            requiredSourceTrackIDs: [NSValue]? = nil) {
        self.requiredSourceTrackIDs = requiredSourceTrackIDs
        self.slide = slide
        self.languages = languages
        self.timeRange = timeRange
        self.watermark = watermark
        self.backgroundVideoTransform = backgroundVideoTransform
        self.storyStart = storyStart
        self.storyTrackID = storyTrackID
        self.introTrackID = introTrackID
        self.outroTrackID = outroTrackID
        self.introFade = introFade
        self.outroFade = outroFade
        super.init()
    }

    /// Opacité de la couche STORY au temps de composition `t` : elle se lève
    /// pendant le fondu d'ouverture, tient, puis s'efface sous la carte de fin.
    /// Hors emballage, elle vaut 1 partout.
    nonisolated func storyOpacity(at t: CMTime) -> CGFloat {
        var alpha: CGFloat = 1
        if let fade = introFade, fade.duration > .zero {
            alpha *= Self.progress(t, in: fade)
        }
        if let fade = outroFade, fade.duration > .zero {
            alpha *= 1 - Self.progress(t, in: fade)
        }
        return alpha
    }

    /// Opacité de la carte de fin : nulle avant son fondu, pleine ensuite.
    nonisolated func outroOpacity(at t: CMTime) -> CGFloat {
        guard let fade = outroFade, fade.duration > .zero else { return 0 }
        return Self.progress(t, in: fade)
    }

    /// Fraction `0…1` de `t` dans `range`, bornée aux extrémités.
    nonisolated static func progress(_ t: CMTime, in range: CMTimeRange) -> CGFloat {
        if t <= range.start { return 0 }
        let end = CMTimeAdd(range.start, range.duration)
        if t >= end { return 1 }
        return CGFloat(CMTimeGetSeconds(CMTimeSubtract(t, range.start))
                       / CMTimeGetSeconds(range.duration))
    }
}
