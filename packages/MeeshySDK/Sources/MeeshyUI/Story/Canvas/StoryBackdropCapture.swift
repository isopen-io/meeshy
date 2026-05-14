import Foundation
import QuartzCore
import CoreMedia
import Metal
import MeeshySDK

/// Abstraction over `StoryBackdropCapture` used by `StoryAVCompositor` so the
/// compositor can hold a single capture instance across export frames and so
/// unit tests can inject a counting fake without standing up the full
/// Metal/CARenderer pipeline.
///
/// Conforming types are expected to be `@MainActor`-isolated — the only
/// production implementation, `StoryBackdropCapture`, drives the live
/// `StoryRenderer.render` + `CARenderer` pipeline which is MainActor-bound.
@MainActor
public protocol BackdropCapturing: AnyObject {
    /// Rasterizes the slide minus any glass-flagged text item into an
    /// `MTLTexture`. See `StoryBackdropCapture.captureCanvasBackdrop`.
    @discardableResult
    func captureCanvasBackdrop(slide: StorySlide,
                               geometry: CanvasGeometry,
                               time: CMTime,
                               mode: RenderMode,
                               languages: [String]) -> MTLTexture?

    /// Returns a region of the cached canvas backdrop matching `frame`. See
    /// `StoryBackdropCapture.cropRegion`.
    func cropRegion(_ frame: CGRect) -> MTLTexture?

    /// Drops any per-tick caches (canvas backdrop, render size) so the next
    /// `captureCanvasBackdrop` rebuilds against the latest slide state.
    /// Conforming types MUST preserve any expensive long-lived resources
    /// (Metal device handles, command queues, pipeline state) across calls
    /// to `invalidate()` — only per-frame caches are dropped.
    func invalidate()
}

/// Two-pass backdrop snapshot helper for `StoryGlassBackdropLayer`.
///
/// `StoryGlassBackdropLayer` ships two render paths:
///
/// 1. **MPS / GPU path** (preferred) — consumes a real `MTLTexture` snapshot of
///    the canvas region beneath each glass-text layer, blurs it through
///    `MPSImageGaussianBlur`, and presents it as the layer's `contents`.
///
/// 2. **`CAFilter` "gaussianBlur" fallback** — the same private CoreAnimation
///    hook `UIVisualEffectView` uses, attached to the backdrop layer's own
///    `filters` chain when no MTLTexture is supplied.
///
/// The MPS path needs the snapshot to *exclude* the glass-text layers
/// themselves, otherwise applying Gaussian blur to a snapshot that already
/// contains the glyphs produces a "double-text halo": the blurred glyphs
/// underneath the sharp re-rendered text.
///
/// See `docs/superpowers/specs/2026-05-12-story-glass-backdrop-snapshot-design.md`
/// for the rationale behind the 2-pass design (option 3 in the spec).
///
/// ## Usage
///
/// ```swift
/// let capture = StoryBackdropCapture()
/// // Build the canvas-wide backdrop with glass texts removed once per tick :
/// _ = capture.captureCanvasBackdrop(slide: slide,
///                                   geometry: geometry,
///                                   time: time,
///                                   mode: mode,
///                                   languages: languages)
///
/// // Render the live layer tree, letting StoryRenderer dispatch crops per glass item :
/// let root = StoryRenderer.render(
///     slide: slide, into: geometry, at: time, mode: mode, languages: languages,
///     backdropProvider: { rect in capture.cropRegion(rect) }
/// )
///
/// // Drop the cached canvas backdrop at end of tick :
/// capture.invalidate()
/// ```
///
/// ## Concurrency
///
/// MainActor-isolated because the entire CARenderer + CALayer pipeline it
/// drives is MainActor-bound (CALayer subclasses access `UIScreen.main.scale`
/// and `AVPlayer` at configure time, see `StoryAVCompositor`). Crops are blit
/// on the shared Metal command queue (thread-safe), but Crop completion is
/// awaited synchronously to keep the contract simple : "ask, get a usable
/// texture back, set it on the layer".
@MainActor
public final class StoryBackdropCapture: BackdropCapturing {

