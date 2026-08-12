import XCTest
import CoreVideo
@testable import Meeshy

// MARK: - VideoFilterConfig Tests

@MainActor
final class VideoFilterConfigTests: XCTestCase {

    func test_default_hasExpectedValues() {
        let config = VideoFilterConfig.default
        XCTAssertEqual(config.temperature, 6500)
        XCTAssertEqual(config.tint, 0)
        XCTAssertEqual(config.brightness, 0)
        XCTAssertEqual(config.contrast, 1.0)
        XCTAssertEqual(config.saturation, 1.0)
        XCTAssertEqual(config.exposure, 0)
        XCTAssertFalse(config.isEnabled)
        XCTAssertFalse(config.backgroundBlurEnabled)
        XCTAssertEqual(config.backgroundBlurRadius, 10.0)
        XCTAssertFalse(config.skinSmoothingEnabled)
        XCTAssertEqual(config.skinSmoothingIntensity, 0.4)
    }

    func test_equatable_sameValues_areEqual() {
        let a = VideoFilterConfig.default
        let b = VideoFilterConfig.default
        XCTAssertEqual(a, b)
    }

    func test_equatable_differentValues_areNotEqual() {
        var a = VideoFilterConfig.default
        var b = VideoFilterConfig.default
        a.backgroundBlurEnabled = true
        XCTAssertNotEqual(a, b)
        b.backgroundBlurEnabled = true
        XCTAssertEqual(a, b)
    }

    func test_hasAdvancedFilters_whenBlurEnabled_returnsTrue() {
        var config = VideoFilterConfig.default
        config.backgroundBlurEnabled = true
        XCTAssertTrue(config.hasAdvancedFilters)
    }

    func test_hasAdvancedFilters_whenSmoothingEnabled_returnsTrue() {
        var config = VideoFilterConfig.default
        config.skinSmoothingEnabled = true
        XCTAssertTrue(config.hasAdvancedFilters)
    }

    func test_hasAdvancedFilters_whenOnlyColorimetry_returnsFalse() {
        var config = VideoFilterConfig.default
        config.isEnabled = true
        config.brightness = 0.5
        XCTAssertFalse(config.hasAdvancedFilters)
    }
}

// MARK: - VideoFilterPreset Tests

@MainActor
final class VideoFilterPresetTests: XCTestCase {

    func test_natural_hasDefaultColorimetry() {
        let config = VideoFilterPreset.natural.config
        XCTAssertEqual(config.temperature, 6500)
        XCTAssertEqual(config.tint, 0)
        XCTAssertEqual(config.brightness, 0)
        XCTAssertEqual(config.contrast, 1.0)
        XCTAssertEqual(config.saturation, 1.0)
        XCTAssertEqual(config.exposure, 0)
        XCTAssertTrue(config.isEnabled)
    }

    func test_warm_hasHigherTemperature() {
        let config = VideoFilterPreset.warm.config
        XCTAssertEqual(config.temperature, 7500)
        XCTAssertEqual(config.tint, 5)
        XCTAssertEqual(config.brightness, 0.02, accuracy: 0.001)
        XCTAssertEqual(config.contrast, 1.05, accuracy: 0.001)
        XCTAssertEqual(config.saturation, 1.1, accuracy: 0.001)
        XCTAssertTrue(config.isEnabled)
    }

    func test_cool_hasLowerTemperature() {
        let config = VideoFilterPreset.cool.config
        XCTAssertEqual(config.temperature, 5500)
        XCTAssertEqual(config.tint, -5)
        XCTAssertTrue(config.isEnabled)
    }

    func test_vivid_hasHighSaturation() {
        let config = VideoFilterPreset.vivid.config
        XCTAssertEqual(config.saturation, 1.3, accuracy: 0.001)
        XCTAssertEqual(config.contrast, 1.15, accuracy: 0.001)
        XCTAssertTrue(config.isEnabled)
    }

