import CoreImage
import CoreImage.CIFilterBuiltins
import CoreVideo
import AVFoundation
import Vision
import Metal
import os

#if canImport(WebRTC)
import WebRTC
#endif

// MARK: - Video Filter Configuration

// Pur value type lu/écrit depuis la capture-queue ET depuis MainActor : le
// défaut de module SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor isolerait sa
// conformance `Equatable` synthétisée, la rendant inutilisable hors MainActor
// (le bundle de tests, volontairement nonisolated, ne compilait plus).
nonisolated struct VideoFilterConfig: Equatable, Sendable {
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

    var faceEffect: CallFaceEffect = .none

    var hasAdvancedFilters: Bool {
        backgroundBlurEnabled || skinSmoothingEnabled || faceEffect.isStylized
    }

    static let `default` = VideoFilterConfig()
}

// MARK: - Low light (#8695)

/// La scène sombre, seule amélioration AUTOMATIQUE du flux envoyé : elle ne
/// coûte une passe GPU que si l'image est sous 30 % de luminance moyenne, et
/// jamais sur un appareil contraint (économie d'énergie, pipeline hors budget).
nonisolated enum CallVideoLowLight {
    static let threshold: Float = 0.3

    /// - Returns: la force de l'éclaircissement (0…1), `nil` pour ne rien faire.
    static func boost(averageBrightness: Float?, isConstrained: Bool) -> Float? {
        guard !isConstrained, let averageBrightness else { return nil }
        let normalized = averageBrightness / 255
        guard normalized < threshold else { return nil }
        return (threshold - normalized) / threshold
    }
}

// MARK: - Filter Presets

nonisolated enum VideoFilterPreset: String, CaseIterable, Sendable {
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

    /// Reverse-lookup: which preset (if any) produced `config`'s colorimetry.
    ///
    /// Compares colorimetric fields only (`temperature`/`tint`/`brightness`/
    /// `contrast`/`saturation`/`exposure`) — never `isEnabled` or the two
    /// advanced-filter fields. `isEnabled` is intentionally ignored so the
    /// "Reset" affordance (which sets `.natural`'s colorimetry but flips
    /// `isEnabled` back to `false`) still resolves to `.natural`. The advanced
    /// fields are ignored because `presetChip` deliberately carries the
    /// caller's own `backgroundBlurEnabled`/`skinSmoothingEnabled` across a
    /// preset switch (see `VideoFiltersPanel.presetChip`) — they are
    /// orthogonal to which colorimetry preset is active.
    ///
    /// Returns `nil` when no preset's colorimetry matches — e.g. the user
    /// hand-tuned a slider in `VideoFilterControlView`, which is a legitimate
    /// "no preset selected" state, not a bug.
    static func matching(_ config: VideoFilterConfig) -> VideoFilterPreset? {
        allCases.first { preset in
            let c = preset.config
            return c.temperature == config.temperature
                && c.tint == config.tint
                && c.brightness == config.brightness
                && c.contrast == config.contrast
                && c.saturation == config.saturation
                && c.exposure == config.exposure
        }
    }
}

// MARK: - Protocol

protocol VideoFilterPipelineProviding {
    nonisolated var config: VideoFilterConfig { get set }
    nonisolated var lastFrameProcessingTime: TimeInterval? { get }
    nonisolated var isAutoDegraded: Bool { get }
    nonisolated func process(_ pixelBuffer: CVPixelBuffer) -> CVPixelBuffer
    nonisolated func process(_ pixelBuffer: CVPixelBuffer, averageBrightness: Float?) -> CVPixelBuffer
    nonisolated func process(_ pixelBuffer: CVPixelBuffer, averageBrightness: Float?, rotation: Int) -> CVPixelBuffer
    nonisolated func reset()
}

// MARK: - Video Filter Pipeline
//
// `nonisolated` : `process(_:averageBrightness:)` est invoquée depuis la queue
// WebRTC `org.webrtc.cameravideocapturer.video` (cf. `VideoFilterCapturerDelegate`).
// Sous default isolation = MainActor du target Meeshy, sans annotation explicite
// chaque méthode/property serait @MainActor et trap au premier frame livré.

