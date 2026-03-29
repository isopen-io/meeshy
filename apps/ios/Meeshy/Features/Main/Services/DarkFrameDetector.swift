import CoreVideo
import Accelerate
import os

final class DarkFrameDetector {
    private var consecutiveDarkFrames = 0
    private let darkThreshold: Float = 15.0
    private let consecutiveThreshold = 30

    var onDarkFrameDetected: (() -> Void)?
    var onLightFrameRestored: (() -> Void)?

    private var isDark = false

    func analyzeFrame(_ pixelBuffer: CVPixelBuffer) {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let pixelFormat = CVPixelBufferGetPixelFormatType(pixelBuffer)

        var luminanceSum: Float = 0
        var sampleCount: Float = 0
        let step = 8

        if pixelFormat == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange ||
           pixelFormat == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange {
            guard let yPlane = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return }
            let yBytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)

            for y in stride(from: 0, to: height, by: step) {
                for x in stride(from: 0, to: width, by: step) {
                    let offset = y * yBytesPerRow + x
                    let lum = Float(yPlane.load(fromByteOffset: offset, as: UInt8.self))
                    luminanceSum += lum
                    sampleCount += 1
                }
            }
        } else {
            for y in stride(from: 0, to: height, by: step) {
                for x in stride(from: 0, to: width, by: step) {
                    let offset = y * bytesPerRow + x * 4
                    let b = Float(baseAddress.load(fromByteOffset: offset, as: UInt8.self))
                    let g = Float(baseAddress.load(fromByteOffset: offset + 1, as: UInt8.self))
                    let r = Float(baseAddress.load(fromByteOffset: offset + 2, as: UInt8.self))
                    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
                    luminanceSum += lum
                    sampleCount += 1
                }
            }
        }

        guard sampleCount > 0 else { return }
        let avgLuminance = luminanceSum / sampleCount

        if avgLuminance < darkThreshold {
            consecutiveDarkFrames += 1
            if consecutiveDarkFrames >= consecutiveThreshold && !isDark {
                isDark = true
                onDarkFrameDetected?()
                Logger.calls.info("Dark frame detected — camera may be covered (avg lum: \(avgLuminance))")
            }
        } else {
            if isDark && consecutiveDarkFrames > 0 {
                isDark = false
                onLightFrameRestored?()
                Logger.calls.info("Light frame restored (avg lum: \(avgLuminance))")
            }
            consecutiveDarkFrames = 0
        }
    }

    func reset() {
        consecutiveDarkFrames = 0
        isDark = false
    }
}

// MARK: - Logger Extension

private extension Logger {
    static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
