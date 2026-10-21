import AVFoundation
import os
import QuartzCore
import MeeshySDK
import MeeshyUI

/// **L'objectif et son entrée vidéo** : choisir l'appareil, bâtir son entrée,
/// l'installer dans la session (sur la file de la session), l'orienter et
/// l'ouvrir. Aucun état : la session, les sorties et le stock d'entrées
/// préparées arrivent en paramètres, `CameraModel` publie ensuite le résultat.
nonisolated enum CameraInputInstaller {

    /// L'objectif que la file vient d'installer, et ce que le fil principal en publie.
    nonisolated struct InstalledCamera: @unchecked Sendable {
        let device: AVCaptureDevice
        let position: AVCaptureDevice.Position
        let zoomScale: ComposerCaptureZoomScale
        /// L'instant où la reconfiguration a été validée (#9778).
        let committedAt: CFTimeInterval
    }

    /// **La nouvelle entrée naît AVANT que l'ancienne parte** (#9464) : un
    /// objectif qui ne s'ouvre pas, ou que la session refuse, laisse l'ancien
    /// en place — l'aperçu ne noircit pas et `currentPosition` reste vrai.
    /// **UNE reconfiguration** (#9778) : les connexions s'orientent et l'objectif
    /// s'ouvre DANS la transaction de la bascule ; après sa validation, seul le
    /// zoom se ré-affirme, et seulement si elle l'a remis à zéro.
    /// Sur la file de la session ; `nil` ⇒ rien n'a changé.
    static func installVideoInput(
        in session: AVCaptureSession, position: AVCaptureDevice.Position,
        outputs: [(AVCaptureOutput, ComposerCaptureMirrorRule.Output)],
        prepared: ComposerCameraPreparedInputs<AVCaptureDeviceInput>,
        previewWanted: Bool
    ) -> InstalledCamera? {
        let ancienne = session.inputs.compactMap { $0 as? AVCaptureDeviceInput }.first { $0.device.hasMediaType(.video) }
        let nouvelle = prepared.take(position) ?? videoInput(position: position)
        let echelle = nouvelle.map { zoomScale(of: $0.device) }
        let resultat = ComposerCameraInputSwap.swap(in: session, replacing: ancienne, with: nouvelle) { issue in
            if let objectif = ComposerCameraInputSwap.orientedPosition(after: issue, new: position,
                                                                       old: ancienne?.device.position) {
                orient(outputs, for: objectif)
            }
            ComposerPreviewMirroring.align(session.connections, wanted: previewWanted)
            guard issue == .swapped, let device = nouvelle?.device, let echelle else { return }
            openLens(device, opening: echelle.opening)
        }
        let validee = CACurrentMediaTime()
        prepared.keep(after: resultat, removed: ancienne, at: ancienne?.device.position)
        guard resultat == .swapped, let device = nouvelle?.device, let echelle else { return nil }
        let ouverture = openingZoom(of: device, echelle.opening)
        if ComposerCameraSwitchRule.needsZoomReassert(current: device.videoZoomFactor, target: ouverture) {
            reassertZoom(ouverture, on: device)
        }
        return InstalledCamera(device: device, position: position, zoomScale: echelle, committedAt: validee)
    }

    /// L'objectif s'ouvre en UN verrou : ×1 affiché, une lumière neutre — celle
    /// réglée sur l'autre objectif ne le suit pas —, la netteté continue.
    private static func openLens(_ device: AVCaptureDevice, opening: CGFloat) {
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            device.videoZoomFactor = openingZoom(of: device, opening)
            device.setExposureTargetBias(0, completionHandler: nil)
            CameraFocusControl.openContinuously(device)
        } catch {
            Logger.media.error("Lens opening failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private static func openingZoom(of device: AVCaptureDevice, _ opening: CGFloat) -> CGFloat {
        min(device.maxAvailableVideoZoomFactor, max(device.minAvailableVideoZoomFactor, opening))
    }

    private static func reassertZoom(_ factor: CGFloat, on device: AVCaptureDevice) {
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = factor
            device.unlockForConfiguration()
        } catch {
            Logger.media.error("Zoom opening failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// **Debout, et en miroir à l'avant** (#9464) — à chaque entrée : une
    /// connexion neuve reprend les réglages du système.
    private static func orient(_ outputs: [(AVCaptureOutput, ComposerCaptureMirrorRule.Output)],
                                           for position: AVCaptureDevice.Position) {
        for (output, sorte) in outputs {
            guard let connection = output.connection(with: .video) else { continue }
            if ComposerCaptureMirrorRule.rotatesToPortrait(sorte) { standUp(connection) }
            guard connection.isVideoMirroringSupported else { continue }
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = ComposerCaptureMirrorRule.mirrors(sorte, position: position)
        }
    }

    private static func standUp(_ connection: AVCaptureConnection) {
        if #available(iOS 17.0, *) {
            guard connection.isVideoRotationAngleSupported(ComposerCaptureMirrorRule.portraitAngle) else { return }
            connection.videoRotationAngle = ComposerCaptureMirrorRule.portraitAngle
        } else if connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
    }

    /// **La caméra virtuelle d'abord** (#9350) : triple, double grand-angle,
    /// double, puis l'objectif seul — le premier que l'appareil a.
    private static func videoDevice(position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        let types = ComposerCaptureZoomScale.preferredDeviceTypes
        let trouves = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video,
                                                       position: position).devices
        return types.lazy.compactMap { type in trouves.first { $0.deviceType == type } }.first
    }

    static func videoInput(position: AVCaptureDevice.Position) -> AVCaptureDeviceInput? {
        guard let device = videoDevice(position: position) else { return nil }
        do {
            return try AVCaptureDeviceInput(device: device)
        } catch {
            Logger.media.error("Failed to create video capture input: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private static func zoomScale(of device: AVCaptureDevice) -> ComposerCaptureZoomScale {
        ComposerCaptureZoomScale(base: ComposerCaptureZoomScale.base(
            switchOvers: device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) },
            hasUltraWide: device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }))
    }
}
