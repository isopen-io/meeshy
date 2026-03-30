import CoreImage
import CoreImage.CIFilterBuiltins
import CoreVideo
import AVFoundation
import Vision
import os

#if canImport(WebRTC)
import WebRTC
#endif

// MARK: - Video Filter Configuration

struct VideoFilterConfig: Equatable, Sendable {
    var temperature: Float = 6500
    var tint: Float = 0
    var brightness: Float = 0
    var contrast: Float = 1.0
    var saturation: Float = 1.0
    var exposure: Float = 0
    var isEnabled: Bool = false

    var backgroundBlurEnabled: Bool = false
    var backgroundBlurRadius: Double = 10.0

    var skinSmoothingEnabled: Bool = false
    var skinSmoothingIntensity: Float = 0.4

    var hasAdvancedFilters: Bool {
        backgroundBlurEnabled || skinSmoothingEnabled
    }

    static let `default` = VideoFilterConfig()
}

// MARK: - Filter Presets

enum VideoFilterPreset: String, CaseIterable, Sendable {
    case natural, warm, cool, vivid, muted

    var config: VideoFilterConfig {
        var c = VideoFilterConfig()
        c.isEnabled = true
        switch self {
        case .natural:
            break
        case .warm:
            c.temperature = 7500
            c.tint = 5
            c.brightness = 0.02
            c.contrast = 1.05
            c.saturation = 1.1
        case .cool:
            c.temperature = 5500
            c.tint = -5
            c.contrast = 1.05
            c.saturation = 0.95
        case .vivid:
            c.brightness = 0.03
            c.contrast = 1.15
            c.saturation = 1.3
            c.exposure = 0.1
        case .muted:
            c.brightness = -0.02
            c.contrast = 0.9
            c.saturation = 0.7
            c.exposure = -0.1
        }
        return c
    }
}

// MARK: - Protocol

protocol VideoFilterPipelineProviding {
    var config: VideoFilterConfig { get set }
    var lastFrameProcessingTime: TimeInterval? { get }
    var isAutoDegraded: Bool { get }
    func process(_ pixelBuffer: CVPixelBuffer) -> CVPixelBuffer
    func process(_ pixelBuffer: CVPixelBuffer, averageBrightness: Float?) -> CVPixelBuffer
    func reset()
}

// MARK: - Video Filter Pipeline

final class VideoFilterPipeline: VideoFilterPipelineProviding {
    var config = VideoFilterConfig.default

    private(set) var lastFrameProcessingTime: TimeInterval?
    private(set) var isAutoDegraded = false

    private let context: CIContext
    private let autoDegradeBudgetMs: Double = 25.0
    private let autoRestoreBudgetMs: Double = 15.0
    private var consecutiveOverBudgetFrames = 0
    private var consecutiveUnderBudgetFrames = 0
    private let overBudgetThreshold = 10
    private let underBudgetThreshold = 30

    private lazy var segmentationRequest: VNGeneratePersonSegmentationRequest = {
        let request = VNGeneratePersonSegmentationRequest()
        request.qualityLevel = .balanced
        request.outputPixelFormat = kCVPixelFormatType_OneComponent8
        return request
    }()

    init() {
        self.context = CIContext(options: [
            .useSoftwareRenderer: false,
            .cacheIntermediates: false,
            .priorityRequestLow: false
        ])
    }

    func process(_ pixelBuffer: CVPixelBuffer) -> CVPixelBuffer {
        process(pixelBuffer, averageBrightness: nil)
    }

    func process(_ pixelBuffer: CVPixelBuffer, averageBrightness: Float?) -> CVPixelBuffer {
        guard config.isEnabled else { return pixelBuffer }

        let start = CACurrentMediaTime()

        var image = CIImage(cvPixelBuffer: pixelBuffer)

        // Pipeline order per §14.2.5:
        // 1. Low-light boost (automatic)
        image = applyLowLightBoost(to: image, averageBrightness: averageBrightness)
        // 2. Colorimetry
        image = applyTemperatureAndTint(to: image)
        image = applyColorControls(to: image)
        image = applyExposure(to: image)
        // 3. Background blur (if enabled and not auto-degraded)
        if config.backgroundBlurEnabled && !isAutoDegraded {
            image = applyBackgroundBlur(to: image, pixelBuffer: pixelBuffer)
        }
        // 4. Skin smoothing (if enabled and not auto-degraded for smoothing)
        if config.skinSmoothingEnabled && !isSmoothingDegraded {
            image = applySkinSmoothing(to: image, pixelBuffer: pixelBuffer)
        }

        context.render(image, to: pixelBuffer)

        let elapsed = CACurrentMediaTime() - start
        lastFrameProcessingTime = elapsed
        updateAutoDegradation(elapsedMs: elapsed * 1000)

        return pixelBuffer
    }

    func reset() {
        config = .default
        isAutoDegraded = false
        consecutiveOverBudgetFrames = 0
        consecutiveUnderBudgetFrames = 0
        lastFrameProcessingTime = nil
    }

    // MARK: - Auto-Degradation

    private var isSmoothingDegraded: Bool {
        consecutiveOverBudgetFrames >= overBudgetThreshold / 2
    }

