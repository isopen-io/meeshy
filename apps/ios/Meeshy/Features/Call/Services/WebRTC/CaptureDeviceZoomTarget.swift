//
//  CaptureDeviceZoomTarget.swift
//  Meeshy
//
//  #8441 — l'`AVCaptureDevice` vu par le zoom. Toutes les écritures passent
//  par `CameraZoomQueue` (file série), jamais par le thread principal.
//
//  `RTCCameraVideoCapturer.captureDevices()` ne découvre que les caméras
//  grand-angle ; mais `startCapture(with:format:fps:)` accepte n'importe quel
//  `AVCaptureDevice` (il en fait un `AVCaptureDeviceInput`) et
//  `supportedFormats(for:)` rend `device.formats`. L'appareil VIRTUEL arrière
//  (triple / double) se branche donc tel quel : `videoZoomFactor` y bascule
//  seul d'un objectif à l'autre (optique), puis passe au numérique.
//

import AVFoundation
import os

nonisolated final class CaptureDeviceZoomTarget: ZoomableCaptureDevice, @unchecked Sendable {
    private let device: AVCaptureDevice

    init(_ device: AVCaptureDevice) {
        self.device = device
    }

    var zoomDescriptor: CameraZoomDescriptor {
        CameraZoomDescriptor(
            isFront: device.position == .front,
            lenses: Self.lenses(of: device.deviceType),
            minAvailable: device.minAvailableVideoZoomFactor,
            maxAvailable: device.maxAvailableVideoZoomFactor,
            switchOvers: device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat($0.doubleValue) },
            isLocked: device.isCenterStageActive
        )
    }

    func applyZoom(deviceFactor: CGFloat, rampRate: Float?) {
        // Center Stage pilote le cadrage : y écrire `videoZoomFactor` lèverait.
        guard !device.isCenterStageActive else { return }
        do {
            try device.lockForConfiguration()
        } catch {
            Logger.webrtc.warning("[WEBRTC] zoom: lockForConfiguration failed: \(error.localizedDescription, privacy: .public)")
            return
        }
        defer { device.unlockForConfiguration() }
        // Bornes relues SOUS le verrou : hors plage, AVFoundation lève une
        // exception Objective-C qu'aucun `catch` Swift n'attrape.
        let factor = min(max(deviceFactor, device.minAvailableVideoZoomFactor), device.maxAvailableVideoZoomFactor)
        guard let rampRate else {
            device.cancelVideoZoomRamp()
            device.videoZoomFactor = factor
            return
        }
        device.ramp(toVideoZoomFactor: factor, withRate: rampRate)
    }

    static func lenses(of type: AVCaptureDevice.DeviceType) -> CameraLensKit {
        switch type {
        case .builtInTripleCamera: return .triple
        case .builtInDualWideCamera: return .ultraWideWide
        case .builtInDualCamera: return .wideTele
        default: return .single
        }
    }

    static func deviceType(for lenses: CameraLensKit) -> AVCaptureDevice.DeviceType {
        switch lenses {
        case .triple: return .builtInTripleCamera
        case .ultraWideWide: return .builtInDualWideCamera
        case .wideTele: return .builtInDualCamera
        case .single: return .builtInWideAngleCamera
        }
    }

    /// Caméra arrière la plus riche de l'appareil, dans l'ordre de
    /// `CameraZoomPolicy.backLensPreference`. `nil` : aucune caméra arrière.
    static func richestBackCamera() -> AVCaptureDevice? {
        let types = CameraZoomPolicy.backLensPreference.map(deviceType(for:))
        let devices = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video, position: .back).devices
        return types.lazy.compactMap { type in devices.first { $0.deviceType == type } }.first
    }
}