    /// Cached full-canvas backdrop for the current tick. Multiple glass-text
    /// layers in the same slide share this snapshot — the exclusion already
    /// removed all of them, so a single rasterization is enough regardless of
    /// how many glass items exist.
    private var cachedCanvasBackdrop: MTLTexture?

    /// Render size the cache was built against. Used as a defensive guard so a
    /// stale capture from a previous geometry isn't reused after a layout
    /// change (e.g. iPad rotation, Stage Manager resize).
    private var cachedRenderSize: CGSize?

    public init() {}

    // MARK: - Public API

    /// Rasterizes the slide minus any glass-flagged text item into an
    /// `MTLTexture` sized to `geometry.renderSize`. The result is cached
    /// internally until `invalidate()` is called.
    ///
    /// Returns `nil` (and leaves the cache untouched) when :
    /// - The slide has no glass-style text items — there's nothing to feed,
    ///   so `StoryGlassBackdropLayer.applyCAFilterFallback()` keeps working.
    /// - Metal texture allocation fails (rare; happens on hosts with no
    ///   Metal device, e.g. macOS Linux test runners).
    ///
    /// Subsequent `cropRegion(_:)` calls read from this cache. If you call
    /// `captureCanvasBackdrop` twice in a row without `invalidate()`, the
    /// second call rebuilds — required so per-frame ticks in `.play` mode
    /// always reflect the current slide state.
    @discardableResult
    public func captureCanvasBackdrop(slide: StorySlide,
                                      geometry: CanvasGeometry,
                                      time: CMTime,
                                      mode: RenderMode,
                                      languages: [String]) -> MTLTexture? {
        // Fast exit : no glass texts → no backdrop needed.
        guard hasGlassItem(in: slide) else {
            cachedCanvasBackdrop = nil
            cachedRenderSize = nil
            return nil
        }

        let renderSize = geometry.renderSize
        guard renderSize.width > 0, renderSize.height > 0 else { return nil }

        let context = StoryRenderingContext.shared
        let width = Int(renderSize.width.rounded())
        let height = Int(renderSize.height.rounded())
        guard width > 0, height > 0 else { return nil }

        let descriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm,
            width: width,
            height: height,
            mipmapped: false
        )
        descriptor.usage = [.renderTarget, .shaderRead]
        // `.shared` storage is required so the downstream blit crop and the
        // `StoryGlassBackdropLayer` CIImage readback path can read the bytes
        // back on the CPU. CARenderer writes to the target via Metal — the
        // storage mode does not affect throughput at our sizes.
        descriptor.storageMode = .shared
        guard let target = context.metalDevice.makeTexture(descriptor: descriptor) else {
            cachedCanvasBackdrop = nil
            cachedRenderSize = nil
            return nil
        }

        // Build the slide-without-glass layer tree. We deliberately pass
        // `backdropProvider: nil` here so this inner render call doesn't
        // recurse trying to capture itself. Any glass-text items have already
        // been stripped via `slideWithoutGlass`.
        let strippedSlide = slideWithoutGlass(slide)
        let backdropTree = StoryRenderer.render(slide: strippedSlide,
                                                into: geometry,
                                                at: time,
                                                mode: mode,
                                                languages: languages,
                                                backdropProvider: nil)
        // CARenderer paints whatever it gets at the texture's origin. Pin the
        // tree's frame to the texture extents so cropping is straightforward.
        backdropTree.frame = CGRect(origin: .zero, size: renderSize)

        let renderer = CARenderer(mtlTexture: target, options: nil)
        renderer.layer = backdropTree
        renderer.bounds = backdropTree.frame
        renderer.beginFrame(atTime: 0, timeStamp: nil)
        renderer.addUpdate(renderer.bounds)
        renderer.render()
        renderer.endFrame()

