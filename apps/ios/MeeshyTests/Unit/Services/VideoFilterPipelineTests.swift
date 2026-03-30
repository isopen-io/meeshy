import XCTest
@testable import Meeshy

// MARK: - VideoFilterConfig Tests

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
}

// MARK: - VideoFilterPipeline Tests

final class VideoFilterPipelineTests: XCTestCase {

    private func makeSUT() -> VideoFilterPipeline {
        VideoFilterPipeline()
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
}

// MARK: - DarkFrameDetector Tests

final class DarkFrameDetectorTests: XCTestCase {

    func test_lastAverageBrightness_initiallyNil() {
        let detector = DarkFrameDetector()
        XCTAssertNil(detector.lastAverageBrightness)
    }

    func test_reset_clearsState() {
        let detector = DarkFrameDetector()
        detector.reset()
        XCTAssertNil(detector.lastAverageBrightness)
    }
}
