import CoreImage
import CoreVideo
import XCTest
@testable import Meeshy

@MainActor
final class CallFaceEffectTests: XCTestCase {

    // MARK: - Catalogue

    func test_allCases_followTheSharedDesignOrder() {
        XCTAssertEqual(CallFaceEffect.allCases.map(\.rawValue), ["none", "smoothing", "toad", "angel", "demon", "volcano"])
    }

    func test_isStylized_onlyThePlayfulPresets() {
        XCTAssertEqual(CallFaceEffect.allCases.filter(\.isStylized), [.toad, .angel, .demon, .volcano])
    }

    func test_needsFace_volcanoWorksWithoutAFace() {
        XCTAssertFalse(CallFaceEffect.volcano.needsFace)
        XCTAssertFalse(CallFaceEffect.none.needsFace)
        XCTAssertTrue([CallFaceEffect.smoothing, .toad, .angel, .demon].allSatisfy(\.needsFace))
    }

    func test_analyticsName_none_isNil() {
        XCTAssertNil(CallFaceEffect.none.analyticsName)
    }

    func test_analyticsName_preset_isPrefixed() {
        XCTAssertEqual(CallFaceEffect.demon.analyticsName, "face:demon")
    }

    // MARK: - Config

    func test_default_hasNoFaceEffect() {
        XCTAssertEqual(VideoFilterConfig.default.faceEffect, .none)
        XCTAssertEqual(VideoFilterConfig.default.activeFaceEffect, .none)
    }

    func test_activeFaceEffect_legacySmoothingFlag_readsAsSmoothing() {
        var config = VideoFilterConfig.default
        config.skinSmoothingEnabled = true
        XCTAssertEqual(config.activeFaceEffect, .smoothing)
    }

    func test_activeFaceEffect_stylizedPreset_winsOverSmoothingFlag() {
        var config = VideoFilterConfig.default
        config.skinSmoothingEnabled = true
        config.faceEffect = .angel
        XCTAssertEqual(config.activeFaceEffect, .angel)
    }

    func test_selectingFaceEffect_smoothing_setsTheLegacyFlag() {
        let config = VideoFilterConfig.default.selectingFaceEffect(.smoothing)
        XCTAssertTrue(config.skinSmoothingEnabled)
        XCTAssertEqual(config.activeFaceEffect, .smoothing)
    }

    func test_selectingFaceEffect_preset_clearsTheLegacyFlag() {
        let config = VideoFilterConfig.default.selectingFaceEffect(.smoothing).selectingFaceEffect(.toad)
        XCTAssertFalse(config.skinSmoothingEnabled)
        XCTAssertEqual(config.activeFaceEffect, .toad)
    }

    func test_selectingFaceEffect_none_turnsEverythingOff() {
        let config = VideoFilterConfig.default.selectingFaceEffect(.volcano).selectingFaceEffect(.none)
        XCTAssertEqual(config.activeFaceEffect, .none)
        XCTAssertFalse(config.hasAdvancedFilters)
    }

    func test_hasAdvancedFilters_stylizedPresetAlone_returnsTrue() {
        XCTAssertTrue(VideoFilterConfig.default.selectingFaceEffect(.demon).hasAdvancedFilters)
    }

    func test_applyingPreset_keepsBlurSmoothingAndFaceEffect() {
        let start = VideoFilterConfig.default
            .withBackgroundBlur(true)
            .selectingFaceEffect(.angel)
        let config = start.applyingPreset(.warm)
        XCTAssertEqual(VideoFilterPreset.matching(config), .warm)
        XCTAssertTrue(config.isEnabled)
        XCTAssertTrue(config.backgroundBlurEnabled)
        XCTAssertEqual(config.faceEffect, .angel)
    }

    func test_applyingPreset_nil_turnsColourOffButKeepsTheFace() {
        let config = VideoFilterConfig.default.applyingPreset(.vivid).selectingFaceEffect(.toad).applyingPreset(nil)
        XCTAssertFalse(config.isEnabled)
        XCTAssertNil(config.activePreset)
        XCTAssertEqual(config.activeFaceEffect, .toad)
    }

    func test_activePreset_followsTheAppliedPreset() {
        XCTAssertEqual(VideoFilterConfig.default.applyingPreset(.cool).activePreset, .cool)
        XCTAssertNil(VideoFilterConfig.default.activePreset)
    }