        cachedCanvasBackdrop = target
        cachedRenderSize = renderSize
        return target
    }

    /// Returns a region of the cached canvas backdrop matching `frame` in
    /// render coordinates, copied into a fresh `.shared` MTLTexture sized to
    /// the (clamped) frame.
    ///
    /// Returns `nil` when :
    /// - No canvas backdrop was captured for the current tick.
    /// - The frame's clamped region is empty (e.g. the layer is fully off-
    ///   screen — `StoryGlassBackdropLayer` then falls back to CAFilter).
    /// - Metal command-buffer encoding fails.
    ///
    /// Suitable as the `BackdropProvider` closure on `StoryRenderer.render`.
    public func cropRegion(_ frame: CGRect) -> MTLTexture? {
        guard let source = cachedCanvasBackdrop,
              let renderSize = cachedRenderSize else {
            return nil
        }

        // Clamp the requested region to the canvas extents — out-of-range
        // blits trigger Metal validation crashes (Xcode debug builds) and
        // GPU faults (release).
        let canvasRect = CGRect(origin: .zero, size: renderSize)
        let clamped = frame.intersection(canvasRect)
        guard !clamped.isNull, clamped.width >= 1, clamped.height >= 1 else {
            return nil
        }

        let originX = Int(clamped.origin.x.rounded(.down))
        let originY = Int(clamped.origin.y.rounded(.down))
        let regionW = max(1, min(source.width  - originX, Int(clamped.width.rounded(.up))))
        let regionH = max(1, min(source.height - originY, Int(clamped.height.rounded(.up))))
        guard originX >= 0, originY >= 0,
              originX + regionW <= source.width,
              originY + regionH <= source.height else {
            return nil
        }

        let context = StoryRenderingContext.shared
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: source.pixelFormat,
            width: regionW,
            height: regionH,
            mipmapped: false
        )
        // `.shared` again so `StoryGlassBackdropLayer.applyMPSPath` can wrap
        // this texture in a CIImage and read it back on the CPU.
        descriptor.usage = [.shaderRead, .shaderWrite, .renderTarget]
        descriptor.storageMode = .shared

        guard let cropped = context.metalDevice.makeTexture(descriptor: descriptor),
              let buffer = context.commandQueue.makeCommandBuffer(),
              let blit = buffer.makeBlitCommandEncoder() else {
            return nil
        }
        blit.copy(from: source,
                  sourceSlice: 0,
                  sourceLevel: 0,
                  sourceOrigin: MTLOrigin(x: originX, y: originY, z: 0),
                  sourceSize: MTLSize(width: regionW, height: regionH, depth: 1),
                  to: cropped,
                  destinationSlice: 0,
                  destinationLevel: 0,
                  destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0))
        blit.endEncoding()
        buffer.commit()
        // Block until the GPU finishes the copy — the caller
        // (`StoryGlassBackdropLayer.applyMPSPath`) reads pixels back via
        // `CIContext.createCGImage` immediately, so we need the texture
        // contents materialized on the shared storage before returning.
        buffer.waitUntilCompleted()
        return cropped
    }

    /// Drops the cached canvas backdrop. Call between render ticks so the
    /// next `captureCanvasBackdrop` rebuilds against the latest slide state.
    ///
    /// `StoryCanvasUIView` calls this inside `rebuildLayers()` before each
    /// capture ; `StoryAVCompositor` calls it per frame inside `renderFrame`.
    ///
    /// This drops only the per-tick `MTLTexture` cache — long-lived Metal
    /// resources (device, command queue, pipeline state) live on
    /// `StoryRenderingContext.shared` and are preserved across invalidations.
    public func invalidate() {
        cachedCanvasBackdrop = nil
        cachedRenderSize = nil
    }

    // MARK: - Private

    private func hasGlassItem(in slide: StorySlide) -> Bool {
        slide.effects.textObjects.contains { text in
            if case .glass = text.resolvedBackgroundStyle { return true }
            return false
        }
    }

    /// Returns a copy of `slide` whose `effects.textObjects` contains only the
    /// non-glass text items. Media, stickers, drawing, background — every
    /// other surface — pass through unchanged so the snapshot still contains
    /// everything that legitimately sits behind the glass layers.
    private func slideWithoutGlass(_ slide: StorySlide) -> StorySlide {
        var copy = slide
        copy.effects.textObjects = slide.effects.textObjects.filter { text in
            if case .glass = text.resolvedBackgroundStyle { return false }
            return true
        }
        return copy
    }
}
