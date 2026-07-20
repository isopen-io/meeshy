import Foundation
import QuartzCore
import UIKit
import Metal
import CoreImage
import MeeshySDK

/// Backing CALayer that paints the "glass" background under a `StoryTextLayer`.
///
/// Two render paths coexist:
///
/// 1. **GPU / MPS path (preferred)** — when the owner (`StoryCanvasUIView` or
///    the AVFoundation compositor) supplies an `MTLTexture` snapshot of the
///    canvas region behind this backdrop via `setBackdropTexture(_:)`, the
///    layer routes through `StoryBlurFilter.apply(sigma:to:output:)`
///    (`MPSImageGaussianBlur`, GPU) and presents the blurred result as its
///    `contents`. This is the path that ships baked into AVFoundation exports.
///
/// 2. **`CAFilter` fallback** — when no backdrop texture is available (e.g.
///    the live composer hasn't wired the backdrop provider yet), the layer
///    installs a `CAFilter` named `"gaussianBlur"` on its own `filters` chain
///    with the requested sigma. This is the same private CALayer mechanism
///    `UIVisualEffectView` itself uses under the hood; it's been stable since
///    iOS 8 and is what every UIKit material effect resolves to. The fallback
///    keeps the visual contract intact while the explicit backdrop provider
///    rolls out across surfaces.
///
/// TODO(canvas-fidelity-phase-5) : Wire `StoryCanvasUIView` to snapshot its
/// content layer into an `MTLTexture` once per render tick and feed every
/// active glass backdrop via `setBackdropTexture(_:)`. The same hook will be
/// reused by `StoryAVCompositor` per frame. Until that lands, the `CAFilter`
/// fallback ships the user-facing effect.
public final class StoryGlassBackdropLayer: CALayer {

    private var sigma: Float = 24
    private var backdropTexture: MTLTexture?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryGlassBackdropLayer does not support NSCoder")
    }

    @MainActor
    public func configure(sigma: Float) {
        self.sigma = max(0, sigma)
        // Subtle frosted tint so the blur reads as a glass surface even on a
        // uniform/black backdrop. Matches the `.ultraThinMaterial` tone the
        // call menu uses.
        backgroundColor = UIColor.white.withAlphaComponent(0.18).cgColor
        if backdropTexture == nil {
            applyCAFilterFallback()
        } else {
            applyMPSPath()
        }
    }

    @MainActor
    public func setBackdropTexture(_ texture: MTLTexture?) {
        self.backdropTexture = texture
        if texture != nil {
            // Strip the CAFilter fallback once we have a real backdrop.
            setValue(nil, forKeyPath: "filters")
            applyMPSPath()
        } else {
            contents = nil
            applyCAFilterFallback()
        }
    }

    // MARK: - Private

    @MainActor
    private func applyCAFilterFallback() {
        // CAFilter is a private but stable CoreAnimation class. Setting it
        // via KVC on a CALayer is the documented runtime path (see
        // `CALayer.filters` declaration in QuartzCore headers — `[Any]?`
        // with no public element type). UIVisualEffectView uses the exact
        // same mechanism. The OS validates filter names; unknown names are
        // silently ignored, never throw.
        guard let filterClass = NSClassFromString("CAFilter") as AnyObject? as? NSObjectProtocol else {
            return
        }
        let selector = NSSelectorFromString("filterWithName:")
        let unmanaged = filterClass.perform(selector, with: "gaussianBlur")
        // `+filterWithName:` is a class factory method — its name is not
        // alloc/new/copy/mutableCopy — so it returns a +0, autoreleased object
        // the caller does NOT own. `perform(_:with:)` hands that pointer back
        // verbatim without applying any ARR convention, so it must be consumed
        // with `takeUnretainedValue()`: ARC retains the object as it is bound
        // here, and the filters array retains it again when `setValue` stores
        // it — both balanced. `takeRetainedValue()` would consume a +1 that was
        // never transferred, over-releasing the filter by one: it is freed
        // early and the deferred autorelease-pool `release` then double-frees
        // it → EXC_BAD_ACCESS in `objc_release` during `objc_autoreleasePoolPop`.
        guard let filter = unmanaged?.takeUnretainedValue() else { return }
        // inputRadius mirrors MPSImageGaussianBlur sigma (CAFilter uses radius
        // units that are visually equivalent within ±1 px at our scales).
        (filter as AnyObject).setValue(sigma, forKey: "inputRadius")
        (filter as AnyObject).setValue(true, forKey: "inputNormalizeEdges")
        setValue([filter], forKeyPath: "filters")
    }

    @MainActor
    private func applyMPSPath() {
        guard let source = backdropTexture else { return }
        // Allocate a destination texture matching the source dimensions on the
        // shared device. `.shared` storage is REQUIRED for the subsequent
        // `CIImage(mtlTexture:)` → `createCGImage(_:from:)` CPU readback path
        // — `.private` textures are GPU-only and `CIImage(mtlTexture:)` returns
        // nil on A-series iPhones (entire device fleet), silently dropping the
        // glass surface. MPS blur writes to `.shared` just as efficiently.
        let context = StoryRenderingContext.shared
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: source.pixelFormat,
            width: source.width,
            height: source.height,
            mipmapped: false
        )
        descriptor.usage = [.shaderRead, .shaderWrite, .renderTarget]
        descriptor.storageMode = .shared
        guard let output = context.metalDevice.makeTexture(descriptor: descriptor) else { return }

        // Synchronous apply — caller (StoryCanvasUIView render tick) already
        // dispatches once per frame, so blocking here just serializes work on
        // the GPU's shared queue.
        StoryBlurFilter.apply(sigma: sigma, to: source, output: output)

        // Bridge MTLTexture → CGImage via the shared CIContext (Display P3
        // working color space) so the glass surface stays color-accurate.
        //
        // Metal texture origin is bottom-left ; CALayer.contents expects
        // top-left coordinates. Flip vertically via CIImage transform before
        // rasterizing — otherwise the glass appears upside-down behind the
        // text (silent latent bug if we forgot the Y-flip).
        guard let raw = CIImage(mtlTexture: output, options: [.colorSpace: context.workingColorSpace])
        else { return }
        let h = CGFloat(source.height)
        let flipped = raw
            .transformed(by: CGAffineTransform(scaleX: 1, y: -1).translatedBy(x: 0, y: -h))
        let rect = CGRect(x: 0, y: 0, width: source.width, height: source.height)
        if let cg = context.ciContext.createCGImage(flipped, from: rect) {
            contents = cg
        }
    }
}
