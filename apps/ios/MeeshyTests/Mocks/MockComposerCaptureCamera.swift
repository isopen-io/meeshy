import AVFoundation
import CoreGraphics
@testable import Meeshy

/// La doublure de l'objectif du viseur : elle bascule sur commande et journalise
/// ce que la machine de capture lui demande.
@MainActor
final class MockComposerCaptureCamera: ComposerCaptureCameraProviding {
    nonisolated deinit {}

    var currentPosition: AVCaptureDevice.Position = .back
    var isSwitchingCamera = false
    var zoomFactor: CGFloat = 1
    var zoomRange: ClosedRange<CGFloat> = 0.5...10

    private(set) var switchCameraCallCount = 0
    private(set) var zoomRequests: [CGFloat] = []
    private(set) var torchRequests: [AVCaptureDevice.TorchMode] = []
    private(set) var photoFlashes: [AVCaptureDevice.FlashMode] = []
    /// La bascule ne se conclut que sur `finishSwitch()` — comme la file réelle.
    private var pendingSwitch: (@MainActor @Sendable (AVCaptureDevice.Position) -> Void)?

    func switchCamera(then: @escaping @MainActor @Sendable (AVCaptureDevice.Position) -> Void) {
        switchCameraCallCount += 1
        isSwitchingCamera = true
        pendingSwitch = then
    }

    func finishSwitch() {
        currentPosition = currentPosition == .back ? .front : .back
        zoomFactor = 1
        isSwitchingCamera = false
        let suite = pendingSwitch
        pendingSwitch = nil
        suite?(currentPosition)
    }

    func setZoom(_ factor: CGFloat) {
        zoomRequests.append(factor)
        zoomFactor = factor
    }

    func setTorch(_ mode: AVCaptureDevice.TorchMode, level: Double) {
        torchRequests.append(mode)
    }

    func takePhoto(flash: AVCaptureDevice.FlashMode) {
        photoFlashes.append(flash)
    }
}
