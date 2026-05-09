import QuartzCore
import Metal

/// `CAMetalLayer` subclass that runs a custom Metal compute kernel on its
/// `sourceTexture` and presents the result. Used for real-time filter previews
/// in the Story composer (slider bound to `intensity`).
///
/// Two kernels are bundled at compile time (see `StoryFilters.metal`) :
/// - `vintageFilter` — sepia tone + radial vignette
/// - `bwContrastFilter` — luminance to grayscale + S-curve contrast
///
/// `CALayer.init` is `nonisolated`. Under MeeshyUI's `defaultIsolation(MainActor)`
/// the inits MUST be `nonisolated` too, but `Bundle.module` (SPM-generated) is
/// MainActor-isolated. The compromise: the bare CAMetalLayer setup happens in
/// `init` (nonisolated, no Bundle.module access), and pipeline state is
/// initialised lazily on the first MainActor `render()` call.
public final class StoryFilteredLayer: CAMetalLayer {

    /// Kernel selector. The raw value matches the Metal function name.
    public enum Kind: String, Sendable, CaseIterable {
        case vintage    = "vintageFilter"
        case bwContrast = "bwContrastFilter"
    }

    public var kind: Kind = .vintage {
        didSet {
            guard oldValue != kind else { return }
            pipelineState = nil  // force lazy rebuild on next render()
        }
    }

    public var intensity: Float = 0.5

    public var sourceTexture: MTLTexture?

    private var pipelineState: MTLComputePipelineState?

    public override nonisolated init() {
        super.init()
        // Bare CAMetalLayer config — no Bundle access here. StoryRenderingContext
        // is `nonisolated` so this is safe.
        let context = StoryRenderingContext.shared
        self.device          = context.metalDevice
        self.pixelFormat     = .bgra8Unorm
        self.framebufferOnly = false
    }

    public override nonisolated init(layer: Any) {
        super.init(layer: layer)
    }

    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryFilteredLayer is not initialisable from a coder")
    }

    private func setupPipeline() {
        let context = StoryRenderingContext.shared
        // Bundle.module is the MeeshyUI resource bundle — see `Package.swift`
        // `.process("Story/Canvas/Metal")`. `device.makeDefaultLibrary()` (no
        // bundle) reads `Bundle.main` and would miss the SDK's metal library.
        guard let library = try? context.metalDevice.makeDefaultLibrary(bundle: Bundle.module),
              let function = library.makeFunction(name: kind.rawValue) else {
            pipelineState = nil
            return
        }
        pipelineState = try? context.metalDevice.makeComputePipelineState(function: function)
    }

    /// Encodes one frame: kernel(sourceTexture) -> drawable. Lazily builds the
    /// pipeline on first call. No-ops if the pipeline isn't ready or no
    /// drawable is currently available (e.g. layer detached from the window).
    public func render() {
        if pipelineState == nil { setupPipeline() }
        guard let pipeline = pipelineState,
              let source = sourceTexture,
              let drawable = nextDrawable() else { return }

        let context = StoryRenderingContext.shared
        guard let buffer = context.commandQueue.makeCommandBuffer(),
              let encoder = buffer.makeComputeCommandEncoder() else { return }

        encoder.setComputePipelineState(pipeline)
        encoder.setTexture(source, index: 0)
        encoder.setTexture(drawable.texture, index: 1)

        var localIntensity = intensity
        encoder.setBytes(&localIntensity,
                         length: MemoryLayout<Float>.size,
                         index: 0)

        let groupWidth  = pipeline.threadExecutionWidth
        let groupHeight = pipeline.maxTotalThreadsPerThreadgroup / groupWidth
        let threadsPerGrid       = MTLSize(width: source.width, height: source.height, depth: 1)
        let threadsPerThreadgroup = MTLSize(width: groupWidth, height: groupHeight, depth: 1)
        encoder.dispatchThreads(threadsPerGrid, threadsPerThreadgroup: threadsPerThreadgroup)
        encoder.endEncoding()

        buffer.present(drawable)
        buffer.commit()
    }
}
