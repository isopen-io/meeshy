import AVFoundation
import Foundation

/// The call's `AVAudioSession` tuning, one site for `configureAudioSession`
/// and CallKit's `provider(_:didActivate:)` (#11522). Every preference is a
/// best-effort hint (`applyBestEffortAudioSetting`): the OS may ignore it, and
/// some throw on iOS-app-on-Mac.
enum CallAudioSessionTuning {

    /// PERF-010: HFP only (not A2DP) — A2DP is output-only and conflicts with
    /// the bidirectional voice path (forces the OS to flap between Bluetooth
    /// profiles, causing periodic ~200ms audio glitches). HFP already covers BT
    /// headsets via the SCO bidirectional voice link.
    /// `.preferNoInterruptionsFromSystemAlerts` = 0x100 (iOS 14.5+) is
    /// API_UNAVAILABLE(macos); the macOS AVAudioSession shim for "Designed for
    /// iPad" builds omits it entirely. Raw value to avoid SDK symbol resolution
    /// by the compiler; skipped on Mac.
    static func categoryOptions(isiOSAppOnMac: Bool) -> AVAudioSession.CategoryOptions {
        var options: AVAudioSession.CategoryOptions = [.allowBluetoothHFP, .duckOthers]
        if !isiOSAppOnMac {
            options.insert(AVAudioSession.CategoryOptions(rawValue: 0x100))
        }
        return options
    }

    /// Applied once the call configuration is set, inside the audio session lock.
    static func applyCallPreferences(to session: AVAudioSession) {
        // Prevent Siri, low-battery, and other system alerts from ducking
        // or interrupting the call (iOS 14.5+). This is an AVAudioSession
        // *instance* preference, NOT a CategoryOptions flag — best-effort
        // (it throws on iOS-app-on-Mac, where it is unsupported).
        applyBestEffortAudioSetting("prefersNoInterruptionsFromSystemAlerts") {
            try session.setPrefersNoInterruptionsFromSystemAlerts(true)
        }
        applyOpusIOHints(to: session)
        // #8735 — sans ce choix, iOS tait tout retour haptique pendant
        // que l'appel enregistre le micro : chaque bouton restait muet.
        applyBestEffortAudioSetting("allowHapticsAndSystemSoundsDuringRecording") {
            try session.setAllowHapticsAndSystemSoundsDuringRecording(true)
        }
    }

    /// Align AVFoundation's I/O with Opus's native codec parameters. 48 kHz
    /// avoids a sample-rate conversion stage inside the driver; 20 ms buffer
    /// matches Opus's default frame duration and reduces packetization jitter.
    /// Re-applied at CallKit's `didActivate`, whose own activation may reset
    /// hardware-level parameters.
    static func applyOpusIOHints(to session: AVAudioSession) {
        applyBestEffortAudioSetting("preferredSampleRate") {
            try session.setPreferredSampleRate(48_000)
        }
        applyBestEffortAudioSetting("preferredIOBufferDuration") {
            try session.setPreferredIOBufferDuration(0.02)
        }
    }
}
