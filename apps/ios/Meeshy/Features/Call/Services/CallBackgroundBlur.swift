import CoreImage
import CoreVideo
import Foundation
import QuartzCore
import Vision

nonisolated enum CallSegmentationQuality: Sendable, Equatable, Hashable {
    case balanced, fast
}

protocol CallPersonSegmentationProviding: AnyObject {
    nonisolated func segment(_ pixelBuffer: CVPixelBuffer, quality: CallSegmentationQuality) -> CVPixelBuffer?
}

/// Un seul `VNSequenceRequestHandler` et une seule requête pour tout l'appel —
/// appelés uniquement depuis la file série du `CallVisionWorker`.
nonisolated final class VisionPersonSegmenter: CallPersonSegmentationProviding, @unchecked Sendable {
    private let handler = VNSequenceRequestHandler()
    private let request: VNGeneratePersonSegmentationRequest = {
        let request = VNGeneratePersonSegmentationRequest()
        request.outputPixelFormat = kCVPixelFormatType_OneComponent8
        return request
    }()

    func segment(_ pixelBuffer: CVPixelBuffer, quality: CallSegmentationQuality) -> CVPixelBuffer? {
        request.qualityLevel = quality == .fast ? .fast : .balanced
        do {
            try handler.perform([request], on: pixelBuffer)
        } catch {
            return nil
        }
        return request.results?.first?.pixelBuffer
    }
}

// MARK: - Degradation ladder

/// Les paliers du flou, du plus fin au plus économe. Une surcharge descend d'UN
/// palier à la fois ; seul le dernier coupe le flou.
nonisolated enum CallBlurTier: Int, Comparable, CaseIterable, Sendable {
    case balanced, fast, slow, off

    struct Segmentation: Equatable, Sendable {
        let quality: CallSegmentationQuality
        let framesPerSecond: Double
    }

    var segmentation: Segmentation? {
        switch self {
        case .balanced: return Segmentation(quality: .balanced, framesPerSecond: 15)
        case .fast: return Segmentation(quality: .fast, framesPerSecond: 15)
        case .slow: return Segmentation(quality: .fast, framesPerSecond: 10)
        case .off: return nil
        }
    }

    static func < (lhs: CallBlurTier, rhs: CallBlurTier) -> Bool { lhs.rawValue < rhs.rawValue }
}

nonisolated struct CallVideoDegradation: Equatable, Sendable {
    static let overBudgetMs: Double = 25
    static let restoreBudgetMs: Double = 15
    static let overBudgetFrames = 10
    static let underBudgetFrames = 30

    private(set) var tier: CallBlurTier = .balanced
    private(set) var overBudgetStreak = 0
    private(set) var underBudgetStreak = 0

    var isExhausted: Bool { tier == .off }
    var isSmoothingDegraded: Bool { overBudgetStreak >= Self.overBudgetFrames / 2 }

    func blurTier(isConstrained: Bool) -> CallBlurTier {
        isConstrained ? max(tier, .slow) : tier
    }

    /// Sans flou actif, les paliers intermédiaires n'économisent rien : une
    /// surcharge va droit au dernier, et un retour au budget droit au premier.
    func recording(elapsedMs: Double, blurActive: Bool) -> CallVideoDegradation {
        var next = self
        if elapsedMs > Self.overBudgetMs {
            next.overBudgetStreak += 1
            next.underBudgetStreak = 0
            guard next.overBudgetStreak >= Self.overBudgetFrames, tier != .off else { return next }
            next.tier = blurActive ? CallBlurTier(rawValue: tier.rawValue + 1) ?? .off : .off
            next.overBudgetStreak = 0
            return next
        }
        guard elapsedMs < Self.restoreBudgetMs else {
            next.underBudgetStreak = 0
            return next
        }
        next.underBudgetStreak += 1
        guard next.underBudgetStreak >= Self.underBudgetFrames, tier != .balanced else { return next }
        next.tier = blurActive ? CallBlurTier(rawValue: tier.rawValue - 1) ?? .balanced : .balanced
        next.underBudgetStreak = 0
        next.overBudgetStreak = 0
        return next
    }

    static func isDeviceConstrained() -> Bool {
        let info = ProcessInfo.processInfo
        return info.isLowPowerModeEnabled || [.serious, .critical].contains(info.thermalState)
    }
}

// MARK: - Background blur

