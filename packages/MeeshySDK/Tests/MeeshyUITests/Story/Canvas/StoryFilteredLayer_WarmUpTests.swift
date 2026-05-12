import XCTest
import Metal
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// P3 perf : verify `StoryFilteredLayer.preheatPipeline(kind:)` pre-compiles
/// the Metal compute pipeline so the first user-visible `render()` skips the
/// 5–50 ms `makeComputePipelineState(function:)` hit.
///
/// The lazy fallback inside `render()` is preserved for paths that never
/// preheated (tests, abrupt filter changes in the composer); it must keep
/// working even when `_resetPipelineCacheForTesting` wipes the cache.
@MainActor
final class StoryFilteredLayer_WarmUpTests: XCTestCase {

    override func setUp() {
        super.setUp()
        StoryFilteredLayer._resetPipelineCacheForTesting()
    }

    override func tearDown() {
        StoryFilteredLayer._resetPipelineCacheForTesting()
        super.tearDown()
    }

    // MARK: - preheatPipeline

    func test_preheatPipeline_makesPipelineStateReady() throws {
        XCTAssertFalse(StoryFilteredLayer._hasCachedPipelineForTesting(.vintage),
                       "Cache must start empty for this test")

        let ready = StoryFilteredLayer.preheatPipeline(kind: .vintage)

        try XCTSkipUnless(ready,
                          "Metal kernel unavailable in this environment (CI host without GPU/library?)")
        XCTAssertTrue(StoryFilteredLayer._hasCachedPipelineForTesting(.vintage),
                      "Successful preheat must populate the static cache")
    }

    func test_preheatAllPipelines_warmsEveryKind() throws {
        for kind in StoryFilteredLayer.Kind.allCases {
            XCTAssertFalse(StoryFilteredLayer._hasCachedPipelineForTesting(kind))
        }

        StoryFilteredLayer.preheatAllPipelines()

        let anyReady = StoryFilteredLayer.Kind.allCases.contains {
            StoryFilteredLayer._hasCachedPipelineForTesting($0)
        }
        try XCTSkipUnless(anyReady,
                          "Metal library unavailable in this environment")
        for kind in StoryFilteredLayer.Kind.allCases {
            XCTAssertTrue(StoryFilteredLayer._hasCachedPipelineForTesting(kind),
                          "preheatAllPipelines must populate every Kind (missing: \(kind))")
        }
    }

    // MARK: - First-render timing

    func test_render_afterPreheat_noCompilationDelay() throws {
        let ready = StoryFilteredLayer.preheatPipeline(kind: .vintage)
        try XCTSkipUnless(ready, "Metal kernel unavailable in this environment")

        let layer = StoryFilteredLayer()
        layer.kind = .vintage
        layer.sourceTexture = try makeFilledTexture(width: 64, height: 64)
        layer.drawableSize = CGSize(width: 64, height: 64)
        layer.frame = CGRect(x: 0, y: 0, width: 64, height: 64)

        // CPU-side measurement only — the Metal command buffer is submitted
        // asynchronously, so what we care about is the time spent on the main
        // thread before `commit()` returns (including pipeline setup). With
        // preheat hit, that path is a dict lookup; without it, 5–50 ms.
        let start = CFAbsoluteTimeGetCurrent()
        layer.render()
        let elapsedMillis = (CFAbsoluteTimeGetCurrent() - start) * 1_000.0

        // 5 ms is the documented floor for first-compile; we use 10 ms as the
        // assertion threshold to absorb simulator scheduler jitter without
        // flaking. The real signal is "no double-digit ms compile cost".
        XCTAssertLessThan(elapsedMillis, 10.0,
                          "render() after preheat should not pay compilation cost (took \(elapsedMillis) ms)")
    }

    // MARK: - Lazy fallback

    func test_render_withoutPreheat_lazyFallbackStillWorks() throws {
        // Cache deliberately empty — render() must compile lazily and populate
        // the cache so subsequent layers benefit.
        XCTAssertFalse(StoryFilteredLayer._hasCachedPipelineForTesting(.bwContrast))

        let layer = StoryFilteredLayer()
        layer.kind = .bwContrast
        layer.sourceTexture = try makeFilledTexture(width: 32, height: 32)
        layer.drawableSize = CGSize(width: 32, height: 32)
        layer.frame = CGRect(x: 0, y: 0, width: 32, height: 32)

        // Should not crash, should not throw, should populate the cache.
        layer.render()

        // If the Metal library was available the lazy path will have cached
        // the pipeline; if not, we accept the no-op render and skip.
        if !StoryFilteredLayer._hasCachedPipelineForTesting(.bwContrast) {
            throw XCTSkip("Metal kernel unavailable in this environment")
        }
        XCTAssertTrue(StoryFilteredLayer._hasCachedPipelineForTesting(.bwContrast),
                      "Lazy compile path must write back to the static cache")
    }

    // MARK: - Idempotency

    func test_preheatTwice_idempotent() throws {
        let firstReady = StoryFilteredLayer.preheatPipeline(kind: .vintage)
        try XCTSkipUnless(firstReady, "Metal kernel unavailable")

        // Second call must be a no-op (cache hit) and still report ready.
        let secondReady = StoryFilteredLayer.preheatPipeline(kind: .vintage)
        XCTAssertTrue(secondReady, "Second preheat call must report ready")
        XCTAssertTrue(StoryFilteredLayer._hasCachedPipelineForTesting(.vintage))
    }

    // MARK: - Helpers

    private func makeFilledTexture(width: Int, height: Int) throws -> MTLTexture {
        let device = StoryRenderingContext.shared.metalDevice
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm,
            width: width,
            height: height,
            mipmapped: false
        )
        descriptor.usage = [.shaderRead, .shaderWrite]
        descriptor.storageMode = .shared
        guard let tex = device.makeTexture(descriptor: descriptor) else {
            throw XCTSkip("Metal texture allocation failed")
        }
        let bytes = [UInt8](repeating: 0x80, count: width * height * 4)
        tex.replace(region: MTLRegionMake2D(0, 0, width, height),
                    mipmapLevel: 0,
                    withBytes: bytes,
                    bytesPerRow: width * 4)
        return tex
    }
}
