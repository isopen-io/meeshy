import QuartzCore
import Metal
import Foundation
import MeeshySDK

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
///
/// ### Pipeline pre-heating (P3 dropframe fix)
/// Compiling a `MTLComputePipelineState` from a Metal function costs roughly
/// 5–50 ms the first time. Doing it inside the first `render()` call dropped
/// the first frame whenever the reader opened a slide with a filter. To avoid
/// this we cache the compiled pipeline in a process-wide static map, keyed by
/// `Kind`, and offer `preheatPipeline(kind:)` / `preheatAllPipelines` hooks
/// that callers (app bootstrap, slide prefetcher) invoke off the critical
/// path. The lazy fallback inside `render()` is preserved for paths that
/// never preheated (tests, surprise filter changes).
public final class StoryFilteredLayer: CAMetalLayer {

    /// Kernel selector. The raw value matches the Metal function name.
    public enum Kind: String, Sendable, CaseIterable {
        case vintage    = "vintageFilter"
        case bwContrast = "bwContrastFilter"
    }

    public var kind: Kind = .vintage {
        didSet {
            guard oldValue != kind else { return }
            pipelineState = nil  // force rebuild on next render(); hits the static cache if preheated
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
        // Hit the process-wide cache first — populated by `preheatPipeline`.
        if let cached = Self.cachedPipeline(for: kind) {
            pipelineState = cached
            return
        }
        // Lazy fallback: compile inline and write back to the cache so the
        // next layer using the same `Kind` gets a hot path. This keeps
        // behaviour identical for callers that never invoked the preheat hook
        // (tests, runtime filter changes the user picks mid-session).
        guard let compiled = Self.compilePipeline(kind: kind) else {
            pipelineState = nil
            return
        }
        Self.storePipeline(compiled, for: kind)
        pipelineState = compiled
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

    // MARK: - Pipeline preheat (process-wide cache)

    /// Process-wide cache of compiled pipelines keyed by kernel `Kind`.
    /// `MTLComputePipelineState` is documented thread-safe; caching it across
    /// layers is the recommended Apple pattern. The dict is guarded by
    /// `cacheLock` and accessed only via the helpers below — never read or
    /// mutated directly from elsewhere.
    nonisolated(unsafe) private static var pipelineCache: [Kind: MTLComputePipelineState] = [:]
    private static let cacheLock = NSLock()

    /// Pre-compile a single kernel's pipeline so the first `render()` call
    /// that uses it skips the 5–50 ms compilation hit. Idempotent — calling
    /// with a kind that's already cached is a no-op and returns `true`.
    ///
    /// Returns `true` if the pipeline is ready in the cache after the call,
    /// `false` if compilation failed (missing kernel, Bundle.module mis-config).
    /// Must be called on the MainActor because `Bundle.module` is
    /// MainActor-isolated under defaultIsolation(MainActor).
    @MainActor
    @discardableResult
    public static func preheatPipeline(kind: Kind) -> Bool {
        if cachedPipeline(for: kind) != nil { return true }
        guard let compiled = compilePipeline(kind: kind) else { return false }
        storePipeline(compiled, for: kind)
        return true
    }

    /// Convenience: preheat every kernel exposed by `Kind`. Intended to be
    /// invoked once at app launch (e.g. from `MeeshyApp.init` via a small
    /// bootstrap task) so the composer and reader never pay the compile cost
    /// on a user-visible frame.
    @MainActor
    public static func preheatAllPipelines() {
        for kind in Kind.allCases {
            _ = preheatPipeline(kind: kind)
        }
    }

    /// Test seam: clear the cache so `test_render_withoutPreheat_…` exercises
    /// the lazy path even after a previous test populated it.
    static func _resetPipelineCacheForTesting() {
        cacheLock.lock()
        pipelineCache.removeAll()
        cacheLock.unlock()
    }

    /// Test seam: inspect whether a kind is currently cached.
    static func _hasCachedPipelineForTesting(_ kind: Kind) -> Bool {
        cachedPipeline(for: kind) != nil
    }

    // MARK: - Private cache helpers

    private static func cachedPipeline(for kind: Kind) -> MTLComputePipelineState? {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        return pipelineCache[kind]
    }

    private static func storePipeline(_ pipeline: MTLComputePipelineState, for kind: Kind) {
        cacheLock.lock()
        pipelineCache[kind] = pipeline
        cacheLock.unlock()
    }

    /// Compiles a kernel into a pipeline. MainActor-isolated because
    /// `Bundle.module` is MainActor-isolated under defaultIsolation(MainActor).
    @MainActor
    private static func compilePipeline(kind: Kind) -> MTLComputePipelineState? {
        let context = StoryRenderingContext.shared
        // Bundle.module is the MeeshyUI resource bundle — see `Package.swift`
        // `.process("Story/Canvas/Metal")`. `device.makeDefaultLibrary()` (no
        // bundle) reads `Bundle.main` and would miss the SDK's metal library.
        guard let library = try? context.metalDevice.makeDefaultLibrary(bundle: Bundle.module),
              let function = library.makeFunction(name: kind.rawValue) else {
            return nil
        }
        return try? context.metalDevice.makeComputePipelineState(function: function)
    }
}

// MARK: - StoryFilter → Kind bridge

extension StoryFilteredLayer.Kind {
    /// Bridges the persisted `StoryFilter` vocabulary (what `StoryEffects.filter`
    /// actually stores — "vintage", "bw", … — written by the filter grid via
    /// `applyFilter(filter.rawValue)`) to the Metal kernel `Kind`.
    ///
    /// The canvas previously did `Kind(rawValue: effects.filter)` *directly*, but a
    /// `Kind`'s raw value is its Metal **function name** ("vintageFilter" /
    /// "bwContrastFilter"), used to look up the kernel in the metal library — never
    /// the value the grid persists. So the lookup was always `nil` and the filter
    /// layer was always removed: no filter EVER rendered on the composer canvas or
    /// the reader (fix 2026-06-01).
    ///
    /// Only `vintage` and `bw` ship a bundled kernel (see `StoryFilters.metal`);
    /// every other `StoryFilter` returns `nil` (no Metal pass). Those six are
    /// approximated in the grid (CoreImage via `StoryFilter.ciFilterName`) and the
    /// mini-preview (SwiftUI) but have no GPU kernel yet — tracked in the story
    /// filter backlog (canvas/viewer/thumbHash do not yet reflect them).
    public init?(storyFilter raw: String?) {
        guard let raw, let filter = StoryFilter(rawValue: raw) else { return nil }
        switch filter {
        case .vintage: self = .vintage
        case .bw:      self = .bwContrast
        case .warm, .cool, .dramatic, .vivid, .fade, .chrome:
            return nil
        }
    }
}