    private func updateAutoDegradation(elapsedMs: Double) {
        if elapsedMs > autoDegradeBudgetMs {
            consecutiveOverBudgetFrames += 1
            consecutiveUnderBudgetFrames = 0
            if consecutiveOverBudgetFrames >= overBudgetThreshold && !isAutoDegraded {
                isAutoDegraded = true
                Logger.calls.warning("Video filters auto-degraded: \(elapsedMs, privacy: .public)ms exceeds \(self.autoDegradeBudgetMs)ms budget")
            }
        } else if elapsedMs < autoRestoreBudgetMs {
            consecutiveUnderBudgetFrames += 1
            if consecutiveUnderBudgetFrames >= underBudgetThreshold && isAutoDegraded {
                isAutoDegraded = false
                consecutiveOverBudgetFrames = 0
                Logger.calls.info("Video filters restored from auto-degradation")
            }
        } else {
            consecutiveUnderBudgetFrames = 0
        }
    }

    // MARK: - Colorimetry Filters

    private func applyTemperatureAndTint(to image: CIImage) -> CIImage {
        let neutral = CIVector(x: CGFloat(config.temperature), y: CGFloat(config.tint))
        let target = CIVector(x: 6500, y: 0)

        guard neutral != target else { return image }

        return image.applyingFilter("CITemperatureAndTint", parameters: [
            "inputNeutral": neutral,
            "inputTargetNeutral": target
        ])
    }

    private func applyColorControls(to image: CIImage) -> CIImage {
        let hasChanges = config.brightness != 0 || config.contrast != 1.0 || config.saturation != 1.0
        guard hasChanges else { return image }

        return image.applyingFilter("CIColorControls", parameters: [
            "inputBrightness": config.brightness,
            "inputContrast": config.contrast,
            "inputSaturation": config.saturation
        ])
    }

    private func applyExposure(to image: CIImage) -> CIImage {
        guard config.exposure != 0 else { return image }

        return image.applyingFilter("CIExposureAdjust", parameters: [
            "inputEV": config.exposure
        ])
    }

    // MARK: - Low-Light Boost (§14.2.4)

    private func applyLowLightBoost(to image: CIImage, averageBrightness: Float?) -> CIImage {
        guard let avgBrightness = averageBrightness else { return image }

        let normalizedBrightness = avgBrightness / 255.0
        guard normalizedBrightness < 0.3 else { return image }

        let boostFactor = (0.3 - normalizedBrightness) / 0.3

        var boosted = image
        boosted = boosted.applyingFilter("CIExposureAdjust", parameters: [
            "inputEV": boostFactor * 1.5
        ])
        boosted = boosted.applyingFilter("CINoiseReduction", parameters: [
            "inputNoiseLevel": boostFactor * 0.02,
            "inputSharpness": 0.4
        ])
        boosted = boosted.applyingFilter("CIColorControls", parameters: [
            "inputSaturation": 1.0 + boostFactor * 0.2
        ])
        return boosted
    }

    // MARK: - Background Blur (§14.2.2)

    private func applyBackgroundBlur(to image: CIImage, pixelBuffer: CVPixelBuffer) -> CIImage {
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        do {
            try handler.perform([segmentationRequest])
        } catch {
            Logger.calls.error("Person segmentation failed: \(error.localizedDescription)")
            return image
        }

        guard let maskPixelBuffer = segmentationRequest.results?.first?.pixelBuffer else {
            return image
        }

        let maskImage = CIImage(cvPixelBuffer: maskPixelBuffer)
            .transformed(by: CGAffineTransform(
                scaleX: image.extent.width / CIImage(cvPixelBuffer: maskPixelBuffer).extent.width,
                y: image.extent.height / CIImage(cvPixelBuffer: maskPixelBuffer).extent.height
            ))

        let blurredBackground = image
            .applyingGaussianBlur(sigma: config.backgroundBlurRadius)
            .cropped(to: image.extent)

        return image.applyingFilter("CIBlendWithMask", parameters: [
            "inputBackgroundImage": blurredBackground,
            "inputMaskImage": maskImage
        ])
    }

    // MARK: - Skin Smoothing (§14.2.3)

    private func applySkinSmoothing(to image: CIImage, pixelBuffer: CVPixelBuffer) -> CIImage {
        let faceRequest = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        do {
            try handler.perform([faceRequest])
        } catch {
            return image
        }

        guard faceRequest.results?.first != nil else {
            return image
        }

        let blurRadius = Double(config.skinSmoothingIntensity) * 3.0
        guard blurRadius > 0 else { return image }

        return image.applyingFilter("CIGaussianBlur", parameters: [
            "inputRadius": blurRadius
        ]).cropped(to: image.extent).composited(over: image)
    }
}

// MARK: - Logger Extension

private extension Logger {
    static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}

// MARK: - WebRTC Video Filter Capturer Delegate

#if canImport(WebRTC)
final class VideoFilterCapturerDelegate: NSObject, RTCVideoCapturerDelegate {
    private let target: RTCVideoCapturerDelegate
    private let pipeline: VideoFilterPipeline
    let darkFrameDetector = DarkFrameDetector()
    private var frameCount = 0

    init(target: RTCVideoCapturerDelegate, pipeline: VideoFilterPipeline) {
        self.target = target
        self.pipeline = pipeline
        super.init()
    }

    func capturer(_ capturer: RTCVideoCapturer, didCapture frame: RTCVideoFrame) {
        guard let pixelBuffer = (frame.buffer as? RTCCVPixelBuffer)?.pixelBuffer else {
            target.capturer(capturer, didCapture: frame)
            return
        }

        // Dark frame detection every 10th frame (~3fps at 30fps) for efficiency
        frameCount += 1
        if frameCount % 10 == 0 {
            darkFrameDetector.analyzeFrame(pixelBuffer)
        }

        if pipeline.config.isEnabled {
            _ = pipeline.process(pixelBuffer, averageBrightness: darkFrameDetector.lastAverageBrightness)
        }

        target.capturer(capturer, didCapture: frame)
    }
}
#endif
