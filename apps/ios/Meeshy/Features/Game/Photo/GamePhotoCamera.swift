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
    /// La file qui configure, lance et arrête la session — l'aperçu s'y
    /// rattache, jamais sur le fil principal (#17041).
    var sessionQueue: ComposerCaptureSessionQueue { get }
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
    /// Configuration, lancement et arrêt, dans l'ordre et hors du fil
    /// principal : valider une configuration attend la file de capture (#17041).
    nonisolated let sessionQueue = ComposerCaptureSessionQueue()
    /// Le traitement UNIQUE de toute prise photo de l'app (#8695) : redressée, bornée, améliorée.
    nonisolated let photoProcessor: any PhotoCaptureProcessorProviding
    /// La sortie photo, née et branchée sur la file de la session : le fil
    /// principal la relit dans la session, il ne la construit pas.
    private var output: AVCapturePhotoOutput? {
        session.outputs.lazy.compactMap { $0 as? AVCapturePhotoOutput }.first
    }
    /// L'horizon de la caméra avant : sans lui, la photo sort dans
    /// l'orientation du capteur — couchée, même l'appareil tenu debout.
    private let horizon = ComposerCaptureHorizon()
    private var configured = false
    /// Ce que le déroulé VEUT : l'attente du démarrage cesse dès qu'il ne la veut plus.
    /// L'ordre démarrage / arrêt, lui, est celui de la file (`setRunning` suit le dernier vœu).
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
            let refus = await sessionQueue.run { [weak self] in
                self.map { Self.configure($0.session) } ?? CameraFailure.unavailable
            }
            if let refus { return refus }
            if let objectif = Self.frontLens() { horizon.follow(objectif) }
            configured = true
        }
        wantsRunning = true
        sessionQueue.setRunning(true, session)
        guard await waitUntilRunning(timeout: 3) else { return .unavailable }
        return nil
    }

    func stop() {
        wantsRunning = false
        sessionQueue.setRunning(false, session)
    }

    private nonisolated static func frontLens() -> AVCaptureDevice? {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
    }

    /// Sur la file de la session : l'objectif avant et la sortie photo, en une
    /// transaction ; `nil` quand la session est prête.
    private nonisolated static func configure(_ session: AVCaptureSession) -> CameraFailure? {
        guard let device = frontLens(), let input = try? AVCaptureDeviceInput(device: device) else {
            return .unsupported
        }
        let output = AVCapturePhotoOutput()
        session.beginConfiguration()
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(output) else {
            session.commitConfiguration()
            return .unavailable
        }
        session.addInput(input)
        session.addOutput(output)
        session.commitConfiguration()
        return nil
    }

    func capture() async -> UIImage? {
        guard pending == nil, session.isRunning, let output else { return nil }
        return await withCheckedContinuation { continuation in
            pending = continuation
            horizon.level(output.connection(with: .video))
            output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
        }
    }

    private func waitUntilRunning(timeout: TimeInterval) async -> Bool {
        let limit = Date().addingTimeInterval(timeout)
        while !session.isRunning {
            guard wantsRunning, !Task.isCancelled, Date() < limit else { return false }
            _ = await cancellableSleep(for: .milliseconds(50))
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
