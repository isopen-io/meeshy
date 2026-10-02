import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import UIKit
import Vision

/// Un visage tel que le détecteur le rend : boîte normalisée à l'image, yeux
/// normalisés à la boîte.
nonisolated struct CallFaceDetection: Equatable, Sendable {
    let boundingBox: CGRect
    let leftEye: CGPoint?
    let rightEye: CGPoint?
    /// #9196 — centre des lèvres, normalisé à la boîte.
    let mouth: CGPoint?

    init(boundingBox: CGRect, leftEye: CGPoint?, rightEye: CGPoint?, mouth: CGPoint? = nil) {
        self.boundingBox = boundingBox
        self.leftEye = leftEye
        self.rightEye = rightEye
        self.mouth = mouth
    }
}

protocol CallFaceLandmarkDetecting: AnyObject {
    nonisolated func detect(in pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) -> CallFaceDetection?
}

nonisolated final class VisionFaceLandmarkDetector: CallFaceLandmarkDetecting, @unchecked Sendable {
    private let handler = VNSequenceRequestHandler()
    private let request = VNDetectFaceLandmarksRequest()

    func detect(in pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) -> CallFaceDetection? {
        guard (try? handler.perform([request], on: pixelBuffer, orientation: orientation)) != nil,
              let observation = request.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }) else { return nil }
        return CallFaceDetection(
            boundingBox: observation.boundingBox,
            leftEye: Self.center(of: observation.landmarks?.leftEye),
            rightEye: Self.center(of: observation.landmarks?.rightEye),
            mouth: Self.center(of: observation.landmarks?.outerLips)
        )
    }

    private static func center(of region: VNFaceLandmarkRegion2D?) -> CGPoint? {
        guard let points = region?.normalizedPoints, !points.isEmpty else { return nil }
        let sum = points.reduce(CGPoint.zero) { CGPoint(x: $0.x + $1.x, y: $0.y + $1.y) }
        return CGPoint(x: sum.x / CGFloat(points.count), y: sum.y / CGFloat(points.count))
    }
}

/// #9102 — les repères du visage ne sont JAMAIS cherchés sur l'image courante :
/// la détection part sur sa propre file, et chaque image dessine avec le dernier
/// visage connu. Le visage est gardé en coordonnées unitaires, donc il suit une
/// rotation du cadre sans attendre la détection suivante.
nonisolated final class CallFaceTracker: @unchecked Sendable {
    private let detector: any CallFaceLandmarkDetecting
    private let worker: CallVisionWorker
    private let lock = NSLock()
    private var unitFace: CallFaceLandmarks?
    private var frameCounter = 0
    private var missedDetections = 0
    private var generation = 0

    init(detector: any CallFaceLandmarkDetecting, executor: any CallVisionExecuting) {
        self.detector = detector
        self.worker = CallVisionWorker(executor: executor)
    }

    func reset() {
        lock.lock()
        defer { lock.unlock() }
        generation += 1
        unitFace = nil
        frameCounter = 0
        missedDetections = 0
    }

    func landmarks(for pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation, canvas: CGSize, isDegraded: Bool) -> CallFaceLandmarks? {
        lock.lock()
        frameCounter &+= 1
        let stride = CallFaceEffectBudget.detectionStride(isDegraded: isDegraded)
        let isDue = frameCounter % stride == 0 || (unitFace == nil && frameCounter % 2 == 0)
        let current = unitFace
        let token = generation
        lock.unlock()

        if isDue {
            let frame = CallFrameHandoff(pixelBuffer: pixelBuffer)
            worker.trySubmit { [weak self] in
                self?.detect(frame, orientation: orientation, generation: token)
            }
        }
        return current?.scaled(to: canvas)
    }

    private func detect(_ frame: CallFrameHandoff, orientation: CGImagePropertyOrientation, generation token: Int) {
        let signposter = CallVideoSignposts.signposter
        let interval = signposter.beginInterval("faceLandmarks", id: signposter.makeSignpostID())
        let detection = detector.detect(in: frame.pixelBuffer, orientation: orientation)
        signposter.endInterval("faceLandmarks", interval)

        lock.lock()
        defer { lock.unlock() }
        guard generation == token else { return }
        guard let detection else {
            missedDetections += 1
            if missedDetections >= CallFaceEffectBudget.missesBeforeLosingFace { unitFace = nil }
            return
        }
        missedDetections = 0
        let detected = CallFaceLandmarks.fromNormalized(
            boundingBox: detection.boundingBox,
            leftEye: detection.leftEye,
            rightEye: detection.rightEye,
            mouth: detection.mouth,
            imageSize: CGSize(width: 1, height: 1)
        )
        unitFace = unitFace?.smoothed(toward: detected, factor: CallFaceEffectBudget.landmarkSmoothing) ?? detected
    }
}

/// Réduire les animations, lu sur le fil principal (là où UIKit le sert) et
/// exposé sans verrou d'acteur à la file de capture.
nonisolated final class CallMotionPreference: @unchecked Sendable {
    static let shared = CallMotionPreference()

    private let lock = NSLock()
    private var reduced = false
    private var observer: NSObjectProtocol?

    var isReduceMotionEnabled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return reduced
    }

    private init() {
        DispatchQueue.main.async { [self] in
            MainActor.assumeIsolated { self.observe() }
        }
    }

    @MainActor
    private func observe() {
        store(UIAccessibility.isReduceMotionEnabled)
        observer = NotificationCenter.default.addObserver(
            forName: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.store(UIAccessibility.isReduceMotionEnabled) }
        }
    }

    private func store(_ value: Bool) {
        lock.lock()
        reduced = value
        lock.unlock()
    }
}