    func test_muted_hasLowSaturation() {
        let config = VideoFilterPreset.muted.config
        XCTAssertEqual(config.saturation, 0.7, accuracy: 0.001)
        XCTAssertEqual(config.contrast, 0.9, accuracy: 0.001)
        XCTAssertTrue(config.isEnabled)
    }

    func test_allCases_returnsAllPresets() {
        XCTAssertEqual(VideoFilterPreset.allCases.count, 5)
    }

    func test_presetPreservesAdvancedFilters() {
        var config = VideoFilterPreset.warm.config
        config.backgroundBlurEnabled = true
        config.skinSmoothingEnabled = true
        XCTAssertTrue(config.backgroundBlurEnabled)
        XCTAssertTrue(config.skinSmoothingEnabled)
    }

    // MARK: - matching(_:) — reverse lookup used to restore `activePreset`
    //
    // Regression guard for Vague 108: `VideoFiltersPanel.activePreset` used
    // to be a `@State` seeded to `.natural` and never re-derived from the
    // persisted `filterConfig` on panel reopen — a config restored to
    // `.warm` (or any non-natural preset) still highlighted the "Natural"
    // chip. `matching(_:)` is the pure lookup the panel now derives
    // `activePreset` from on every render, eliminating the staleness class
    // entirely rather than patching the one `.onAppear` call site.

    func test_matching_eachPresetsOwnConfig_returnsItself() {
        for preset in VideoFilterPreset.allCases {
            XCTAssertEqual(VideoFilterPreset.matching(preset.config), preset)
        }
    }

    func test_matching_ignoresIsEnabled() {
        // The "Reset" affordance sets `.natural`'s colorimetry but flips
        // `isEnabled` back to `false` — must still resolve to `.natural`.
        var config = VideoFilterPreset.natural.config
        config.isEnabled = false
        XCTAssertEqual(VideoFilterPreset.matching(config), .natural)
    }

    func test_matching_ignoresAdvancedFilterFields() {
        // presetChip carries the caller's own backgroundBlur/skinSmoothing
        // state across a preset switch — those fields must never affect
        // which preset is recognized as active.
        var config = VideoFilterPreset.warm.config
        config.backgroundBlurEnabled = true
        config.backgroundBlurRadius = 18
        config.skinSmoothingEnabled = true
        config.skinSmoothingIntensity = 0.9
        XCTAssertEqual(VideoFilterPreset.matching(config), .warm)
    }

    func test_matching_handTunedColorimetry_returnsNil() {
        // A user dragging a slider in VideoFilterControlView produces
        // colorimetry that (generically) matches no preset — a legitimate
        // "no preset selected" state, not a bug.
        var config = VideoFilterPreset.warm.config
        config.brightness = 0.4123
        XCTAssertNil(VideoFilterPreset.matching(config))
    }

    func test_matching_untouchedDefaultConfig_returnsNatural() {
        // VideoFilterConfig.default shares its colorimetry with `.natural`
        // (isEnabled aside, which matching() ignores) — a freshly-opened
        // panel that never touched a preset still highlights "Natural",
        // matching the pre-Vague-108 default chip selection.
        XCTAssertEqual(VideoFilterPreset.matching(.default), .natural)
    }
}

// MARK: - VideoFilterPipeline Tests

@MainActor
final class VideoFilterPipelineTests: XCTestCase {

    private func makeSUT() -> VideoFilterPipeline {
        VideoFilterPipeline()
    }

