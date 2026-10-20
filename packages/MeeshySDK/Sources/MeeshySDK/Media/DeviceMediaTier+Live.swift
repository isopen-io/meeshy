import CoreMedia
import Foundation
import os
import UIKit
import VideoToolbox

/// **La sonde de l'appareil vivant (#11281)** — la seule moitié de `DeviceMediaTier`
/// qui touche le système : `utsname`, `ProcessInfo`, `UIScreen`, VideoToolbox. La
/// loi qui range ces signaux est PURE (`DeviceMediaTier.classify`).
extension DeviceMediaTier {

    /// Le tier de CET appareil. Lu une fois, puis gardé : rien de ce qu'il
    /// regarde ne change pendant la vie du processus.
    ///
    /// La cadence de l'écran ne se lit que sur le fil principal. Appelé depuis
    /// un autre fil AVANT la première lecture principale, le tier est calculé
    /// avec 60 Hz et NON gardé — il ne peut alors manquer que `pro`, dont aucune
    /// loi ne diffère de `high` pour l'instant. Aucune attente du fil principal :
    /// c'est ce qui évite l'interblocage.
    public static var current: DeviceMediaTier {
        DeviceMediaProbe.tier()
    }
}

enum DeviceMediaProbe {

    private static let resolved = OSAllocatedUnfairLock<DeviceMediaTier?>(initialState: nil)

    private static let av1CodecType: CMVideoCodecType = 0x6176_3031 // 'av01'

    static func tier() -> DeviceMediaTier {
        if let known = resolved.withLock({ $0 }) { return known }
        guard Thread.isMainThread else {
            return DeviceMediaTier.classify(signals(framesPerSecond: 60))
        }
        let tier = DeviceMediaTier.classify(signals(framesPerSecond: mainScreenFramesPerSecond()))
        resolved.withLock { $0 = tier }
        return tier
    }

    static func signals(framesPerSecond: Int) -> DeviceMediaSignals {
        DeviceMediaSignals(
            machine: DeviceMediaSignals.machine(raw: rawMachine(), environment: ProcessInfo.processInfo.environment),
            physicalMemory: ProcessInfo.processInfo.physicalMemory,
            maximumFramesPerSecond: framesPerSecond,
            hardwareDecodesHEVC: VTIsHardwareDecodeSupported(kCMVideoCodecType_HEVC),
            hardwareDecodesAV1: VTIsHardwareDecodeSupported(av1CodecType)
        )
    }

    private static func rawMachine() -> String {
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { buffer in
            String(decoding: buffer.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
    }

    /// `assumeIsolated` n'existe qu'à partir d'iOS 17 — et aucun appareil `pro`
    /// (AV1 matériel : A17 Pro, M3) ne tourne sous iOS 16 : 60 Hz y est exact
    /// pour la décision que la cadence éclaire.
    private static func mainScreenFramesPerSecond() -> Int {
        guard #available(iOS 17, *) else { return 60 }
        return MainActor.assumeIsolated { UIScreen.main.maximumFramesPerSecond }
    }
}
