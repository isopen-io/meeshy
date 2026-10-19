import AVFoundation
import os
import CoreGraphics
import MeeshySDK

/// Les réglages de netteté et d'exposition d'un objectif — ce que `CameraModel`
/// demande, jamais ce qu'il possède : le périphérique arrive en paramètre.
nonisolated enum CameraFocusControl {

    /// Mise au point et exposition sur ce point du capteur, une fois.
    /// `false` ⇒ l'objectif ne règle ni la netteté ni l'exposition sur un point.
    static func aim(at devicePoint: CGPoint, smooth: Bool, on device: AVCaptureDevice) -> Bool {
        let plan = ComposerCaptureFocus.focusing(at: devicePoint, focusCapabilities(of: device), smooth: smooth)
        guard ComposerCaptureFocus.aims(plan) else { return false }
        apply(plan, to: device)
        return true
    }

    /// Le retour au continu après un changement de scène ; la netteté glisse pendant une prise.
    static func resumeContinuous(on device: AVCaptureDevice, smooth: Bool) {
        apply(ComposerCaptureFocus.continuous(focusCapabilities(of: device), smooth: smooth), to: device)
    }

    /// La netteté et la lumière continues, sous le verrou de l'appelant — l'ouverture d'un objectif.
    static func openContinuously(_ device: AVCaptureDevice) {
        configure(ComposerCaptureFocus.continuous(focusCapabilities(of: device)), on: device)
    }

    private static func focusCapabilities(of device: AVCaptureDevice) -> ComposerCaptureFocus.Capabilities {
        ComposerCaptureFocus.Capabilities(
            focusPointOfInterest: device.isFocusPointOfInterestSupported,
            autoFocus: device.isFocusModeSupported(.autoFocus),
            continuousAutoFocus: device.isFocusModeSupported(.continuousAutoFocus),
            exposurePointOfInterest: device.isExposurePointOfInterestSupported,
            autoExpose: device.isExposureModeSupported(.autoExpose),
            continuousAutoExposure: device.isExposureModeSupported(.continuousAutoExposure))
    }

    private static func apply(_ plan: ComposerCaptureFocus.Plan, to device: AVCaptureDevice) {
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            configure(plan, on: device)
        } catch {
            Logger.media.error("Focus configuration failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Le POINT se pose AVANT le mode : c'est le changement de mode qui lance
    /// la mesure — l'inverse viserait l'ancien point. Sous le verrou de l'appelant.
    private static func configure(_ plan: ComposerCaptureFocus.Plan, on device: AVCaptureDevice) {
        switch plan.focus {
        case .continuous?:
            if device.isFocusPointOfInterestSupported { device.focusPointOfInterest = ComposerCaptureFocus.center }
            device.focusMode = .continuousAutoFocus
        case .once(let point)?:
            device.focusPointOfInterest = point
            device.focusMode = .autoFocus
        case nil:
            break
        }
        switch plan.exposure {
        case .continuous?:
            if device.isExposurePointOfInterestSupported { device.exposurePointOfInterest = ComposerCaptureFocus.center }
            device.exposureMode = .continuousAutoExposure
        case .once(let point)?:
            device.exposurePointOfInterest = point
            device.exposureMode = .autoExpose
        case nil:
            break
        }
        device.isSubjectAreaChangeMonitoringEnabled = plan.watchesSubjectArea
        if device.isSmoothAutoFocusSupported { device.isSmoothAutoFocusEnabled = plan.smoothFocus }
    }
}
