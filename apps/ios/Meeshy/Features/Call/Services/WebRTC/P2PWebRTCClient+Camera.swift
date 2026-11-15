import AVFoundation
import Foundation

#if canImport(WebRTC)
@preconcurrency import WebRTC

// Choix de l'appareil de capture et branchement du zoom (#8441). Hors de
// `P2PWebRTCClient.swift`, déjà hors budget de taille : ce fichier y a pris
// `pickCaptureDevice` et `facing(for:)` pour que le zoom n'y ajoute rien.

extension P2PWebRTCClient {
    /// Selects a capture device for a desired logical position. On iPhone/iPad the
    /// front/back cameras report `.front`/`.back`. On **iOS-app-on-Mac** the
    /// built-in / Continuity / USB cameras report `.unspecified`, so a strict
    /// `.front` filter finds nothing and the call silently degrades to audio
    /// (P0-1). Fallback chain: exact position → `.unspecified` (Mac) → opposite
    /// camera → first available. #8441 — a back camera is upgraded to the
    /// richest virtual device (`zoomCapable`).
    static func pickCaptureDevice(preferring position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        let cams = RTCCameraVideoCapturer.captureDevices()
        if let exact = cams.first(where: { $0.position == position }) { return zoomCapable(exact) }
        if let unspecified = cams.first(where: { $0.position == .unspecified }) { return unspecified }
        let opposite: AVCaptureDevice.Position = position == .front ? .back : .front
        return (cams.first(where: { $0.position == opposite }) ?? cams.first).map(zoomCapable)
    }

    /// #8441 — la caméra arrière passe par l'appareil virtuel (triple, double
    /// grand-angle, double) : `videoZoomFactor` y bascule seul sur les
    /// objectifs. Toute autre caméra (avant, externe, Mac) reste telle quelle
    /// et zoome numériquement.
    static func zoomCapable(_ device: AVCaptureDevice) -> AVCaptureDevice {
        guard device.position == .back, !ProcessInfo.processInfo.isiOSAppOnMac else { return device }
        return CaptureDeviceZoomTarget.richestBackCamera() ?? device
    }

    /// Après chaque `startCapture` réussi. #8441 — la caméra en service repart
    /// à 1× (le grand-angle, pas l'ultra grand-angle de l'appareil virtuel).
    /// #8696 — elle devient la caméra CONFIRMÉE qui décide du miroir de l'aperçu.
    func attachLiveCamera(_ camera: AVCaptureDevice) async {
        let target = CaptureDeviceZoomTarget(camera)
        let facing = Self.facing(for: camera)
        await MainActor.run {
            CameraZoomController.shared.attach(target)
            CallLiveCamera.shared.confirm(facing)
        }
    }

    /// À la fin de la session : plus aucune caméra ne livre de trames.
    @MainActor
    static func releaseLiveCamera() {
        CameraZoomController.shared.detach()
        CallLiveCamera.shared.reset()
    }

    static func facing(for device: AVCaptureDevice) -> CameraFacing {
        switch device.position {
        case .front: return .front
        case .back: return .back
        default:
            // iOS-on-Mac / iPad: Continuity & USB cameras report `.unspecified`
            // with an external-class device type.
            if #available(iOS 17.0, *), device.deviceType == .external || device.deviceType == .continuityCamera {
                return .external
            }
            return .unspecified
        }
    }
}

#endif
