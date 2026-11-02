import UIKit

/// Le capteur de proximité : actif tant que l'interface d'appel est audio seule.
/// La session audio elle-même vit dans `CallAudioSessionController` (#11522).

extension CallManager {
    func updateProximityMonitoring() {
        // Enable proximity monitoring only while the call UI is audio-only. The
        // sensor dims the screen (and blocks touch) when the phone is pressed to
        // the ear — essential for voice calls, harmful during video (blocks the
        // remote face). iOS handles dimming automatically once monitoring is on.
        //
        // Gated on `isVideoUIActive` (C7), not `isVideoEnabled`: a unilateral
        // video escalation by the REMOTE peer switches this device's UI to the
        // video layout without ever touching local `isVideoEnabled`. Gating on
        // the local-only flag left proximity monitoring armed for the whole
        // remote-video call — the sensor blanks the screen and eats touch input
        // the instant anything (a hand, a case flap) covers the sensor, exactly
        // the failure this function exists to avoid.
        let shouldMonitor = callState.isActive && !isVideoUIActive
        UIDevice.current.isProximityMonitoringEnabled = shouldMonitor
    }
}
