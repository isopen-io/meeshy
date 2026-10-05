import AVFoundation
import UIKit
import os
import MeeshySDK

/// Pourquoi la caméra n'a pas pu servir — NOMMÉ dans l'état du déroulé, pour que
/// l'écran dise quoi faire. Un refus n'est pas une impasse : la galerie comme la
/// carte seule restent possibles depuis tous ces états.
nonisolated enum CameraFailure: String, Sendable, Equatable {
    /// L'utilisateur (ou les restrictions de l'appareil) a refusé la caméra.
    case denied
    /// Aucune caméra avant ici (simulateur, appareil sans objectif).
    case unsupported
    /// La session n'a pas pu démarrer (une autre application l'utilise).
    case unavailable
}

/// LA CAMÉRA AVANT DU MOMENT PHOTO (#9382) — `AVCaptureSession` et
/// `AVCapturePhotoOutput`, conception partie VI. Un protocole : le déroulé se
/// teste sans objectif.
@MainActor
protocol GamePhotoCameraProviding: AnyObject {
    /// La session que l'aperçu affiche (`CameraPreviewLayer`).
    var session: AVCaptureSession { get }
    /// Ouvre la caméra avant ; `nil` = elle est vivante, sinon la raison.
    func start() async -> CameraFailure?
    func stop()
    /// Déclenche ; `nil` quand l'objectif n'a rien rendu.
    func capture() async -> UIImage?
}

/// Contrairement à `CameraModel` (viseur de l'app), cette caméra N'ENREGISTRE
/// RIEN dans Photos à la prise : la photo reste sur l'appareil, dans le
/// déroulé, tant que l'utilisateur ne l'enregistre pas — « aucune image n'est
/// envoyée au serveur », et aucune n'est écrite ailleurs sans geste.
@MainActor
final class GamePhotoCamera: NSObject, GamePhotoCameraProviding {
    nonisolated deinit {}

    nonisolated(unsafe) let session = AVCaptureSession()
    /// Le traitement UNIQUE de toute prise photo de l'app (#8695) : redressée, bornée, améliorée.
    nonisolated let photoProcessor: any PhotoCaptureProcessorProviding
    private let output = AVCapturePhotoOutput()
    private var configured = false
    /// Ce que le déroulé VEUT : démarrage et arrêt partent chacun sur leur tâche, sans
    /// ordre garanti ; un arrêt demandé pendant le démarrage est rejoué à son issue.
    private var wantsRunning = false
    private var pending: CheckedContinuation<UIImage?, Never>?

    init(photoProcessor: any PhotoCaptureProcessorProviding = PhotoCaptureProcessor.shared) {
        self.photoProcessor = photoProcessor
        super.init()
    }

    func start() async -> CameraFailure? {
        guard await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false) else {
            return .denied
        }
        if !configured {
            guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
                  let input = try? AVCaptureDeviceInput(device: device) else {
                return .unsupported
            }
            session.beginConfiguration()
            session.sessionPreset = .photo
            guard session.canAddInput(input), session.canAddOutput(output) else {
                session.commitConfiguration()
                return .unavailable
            }
            session.addInput(input)
            session.addOutput(output)
            session.commitConfiguration()
            configured = true
        }
        wantsRunning = true
        Task.detached { [weak self] in
            self?.session.startRunning()
            await self?.settleAfterStart()
        }
        guard await waitUntilRunning(timeout: 3) else { return .unavailable }
        return nil
    }

    func stop() {
        wantsRunning = false
        Task.detached { [weak self] in
            self?.session.stopRunning()
        }
    }

    /// Le déroulé s'est refermé pendant que la caméra démarrait : l'arrêt parti avant
    /// le démarrage n'a rien arrêté, il se rejoue maintenant.
    private func settleAfterStart() {
        guard !wantsRunning else { return }
        stop()
    }

    func capture() async -> UIImage? {
        guard pending == nil, session.isRunning else { return nil }
        return await withCheckedContinuation { continuation in
            pending = continuation
            output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
        }
    }

    private func waitUntilRunning(timeout: TimeInterval) async -> Bool {
        let limit = Date().addingTimeInterval(timeout)
        while !session.isRunning {
            guard wantsRunning, !Task.isCancelled, Date() < limit else { return false }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return true
    }

    fileprivate func finish(with data: Data?) {
        let image = data.flatMap { UIImage(data: $0) }
        pending?.resume(returning: image)
        pending = nil
    }
}

extension GamePhotoCamera: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let original = error == nil ? photo.fileDataRepresentation() : nil
        // Une prise photo ne sort jamais non traitée : le même processeur que le viseur de l'app.
        let data = original.map { photoProcessor.process(encoded: $0, settings: .capture)?.data ?? $0 }
        Task { @MainActor in self.finish(with: data) }
    }
}
