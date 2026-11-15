import AVFoundation
import os
import MeeshySDK

/// **Ce que l'objectif fait sous la pression du système** (#17469), à la manière d'AVCam :
/// il ralentit à `.serious`, davantage à `.critical`, et à `.shutdown` le système l'arrête
/// lui-même — l'interruption est déjà traitée par `CameraModel+Recovery`.
nonisolated enum CameraSystemPressureLaw {
    /// `nil` : la cadence du format.
    static func frameRate(for level: AVCaptureDevice.SystemPressureState.Level) -> Int? {
        switch level {
        case .serious: return 24
        case .critical, .shutdown: return 15
        default: return nil
        }
    }

    /// La cadence voulue, ramenée dans ce que le format accepte ; `nil` sans plage.
    static func supportedRate(_ voulue: Int, in plages: [ClosedRange<Double>]) -> Int? {
        let cadence = Double(voulue)
        if plages.contains(where: { $0.contains(cadence) }) { return voulue }
        guard let plancher = plages.map(\.lowerBound).filter({ $0 > cadence }).min() else { return nil }
        return Int(plancher.rounded(.up))
    }
}

extension CameraModel {

    /// L'objectif installé est guetté ; le guet précédent tombe avec lui.
    func watchSystemPressure(of device: AVCaptureDevice) {
        pressureObservation = Self.observePressure(of: device)
    }

    /// Hors du fil principal, comme AVCam : le système publie la pression sur sa propre file,
    /// et la cadence s'y pose aussitôt. Une pression déjà présente s'applique tout de suite ;
    /// le retour au nominal rend sa cadence au format.
    nonisolated private static func observePressure(of device: AVCaptureDevice) -> NSKeyValueObservation {
        let initial = device.systemPressureState.level
        if initial != .nominal { applyPressure(initial, to: device) }
        return device.observe(\.systemPressureState, options: [.new]) { appareil, _ in
            let niveau = appareil.systemPressureState.level
            Logger.media.notice("composer capture: system pressure \(niveau.rawValue, privacy: .public)")
            applyPressure(niveau, to: appareil)
        }
    }

    /// La cadence se pose dans la configuration de l'appareil, que le verrou protège.
    nonisolated private static func applyPressure(_ niveau: AVCaptureDevice.SystemPressureState.Level,
                                                  to device: AVCaptureDevice) {
        let plages = device.activeFormat.videoSupportedFrameRateRanges.map { $0.minFrameRate...$0.maxFrameRate }
        let duree = CameraSystemPressureLaw.frameRate(for: niveau)
            .flatMap { CameraSystemPressureLaw.supportedRate($0, in: plages) }
            .map { CMTime(value: 1, timescale: CMTimeScale($0)) } ?? .invalid
        do {
            try device.lockForConfiguration()
            device.activeVideoMinFrameDuration = duree
            device.activeVideoMaxFrameDuration = duree
            device.unlockForConfiguration()
        } catch {
            Logger.media.error("System pressure frame rate failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
