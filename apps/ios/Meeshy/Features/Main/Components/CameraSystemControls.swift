import AVFoundation
import os
import MeeshySDK

/// **Le bouton Camera Control règle le viseur de Meeshy** (OPUS-9, doc 08 § R7).
///
/// Sur iPhone 16 et suivants, le bouton latéral expose les curseurs que la
/// session lui confie. Meeshy lui donne le zoom et l'exposition du système,
/// recréés à chaque objectif installé : un curseur reste attaché à l'appareil
/// qui l'a fait naître. Sans bouton (`supportsControls` faux) ou avant iOS 18,
/// rien n'est ajouté et le viseur ne change pas.
nonisolated enum CameraSystemControlsRule {

    enum Control: Equatable, Sendable {
        case zoom
        case exposure
    }

    static func controls(supportsControls: Bool) -> [Control] {
        supportsControls ? [.zoom, .exposure] : []
    }

    /// Ce que la session admet encore : elle borne le nombre de contrôles.
    static func fitting(_ wanted: [Control], maxControls: Int) -> [Control] {
        Array(wanted.prefix(max(0, maxControls)))
    }
}

/// Pose les contrôles du bouton latéral ; ne fait rien avant iOS 18.
nonisolated enum CameraSystemControlsHost {

    /// **Dans la transaction qui installe `device`**, sur la file de la session.
    /// `onZoom` reçoit le facteur de l'APPAREIL, sur le fil principal.
    static func install(in session: AVCaptureSession, for device: AVCaptureDevice,
                        onZoom: @escaping @Sendable @MainActor (CGFloat) -> Void) {
        guard #available(iOS 18.0, *) else { return }
        CameraSystemControls.install(in: session, for: device, onZoom: onZoom)
    }
}

/// Le délégué des contrôles de session : la session l'exige pour les servir,
/// et le viseur n'a rien à faire quand ils paraissent ou disparaissent.
@available(iOS 18.0, *)
nonisolated final class CameraSystemControls: NSObject, AVCaptureSessionControlsDelegate, @unchecked Sendable {

    static let delegate = CameraSystemControls()
    private static let queue = DispatchQueue(label: "me.meeshy.camera.controls")

    static func install(in session: AVCaptureSession, for device: AVCaptureDevice,
                        onZoom: @escaping @Sendable @MainActor (CGFloat) -> Void) {
        guard session.supportsControls else { return }
        session.controls.forEach { session.removeControl($0) }
        if session.controlsDelegate == nil { session.setControlsDelegate(delegate, queue: queue) }
        let voulus = CameraSystemControlsRule.fitting(
            CameraSystemControlsRule.controls(supportsControls: true), maxControls: session.maxControlsCount)
        for voulu in voulus {
            let controle: AVCaptureControl
            switch voulu {
            case .zoom:
                controle = AVCaptureSystemZoomSlider(device: device) { facteur in
                    Task { @MainActor in onZoom(facteur) }
                }
            case .exposure:
                controle = AVCaptureSystemExposureBiasSlider(device: device)
            }
            guard session.canAddControl(controle) else {
                Logger.media.error("Camera Control refused by the session")
                continue
            }
            session.addControl(controle)
        }
    }

    func sessionControlsDidBecomeActive(_ session: AVCaptureSession) {}
    func sessionControlsWillEnterFullscreenAppearance(_ session: AVCaptureSession) {}
    func sessionControlsWillExitFullscreenAppearance(_ session: AVCaptureSession) {}
    func sessionControlsDidBecomeInactive(_ session: AVCaptureSession) {}
}