    func test_withBrightness_clampsAndEnablesColour() {
        let config = VideoFilterConfig.default.withBrightness(0.9)
        XCTAssertEqual(config.brightness, VideoFilterConfig.brightnessLimit)
        XCTAssertTrue(config.isEnabled)
        XCTAssertEqual(VideoFilterConfig.default.withBrightness(-0.9).brightness, -VideoFilterConfig.brightnessLimit)
    }

    func test_withBackgroundBlur_togglesOnlyTheBlur() {
        let config = VideoFilterConfig.default.selectingFaceEffect(.demon).withBackgroundBlur(true)
        XCTAssertTrue(config.backgroundBlurEnabled)
        XCTAssertEqual(config.faceEffect, .demon)
        XCTAssertFalse(config.withBackgroundBlur(false).backgroundBlurEnabled)
    }

    // MARK: - Pipeline

    private func makePixelBuffer(width: Int = 64, height: Int = 48) -> CVPixelBuffer {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer)
        precondition(status == kCVReturnSuccess, "CVPixelBufferCreate failed")
        return pixelBuffer!
    }

    func test_process_stylizedPresetAlone_processesTheFrame() {
        let sut = VideoFilterPipeline(faceEffects: SpyFaceEffectsRenderer())
        sut.config = VideoFilterConfig.default.selectingFaceEffect(.volcano)
        _ = sut.process(makePixelBuffer())
        XCTAssertNotNil(sut.lastFrameProcessingTime)
    }

    func test_process_forwardsTheEffectAndTheFrameRotation() {
        let spy = SpyFaceEffectsRenderer()
        let sut = VideoFilterPipeline(faceEffects: spy)
        sut.config = VideoFilterConfig.default.selectingFaceEffect(.angel)
        _ = sut.process(makePixelBuffer(), averageBrightness: nil, rotation: 270)
        XCTAssertEqual(spy.renders.map(\.effect), [.angel])
        XCTAssertEqual(spy.renders.map(\.rotation), [270])
    }

    func test_process_noFaceEffect_neverCallsTheRenderer() {
        let spy = SpyFaceEffectsRenderer()
        let sut = VideoFilterPipeline(faceEffects: spy)
        sut.config = VideoFilterConfig.default.applyingPreset(.warm)
        _ = sut.process(makePixelBuffer())
        XCTAssertTrue(spy.renders.isEmpty)
    }

    func test_reset_resetsTheRenderer() {
        let spy = SpyFaceEffectsRenderer()
        let sut = VideoFilterPipeline(faceEffects: spy)
        sut.reset()
        XCTAssertEqual(spy.resetCount, 1)
    }

    // MARK: - Renderer

    func test_render_everyEffectAndRotation_keepsTheFrameExtent() {
        let buffer = makePixelBuffer()
        let image = CIImage(cvPixelBuffer: buffer)
        let sut = CallFaceEffectsRenderer()
        for effect in CallFaceEffect.allCases {
            for rotation in [0, 90, 180, 270] {
                let output = sut.render(effect, on: image, pixelBuffer: buffer, rotation: rotation, intensity: 0.5, isDegraded: false)
                XCTAssertEqual(output.extent.minX, image.extent.minX, accuracy: 0.5, "\(effect) at \(rotation)°")
                XCTAssertEqual(output.extent.minY, image.extent.minY, accuracy: 0.5, "\(effect) at \(rotation)°")
                XCTAssertEqual(output.extent.width, image.extent.width, accuracy: 0.5, "\(effect) at \(rotation)°")
                XCTAssertEqual(output.extent.height, image.extent.height, accuracy: 0.5, "\(effect) at \(rotation)°")
            }
        }
    }

    func test_render_none_returnsTheInputUntouched() {
        let buffer = makePixelBuffer()
        let image = CIImage(cvPixelBuffer: buffer)
        let output = CallFaceEffectsRenderer().render(.none, on: image, pixelBuffer: buffer, rotation: 90, intensity: 0.4, isDegraded: true)
        XCTAssertTrue(output === image)
    }
}

private final class SpyFaceEffectsRenderer: CallFaceEffectsRendererProviding, @unchecked Sendable {
    struct Render: Equatable {
        let effect: CallFaceEffect
        let rotation: Int
    }

    private(set) var renders: [Render] = []
    private(set) var resetCount = 0

    nonisolated func render(
        _ effect: CallFaceEffect,
        on image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        intensity: Float,
        isDegraded: Bool
    ) -> CIImage {
        renders.append(Render(effect: effect, rotation: rotation))
        return image
    }

    nonisolated func reset() {
        resetCount += 1
    }
}
