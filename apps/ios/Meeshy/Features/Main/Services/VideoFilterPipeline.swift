import CoreImage
import CoreImage.CIFilterBuiltins
import CoreVideo
import AVFoundation
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

    static let `default` = VideoFilterConfig()
}

// MARK: - Protocol

protocol VideoFilterPipelineProviding {
    var config: VideoFilterConfig { get set }
    func process(_ pixelBuffer: CVPixelBuffer) -> CVPixelBuffer
    func reset()
}

// MARK: - Video Filter Pipeline

final class VideoFilterPipeline: VideoFilterPipelineProviding {
    var config = VideoFilterConfig.default

    private let context: CIContext

    init() {
        self.context = CIContext(options: [
            .useSoftwareRenderer: false,
            .cacheIntermediates: false,
            .priorityRequestLow: false
        ])
    }

    func process(_ pixelBuffer: CVPixelBuffer) -> CVPixelBuffer {
        guard config.isEnabled else { return pixelBuffer }

        var image = CIImage(cvPixelBuffer: pixelBuffer)

        image = applyTemperatureAndTint(to: image)
        image = applyColorControls(to: image)
        image = applyExposure(to: image)

        context.render(image, to: pixelBuffer)
        return pixelBuffer
    }

    func reset() {
        config = .default
    }

    // MARK: - Filter Application

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
}

// MARK: - WebRTC Video Filter Capturer Delegate

#if canImport(WebRTC)
final class VideoFilterCapturerDelegate: NSObject, RTCVideoCapturerDelegate {
    private let target: RTCVideoCapturerDelegate
    private let pipeline: VideoFilterPipeline

    init(target: RTCVideoCapturerDelegate, pipeline: VideoFilterPipeline) {
        self.target = target
        self.pipeline = pipeline
        super.init()
    }

    func capturer(_ capturer: RTCVideoCapturer, didCapture frame: RTCVideoFrame) {
        guard pipeline.config.isEnabled else {
            target.capturer(capturer, didCapture: frame)
            return
        }

        guard let pixelBuffer = (frame.buffer as? RTCCVPixelBuffer)?.pixelBuffer else {
            target.capturer(capturer, didCapture: frame)
            return
        }

        _ = pipeline.process(pixelBuffer)

        target.capturer(capturer, didCapture: frame)
    }
}
#endif