    private func makePixelBuffer(width: Int = 64, height: Int = 64) -> CVPixelBuffer {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer)
        precondition(status == kCVReturnSuccess, "CVPixelBufferCreate failed")
        return pixelBuffer!
    }

    func test_init_hasDefaultConfig() {
        let sut = makeSUT()
        XCTAssertEqual(sut.config, VideoFilterConfig.default)
    }

    func test_reset_restoresDefaultConfig() {
        let sut = makeSUT()
        sut.config.brightness = 0.5
        sut.config.backgroundBlurEnabled = true
        sut.config.skinSmoothingEnabled = true
        sut.reset()
        XCTAssertEqual(sut.config, VideoFilterConfig.default)
    }

    func test_lastFrameProcessingTime_initiallyNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.lastFrameProcessingTime)
    }

    func test_isAutoDegraded_initiallyFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isAutoDegraded)
    }

    // MARK: - process() gate — advanced filters without a colorimetry preset

    // Regression guard — `process()` used to gate the ENTIRE pipeline
    // (colorimetry AND background blur AND skin smoothing) behind
    // `cfg.isEnabled` alone. `isEnabled` is only ever set true by picking a
    // colorimetry preset (VideoFilterPreset.config); the two advanced
    // toggles below never touch it. A user who enabled background blur or
    // skin smoothing WITHOUT ever picking a preset got a silent no-op: every
    // frame returned completely unmodified, with no error/log/UI indication.
    // `lastFrameProcessingTime` (only ever set on the non-early-return path,
    // per test_lastFrameProcessingTime_initiallyNil above) is the pipeline's
    // own observable signal that a frame was actually processed.

    func test_process_withOnlyBackgroundBlurEnabled_stillProcessesFrame() {
        let sut = makeSUT()
        sut.config.isEnabled = false
        sut.config.backgroundBlurEnabled = true

        _ = sut.process(makePixelBuffer())

        XCTAssertNotNil(sut.lastFrameProcessingTime, "background blur alone must run the pipeline, not no-op it")
    }

    func test_process_withOnlySkinSmoothingEnabled_stillProcessesFrame() {
        let sut = makeSUT()
        sut.config.isEnabled = false
        sut.config.skinSmoothingEnabled = true

        _ = sut.process(makePixelBuffer())

        XCTAssertNotNil(sut.lastFrameProcessingTime, "skin smoothing alone must run the pipeline, not no-op it")
    }

    func test_process_withNeitherEnabledNorAdvancedFilters_doesNotProcessFrame() {
        // Non-regression: the base "no filters at all" case must still
        // early-return without running the (costly) CI pipeline.
        let sut = makeSUT()

        _ = sut.process(makePixelBuffer())

        XCTAssertNil(sut.lastFrameProcessingTime, "with no filters active at all, process() must still early-return")
    }

    // Regression test for a data race: `config` used to be a plain
    // unsynchronized `var`, written from the MainActor (slider drags) and read
    // from WebRTC's capture queue inside `process(_:averageBrightness:)` at
    // ~30Hz. A write racing a read could tear the struct, observing a mix of
    // fields that was never actually assigned together (e.g. a new
    // `backgroundBlurEnabled` paired with a stale `backgroundBlurRadius`).
    // With the lock in place every read must equal one of the two fully-formed
    // configs below — never a hybrid.
    func test_config_concurrentReadWrite_neverObservesTornConfig() {
        let sut = makeSUT()

        let blurred: VideoFilterConfig = {
            var c = VideoFilterConfig.default
            c.isEnabled = true
            c.backgroundBlurEnabled = true
            c.backgroundBlurRadius = 5.0
            return c
        }()
        let smoothed: VideoFilterConfig = {
            var c = VideoFilterConfig.default
            c.isEnabled = true
            c.backgroundBlurEnabled = false
            c.skinSmoothingEnabled = true
            c.skinSmoothingIntensity = 0.9
            return c
        }()

        // `concurrentPerform` runs `iterations` calls across GCD's thread pool
        // and blocks until every call returns — no manual expectation/queue
        // plumbing needed. Even-indexed calls write one of the two full
        // configs; odd-indexed calls read `config` and assert it is always a
        // complete, previously-assigned generation, never a hybrid of the two.
        DispatchQueue.concurrentPerform(iterations: 4_000) { index in
            if index.isMultiple(of: 2) {
                sut.config = index.isMultiple(of: 4) ? blurred : smoothed
            } else {
                let observed = sut.config
                XCTAssertTrue(
                    observed == blurred || observed == smoothed || observed == VideoFilterConfig.default,
                    "Observed a torn config that matches neither assigned generation: \(observed)"
                )
            }
        }
    }
}