/// Le masque de personne est calculé HORS de la file de capture, à la cadence du
/// palier, adouci et lissé dans le temps, puis réutilisé par chaque image
/// jusqu'au suivant. Le flou lui-même tourne sur l'image réduite au quart.
nonisolated final class CallBackgroundBlur: @unchecked Sendable {
    static let reduction: CGFloat = 0.25
    static let maskSoftening: Double = 1.2
    static let maskNewWeight: Double = 0.6

    private let context: CIContext
    private let segmenter: any CallPersonSegmentationProviding
    private let worker: CallVisionWorker
    private let lock = NSLock()
    private var lastSubmission: CFTimeInterval?
    private var mask: CIImage?
    private var generation = 0
    private var maskPool: CVPixelBufferPool?
    private var maskPoolSize: (width: Int, height: Int) = (0, 0)

    init(context: CIContext, segmenter: any CallPersonSegmentationProviding, executor: any CallVisionExecuting) {
        self.context = context
        self.segmenter = segmenter
        self.worker = CallVisionWorker(executor: executor)
    }

    func reset() {
        lock.lock()
        defer { lock.unlock() }
        generation += 1
        lastSubmission = nil
        mask = nil
    }

    func apply(to image: CIImage, pixelBuffer: CVPixelBuffer, radius: Double, tier: CallBlurTier, timestamp: CFTimeInterval) -> CIImage {
        guard let segmentation = tier.segmentation else { return image }
        requestMaskIfDue(pixelBuffer, segmentation: segmentation, timestamp: timestamp)
        guard let mask = currentMask() else { return image }
        return Self.composite(image, mask: mask, radius: radius)
    }

    static func composite(_ image: CIImage, mask: CIImage, radius: Double) -> CIImage {
        let extent = image.extent
        let down = CGAffineTransform(scaleX: reduction, y: reduction)
        let reduced = image.transformed(by: down)
        let reducedExtent = reduced.extent
        let background = reduced
            .clampedToExtent()
            .applyingGaussianBlur(sigma: max(radius * Double(reduction), 0.5))
            .cropped(to: reducedExtent)
            .clampedToExtent()
            .transformed(by: down.inverted())
            .cropped(to: extent)
        let fittedMask = mask
            .clampedToExtent()
            .transformed(by: CGAffineTransform(
                scaleX: extent.width / max(mask.extent.width, 1),
                y: extent.height / max(mask.extent.height, 1)
            ))
            .cropped(to: extent)
        return image.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: background,
            kCIInputMaskImageKey: fittedMask
        ])
    }

    private func currentMask() -> CIImage? {
        lock.lock()
        defer { lock.unlock() }
        return mask
    }

    private func requestMaskIfDue(_ pixelBuffer: CVPixelBuffer, segmentation: CallBlurTier.Segmentation, timestamp: CFTimeInterval) {
        lock.lock()
        let interval = 1 / segmentation.framesPerSecond
        let isDue = lastSubmission.map { timestamp - $0 >= interval * 0.9 } ?? true
        let token = generation
        lock.unlock()
        guard isDue else { return }

        let frame = CallFrameHandoff(pixelBuffer: pixelBuffer)
        let accepted = worker.trySubmit { [weak self] in
            self?.segment(frame, quality: segmentation.quality, generation: token)
        }
        guard accepted else { return }
        lock.lock()
        if generation == token { lastSubmission = timestamp }
        lock.unlock()
    }

    private func segment(_ frame: CallFrameHandoff, quality: CallSegmentationQuality, generation token: Int) {
        let signposter = CallVideoSignposts.signposter
        let interval = signposter.beginInterval("segmentation", id: signposter.makeSignpostID())
        defer { signposter.endInterval("segmentation", interval) }
        guard let raw = segmenter.segment(frame.pixelBuffer, quality: quality) else { return }

        let rawImage = CIImage(cvPixelBuffer: raw)
        let softened = rawImage
            .clampedToExtent()
            .applyingGaussianBlur(sigma: Self.maskSoftening)
            .cropped(to: rawImage.extent)
        let previous = currentMask().flatMap { $0.extent == rawImage.extent ? $0 : nil }
        let blended = previous.map {
            $0.applyingFilter("CIDissolveTransition", parameters: [
                kCIInputTargetImageKey: softened,
                kCIInputTimeKey: Self.maskNewWeight
            ]).cropped(to: rawImage.extent)
        } ?? softened
        let settled = render(blended, width: CVPixelBufferGetWidth(raw), height: CVPixelBufferGetHeight(raw)) ?? softened

        lock.lock()
        if generation == token { mask = settled }
        lock.unlock()
    }

    /// Le masque lissé est figé dans un tampon de SA réserve : sans ce rendu, chaque
    /// mélange avec le précédent allongerait le graphe Core Image sans fin.
    private func render(_ image: CIImage, width: Int, height: Int) -> CIImage? {
        guard let pool = pool(width: width, height: height) else { return nil }
        var buffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess, let buffer else { return nil }
        context.render(image, to: buffer)
        return CIImage(cvPixelBuffer: buffer)
    }

    private func pool(width: Int, height: Int) -> CVPixelBufferPool? {
        if let maskPool, maskPoolSize.width == width, maskPoolSize.height == height { return maskPool }
        let attributes: [String: Any] = [
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_OneComponent8,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:]
        ]
        let poolAttributes: [String: Any] = [kCVPixelBufferPoolMinimumBufferCountKey as String: 3]
        var created: CVPixelBufferPool?
        guard CVPixelBufferPoolCreate(nil, poolAttributes as CFDictionary, attributes as CFDictionary, &created) == kCVReturnSuccess else { return nil }
        maskPool = created
        maskPoolSize = (width, height)
        return created
    }
}