nonisolated final class VideoFilterPipeline: VideoFilterPipelineProviding, @unchecked Sendable {
    // `config` is written from the MainActor (slider drags in VideoFiltersPanel,
    // CallManager toggles) and read from WebRTC's serial capture queue inside
    // `process(_:averageBrightness:)` at ~30Hz. Without a lock, a write racing a
    // read can tear the struct — e.g. pairing a new `backgroundBlurEnabled` with
    // a stale `backgroundBlurRadius` — producing a visibly glitchy frame.
    // `isAutoDegraded`/`lastFrameProcessingTime` have the same MainActor-reads/
    // capture-queue-writes shape (VideoFiltersPanel reads `isAutoDegraded`), so
    // they share the same lock.
    private let stateLock = NSLock()

    private var _config = VideoFilterConfig.default
    var config: VideoFilterConfig {
        get { stateLock.lock(); defer { stateLock.unlock() }; return _config }
        set { stateLock.lock(); defer { stateLock.unlock() }; _config = newValue }
    }

    private var _lastFrameProcessingTime: TimeInterval?
    private(set) var lastFrameProcessingTime: TimeInterval? {
        get { stateLock.lock(); defer { stateLock.unlock() }; return _lastFrameProcessingTime }
        set { stateLock.lock(); defer { stateLock.unlock() }; _lastFrameProcessingTime = newValue }
    }

    private var _isAutoDegraded = false
    private(set) var isAutoDegraded: Bool {
        get { stateLock.lock(); defer { stateLock.unlock() }; return _isAutoDegraded }
        set { stateLock.lock(); defer { stateLock.unlock() }; _isAutoDegraded = newValue }
    }

    private let context: CIContext
    private let autoDegradeBudgetMs: Double = 25.0
    private let autoRestoreBudgetMs: Double = 15.0
    private var consecutiveOverBudgetFrames = 0
    private var consecutiveUnderBudgetFrames = 0
    private let overBudgetThreshold = 10
    private let underBudgetThreshold = 30

    private let faceEffects: any CallFaceEffectsRendererProviding
    private let isPowerConstrained: @Sendable () -> Bool

    // PERF-014: dedicated CVPixelBufferPool for filter output. Rendering back
    // into the input buffer (capturer-owned pool) starves the camera capturer
    // and produces dropped frames at high res. We allocate from our own pool
    // and return the new buffer.
    private var outputPool: CVPixelBufferPool?
    private var outputPoolWidth: Int = 0
    private var outputPoolHeight: Int = 0
    private var outputPoolPixelFormat: OSType = 0

    // `let` (eager init) plutôt que `lazy var` — Swift 6 n'autorise pas
    // `nonisolated` sur les lazy properties, et la classe étant nonisolated,
    // une lazy implicitement-isolated trap quand on lit la property depuis
    // le video thread. L'init est cheap (~µs) donc l'eager init n'a pas de
    // coût mesurable.
    private let segmentationRequest: VNGeneratePersonSegmentationRequest = {
        let request = VNGeneratePersonSegmentationRequest()
        request.qualityLevel = .balanced
        request.outputPixelFormat = kCVPixelFormatType_OneComponent8
        return request
    }()

    init(
        faceEffects: any CallFaceEffectsRendererProviding = CallFaceEffectsRenderer(),
        isPowerConstrained: @escaping @Sendable () -> Bool = { ProcessInfo.processInfo.isLowPowerModeEnabled }
    ) {
        self.faceEffects = faceEffects
        self.isPowerConstrained = isPowerConstrained
        // PERF-015: explicit Metal device + disabled colorspace work. Pinning
        // CIContext to MTLCreateSystemDefaultDevice() forces GPU-backed
        // rendering and skips the implicit sRGB→working-space conversion that
        // .workingColorSpace defaults to. Saves ~3ms/frame on 720p.
        if let device = MTLCreateSystemDefaultDevice() {
            self.context = CIContext(mtlDevice: device, options: [
                .useSoftwareRenderer: false,
                .cacheIntermediates: false,
                .priorityRequestLow: false,
                .workingColorSpace: NSNull()
            ])
        } else {
            self.context = CIContext(options: [
                .useSoftwareRenderer: false,
                .cacheIntermediates: false,
                .priorityRequestLow: false
            ])
        }
    }

    func process(_ pixelBuffer: CVPixelBuffer) -> CVPixelBuffer {
        process(pixelBuffer, averageBrightness: nil)
    }

    func process(_ pixelBuffer: CVPixelBuffer, averageBrightness: Float?) -> CVPixelBuffer {
        process(pixelBuffer, averageBrightness: averageBrightness, rotation: 90)
    }

    func process(_ pixelBuffer: CVPixelBuffer, averageBrightness: Float?, rotation: Int) -> CVPixelBuffer {
        // Single atomic snapshot: every filter stage below reads this same
        // struct copy, so a slider drag landing mid-frame can only ever apply
        // fully-before or fully-after this frame — never a torn mix of fields.
        let cfg = config
        // `isEnabled` is only ever set true by picking a colorimetry preset
        // (VideoFilterPreset.config, above). Background blur / skin smoothing
        // are independent opt-in toggles (§14.1) that never touch `isEnabled`
        // — gating the whole pipeline on it alone silently no-op'd both
        // whenever a user enabled one without ever picking a preset.
        // #8695 — a dark scene is lifted even with no filter chosen, unless
        // the device saves power or the pipeline is already over budget.
        let hasChosenFilters = cfg.isEnabled || cfg.hasAdvancedFilters
        let lowLightBoost = CallVideoLowLight.boost(
            averageBrightness: averageBrightness,
            isConstrained: isAutoDegraded || isPowerConstrained()
        )
        guard hasChosenFilters || lowLightBoost != nil else {
            updateAutoDegradation(elapsedMs: 0)
            return pixelBuffer
        }

        let start = CACurrentMediaTime()

        var image = CIImage(cvPixelBuffer: pixelBuffer)

        // Pipeline order per §14.2.5:
        // 1. Low-light boost (automatic)
        image = applyLowLightBoost(to: image, boost: lowLightBoost)
        // 2. Colorimetry
        if hasChosenFilters {
            image = applyTemperatureAndTint(to: image, config: cfg)
            image = applyColorControls(to: image, config: cfg)
            image = applyExposure(to: image, config: cfg)
        }
        // 3. Background blur (if enabled and not auto-degraded)
        if cfg.backgroundBlurEnabled && !isAutoDegraded {
            image = applyBackgroundBlur(to: image, pixelBuffer: pixelBuffer, config: cfg)
        }
        // 4. Face effect: skin smoothing (skipped when degraded) or a stylized preset
        let faceEffect = cfg.activeFaceEffect
        if faceEffect.isStylized || (faceEffect == .smoothing && !isSmoothingDegraded) {
            image = faceEffects.render(
                faceEffect,
                on: image,
                pixelBuffer: pixelBuffer,
                rotation: rotation,
                intensity: cfg.skinSmoothingIntensity,
                isDegraded: isAutoDegraded || isSmoothingDegraded
            )
        }

        // PERF-014: render into a pool-allocated output buffer instead of
        // mutating the capturer's input buffer. Falls back to in-place
        // rendering if pool allocation fails (matches legacy behaviour).
        let output: CVPixelBuffer
        if let pooled = makeOutputBuffer(matching: pixelBuffer) {
            context.render(image, to: pooled)
            output = pooled
        } else {
            context.render(image, to: pixelBuffer)
            output = pixelBuffer
        }

        let elapsed = CACurrentMediaTime() - start
        lastFrameProcessingTime = elapsed
        updateAutoDegradation(elapsedMs: elapsed * 1000)

        return output
    }

    /// PERF-014: Lazily build a CVPixelBufferPool sized to the first frame we
    /// see; rebuild only when the input dimensions or pixel format change
    /// (e.g. user rotates the camera). Pool returns IOSurface-backed buffers
    /// so WebRTC can pass them straight to the encoder without a copy.
    private func makeOutputBuffer(matching input: CVPixelBuffer) -> CVPixelBuffer? {
        let width = CVPixelBufferGetWidth(input)
        let height = CVPixelBufferGetHeight(input)
        let format = CVPixelBufferGetPixelFormatType(input)

        if outputPool == nil || width != outputPoolWidth || height != outputPoolHeight || format != outputPoolPixelFormat {
            let attrs: [String: Any] = [
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height,
                kCVPixelBufferPixelFormatTypeKey as String: format,
                kCVPixelBufferIOSurfacePropertiesKey as String: [:]
            ]
            let poolAttrs: [String: Any] = [
                kCVPixelBufferPoolMinimumBufferCountKey as String: 3
            ]
            var pool: CVPixelBufferPool?
            let status = CVPixelBufferPoolCreate(nil, poolAttrs as CFDictionary, attrs as CFDictionary, &pool)
            guard status == kCVReturnSuccess, let createdPool = pool else {
                Logger.calls.warning("VideoFilterPipeline pool creation failed: status=\(status, privacy: .public)")
                return nil
            }
            outputPool = createdPool
            outputPoolWidth = width
            outputPoolHeight = height
            outputPoolPixelFormat = format
        }

        guard let pool = outputPool else { return nil }
        var buffer: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
        guard status == kCVReturnSuccess else { return nil }
        return buffer
    }

    func reset() {
        config = .default
        isAutoDegraded = false
        consecutiveOverBudgetFrames = 0
        consecutiveUnderBudgetFrames = 0
        lastFrameProcessingTime = nil
        faceEffects.reset()
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

    private func applyTemperatureAndTint(to image: CIImage, config: VideoFilterConfig) -> CIImage {
        let neutral = CIVector(x: CGFloat(config.temperature), y: CGFloat(config.tint))
        let target = CIVector(x: 6500, y: 0)

        guard neutral != target else { return image }

        return image.applyingFilter("CITemperatureAndTint", parameters: [
            "inputNeutral": neutral,
            "inputTargetNeutral": target
        ])
    }

    private func applyColorControls(to image: CIImage, config: VideoFilterConfig) -> CIImage {
        let hasChanges = config.brightness != 0 || config.contrast != 1.0 || config.saturation != 1.0
        guard hasChanges else { return image }

        return image.applyingFilter("CIColorControls", parameters: [
            "inputBrightness": config.brightness,
            "inputContrast": config.contrast,
            "inputSaturation": config.saturation
        ])
    }

    private func applyExposure(to image: CIImage, config: VideoFilterConfig) -> CIImage {
        guard config.exposure != 0 else { return image }

        return image.applyingFilter("CIExposureAdjust", parameters: [
            "inputEV": config.exposure
        ])
    }

    // MARK: - Low-Light Boost (§14.2.4)

    private func applyLowLightBoost(to image: CIImage, boost: Float?) -> CIImage {
        guard let boostFactor = boost else { return image }

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

    private func applyBackgroundBlur(to image: CIImage, pixelBuffer: CVPixelBuffer, config: VideoFilterConfig) -> CIImage {
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

        let rawMask = CIImage(cvPixelBuffer: maskPixelBuffer)
        let maskImage = rawMask
            .transformed(by: CGAffineTransform(
                scaleX: image.extent.width / rawMask.extent.width,
                y: image.extent.height / rawMask.extent.height
            ))

        let blurredBackground = image
            .applyingGaussianBlur(sigma: config.backgroundBlurRadius)
            .cropped(to: image.extent)

        return image.applyingFilter("CIBlendWithMask", parameters: [
            "inputBackgroundImage": blurredBackground,
            "inputMaskImage": maskImage
        ])
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}

// MARK: - WebRTC Video Filter Capturer Delegate
//
// CRITIQUE — `nonisolated` obligatoire : `RTCCameraVideoCapturer` invoque
// `capturer(_:didCapture:)` depuis sa queue série `org.webrtc.cameravideocapturer.video`
// (cf. stack trace `AVCaptureVideoDataOutput._processSampleBuffer →
// VideoFilterCapturerDelegate.capturer`). Sous SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor,
// l'`@objc` thunk insère `_swift_task_checkIsolatedSwift` qui trap en
// `dispatch_assert_queue_fail` dès la première frame livrée → SIGABRT immédiat
// au démarrage de tout appel vidéo.

#if canImport(WebRTC)
nonisolated final class VideoFilterCapturerDelegate: NSObject, RTCVideoCapturerDelegate, @unchecked Sendable {
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

        // Vague 107 (#2859) taught `process()` itself to also run when
        // `hasAdvancedFilters` is true (background blur / skin smoothing
        // toggled without ever picking a colorimetry preset, so `isEnabled`
        // stays false) — but left THIS call site gating the call on
        // `isEnabled` alone, so `process()` was never even reached in that
        // case: the frame handed to the encoder stayed unfiltered while
        // CallView's toolbar chip (fixed in the same PR) now claimed the
        // filter was active. `process()`'s own guard (`cfg.isEnabled ||
        // cfg.hasAdvancedFilters`) is the single source of truth for
        // "should this frame run through the pipeline" — duplicating that
        // condition here is exactly what let the two drift apart once
        // already; always calling it keeps there being only one place that
        // can get the condition wrong.
        //
        // PERF-014: process() may return a NEW buffer from its private
        // pool (different from the capturer's input pool). When that
        // happens we need to forward a frame wrapping the new buffer so
        // the encoder receives the filtered pixels. If the pool fell
        // back to in-place rendering, or the pipeline early-returned the
        // input unchanged, the returned buffer === input and the original
        // frame already reflects the (non-)filter result.
        let processed = pipeline.process(
            pixelBuffer,
            averageBrightness: darkFrameDetector.lastAverageBrightness,
            rotation: Int(frame.rotation.rawValue)
        )
        if processed !== pixelBuffer {
            let wrapped = RTCCVPixelBuffer(pixelBuffer: processed)
            let filteredFrame = RTCVideoFrame(
                buffer: wrapped,
                rotation: frame.rotation,
                timeStampNs: frame.timeStampNs
            )
            target.capturer(capturer, didCapture: filteredFrame)
            return
        }

        target.capturer(capturer, didCapture: frame)
    }
}
#endif
