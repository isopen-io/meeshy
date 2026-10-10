import Foundation
import AVFoundation
@preconcurrency import CallKit
import Combine
import Network
import UIKit
import MeeshySDK
import MeeshyUI
@preconcurrency import WebRTC
import os

/// La session audio d'un appel : configuration `.playAndRecord`/`.voiceChat`,
/// mode vidéo/voix, route haut-parleur, capteur de proximité et désactivation.

extension CallManager {

    // MARK: - Audio Session
    //
    // CallKit controls audio activation via `provider:didActivate:` and
    // `provider:didDeactivate:`. We MUST NOT call `setActive(true)` ourselves
    // — doing so causes priority inversion and silent audio. Our job is to
    // pre-configure the RTCAudioSessionConfiguration so when CallKit fires
    // didActivate, WebRTC's audio engine starts immediately with the right
    // category/mode. RTCAudioSession.isAudioEnabled is only flipped from
    // didActivate/didDeactivate.

    func configureAudioSession() {
        Logger.calls.info("[AUDIO_SESS] configure begin")
        let videoUIActive = isVideoUIActive
        let configuration = RTCAudioSessionConfiguration.webRTC()
        configuration.category = AVAudioSession.Category.playAndRecord.rawValue
        // CALL-FIX 2026-06-06 (macOS) — on iOS-app-on-Mac the voice-processing I/O unit
        // (engaged by `.voiceChat`/`.videoChat`) faults on the mic uplink ("failed to
        // write uplink microphone input signal (state fault)") → the Mac mic captures
        // silence and the peer hears nothing. `.default` bypasses the voice processor;
        // WebRTC's own software AEC/NS still runs. C7 — le prédicat est
        // `isVideoUIActive` (caméra locale OU flux distant), pas `isVideoEnabled` :
        // le PiP système exige `.videoChat`, y compris sur escalade unilatérale.
        configuration.mode = CallAudioSessionPolicy.mode(
            videoUIActive: videoUIActive,
            isiOSAppOnMac: ProcessInfo.processInfo.isiOSAppOnMac
        ).rawValue
        // PERF-010: use HFP only (not A2DP) — A2DP is output-only and
        // conflicts with the bidirectional voice path (forces the OS to flap
        // between Bluetooth profiles, causing periodic ~200ms audio glitches). HFP
        // already covers BT headsets via the SCO bidirectional voice link.
        // .preferNoInterruptionsFromSystemAlerts = 0x100 (iOS 14.5+) is API_UNAVAILABLE(macos);
        // the macOS AVAudioSession shim for "Designed for iPad" builds omits it entirely.
        // Use raw value to avoid SDK symbol resolution by the compiler; skip on Mac.
        var categoryOptions: AVAudioSession.CategoryOptions = [.allowBluetoothHFP, .duckOthers]
        if !ProcessInfo.processInfo.isiOSAppOnMac {
            categoryOptions.insert(AVAudioSession.CategoryOptions(rawValue: 0x100))
        }
        configuration.categoryOptions = categoryOptions
        let activation = CallAudioSessionPolicy.activation(usesCallKit: callUsesCallKit)

        audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = true
            let session = RTCAudioSession.sharedInstance()
            Logger.calls.info("[AUDIO_SESS] lockForConfiguration")
            session.lockForConfiguration()
            defer {
                Logger.calls.info("[AUDIO_SESS] unlockForConfiguration")
                session.unlockForConfiguration()
            }
            do {
                Logger.calls.info("[AUDIO_SESS] setConfiguration call")
                // #8269 — with CallKit, `provider:didActivate` owns activation and
                // on an OUTGOING call it has already fired by now: the old
                // `active: false` was `setActive(false)` on that session, which
                // stopped the audio unit (no audio either way, video still
                // flowing — incident 2026-09-27). Apply the configuration only.
                // Without CallKit (Mac, foreground in-app call) WE own activation:
                // activate now, or this would deactivate the session the
                // ring-sound manager just brought up.
                if let activeNow = activation {
                    try session.setConfiguration(configuration, active: activeNow)
                } else {
                    try session.setConfiguration(configuration)
                }
                // Prevent Siri, low-battery, and other system alerts from ducking
                // or interrupting the call (iOS 14.5+). This is an AVAudioSession
                // *instance* preference, NOT a CategoryOptions flag — best-effort
                // (it throws on iOS-app-on-Mac, where it is unsupported).
                applyBestEffortAudioSetting("prefersNoInterruptionsFromSystemAlerts") {
                    try session.session.setPrefersNoInterruptionsFromSystemAlerts(true)
                }
                // Align AVFoundation's I/O with Opus's native codec parameters.
                // 48 kHz avoids a sample-rate conversion stage inside the driver;
                // 20 ms buffer matches Opus's default frame duration and reduces
                // packetization jitter. Both are best-effort hints — the OS may
                // silently ignore them when the hardware doesn't support the value.
                applyBestEffortAudioSetting("preferredSampleRate") {
                    try session.session.setPreferredSampleRate(48_000)
                }
                applyBestEffortAudioSetting("preferredIOBufferDuration") {
                    try session.session.setPreferredIOBufferDuration(0.02)
                }
                // #8735 — sans ce choix, iOS tait tout retour haptique pendant
                // que l'appel enregistre le micro : chaque bouton restait muet.
                applyBestEffortAudioSetting("allowHapticsAndSystemSoundsDuringRecording") {
                    try session.session.setAllowHapticsAndSystemSoundsDuringRecording(true)
                }
                Logger.calls.info("RTCAudioSession pre-configured — videoUI: \(videoUIActive), activation=\(activation.map(String.init) ?? "callkit")")
            } catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == 4099 {
                // "Session deactivation failed" — le call précédent a laissé
                // AVAudioSession dans un état non-deactivable depuis ce process
                // (CallKit gère la deactivation via provider:didDeactivate:).
                // Bénin : RTCAudioSession.useManualAudio est déjà setté, et
                // CallKit pilote l'activation via didActivate. Downgrade en
                // warning pour ne pas polluer les crash dashboards.
                Logger.calls.warning("RTCAudioSession setConfiguration deactivation skipped — CallKit owns the session lifecycle (\(error.localizedDescription))")
            } catch {
                Logger.calls.error("RTCAudioSession configuration failed: \(error.localizedDescription)")
            }
        }
    }

    /// Re-applies just the AVAudioSession `.mode` (`.videoChat` vs `.voiceChat`)
    /// to match the CURRENT `isVideoEnabled`, without touching category,
    /// options, or activation. `configureAudioSession()` only ever runs once
    /// at call setup — a mid-call A/V switch (manual `toggleVideo()`, or the
    /// thermal-critical forced video downgrade) flips the WebRTC transceiver
    /// and the local track but never re-applies this, leaving the session
    /// tuned for the WRONG acoustic path (`.videoChat` expects loudspeaker +
    /// camera framing; `.voiceChat` is tuned for near-field/earpiece AEC) for
    /// the rest of the call. Calling the full `configureAudioSession()`
    /// instead would risk a mid-call activation glitch (it decides
    /// `active:` from `callUsesCallKit`); this only ever changes `.mode`.
    func updateAudioSessionModeForCurrentVideoState() {
        guard !ProcessInfo.processInfo.isiOSAppOnMac else { return }
        // C7 — `isVideoUIActive`, pas `isVideoEnabled`. Un correspondant qui
        // allume seul sa caméra fait basculer l'UI en layout vidéo et rend le
        // PiP éligible ; la session doit suivre, sinon elle reste en
        // `.voiceChat` et `AVPictureInPictureVideoCallViewController` peut
        // refuser de démarrer. Appelé aussi depuis les deux écritures d'état
        // vidéo distant (track reçu, `call:media-toggled`).
        let videoUIActive = isVideoUIActive
        let mode = CallAudioSessionPolicy.mode(videoUIActive: videoUIActive, isiOSAppOnMac: false)
        // #8978 — sur la file audio, sans que l'interface attende : basculer la
        // caméra figeait l'écran d'appel le temps de reconfigurer la session.
        audioSessionQueue.async {
            let session = RTCAudioSession.sharedInstance()
            session.lockForConfiguration()
            defer { session.unlockForConfiguration() }
            // `call:media-toggled` peut arriver plusieurs fois pour la même
            // valeur ; `setMode` réinitialise les options implicites de la
            // catégorie (dont le routage par défaut de `.videoChat`), donc on
            // n'y touche que si le mode change réellement.
            guard session.session.mode != mode else { return }
            do {
                try session.session.setMode(mode)
                Logger.calls.info("[AUDIO_SESS] mode updated to \(mode.rawValue) for videoUI=\(videoUIActive)")
            } catch {
                Logger.calls.error("[AUDIO_SESS] mode update failed: \(error.localizedDescription)")
            }
        }
    }

    /// Returns whether the route override actually applied — the route-change
    /// handlers revert `isSpeaker` on failure. `toggleSpeaker()` takes the same
    /// route OFF the main thread (`applySpeakerRouteOffMain`, CallManager+Speaker).
    /// The early-return below (call not active yet) is
    /// reported as success: there is nothing to revert, the route simply
    /// hasn't been applied yet (it will be, once the call becomes active and
    /// this is invoked again from the audio-session lifecycle call sites).
    @discardableResult
    func applySpeakerRoute() -> Bool {
        guard callState.isActive else { return true }
        let speaker = isSpeaker
        let port = CallSpeakerRoute.port(isSpeaker: speaker)
        var succeeded = true
        audioSessionQueue.sync {
            if !CallSpeakerRoute.override(port, isSpeaker: speaker) { succeeded = false }
        }
        return succeeded
    }

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

    /// §RC-2 stuck-muted fallback. On iPhone/iPad the audio session is activated
    /// exclusively by CallKit's `provider:didActivate:` — self-activating BEFORE
    /// it fires breaks the audio device module ("no sound on 1st call"), so
    /// `transitionToConnected` is log-only there. But if CallKit never delivers
    /// `didActivate` (rare; observed after provider glitches), the call sits
    /// connected with dead mic + speaker and NO safety net — the half-open
    /// detector can't catch it (comfort-noise/DTX keeps RTP counters non-zero).
    /// After a short delay we re-check; if — and only if — the session is still
    /// stuck (didActivate never fired, audio disabled, call still active) we
    /// bridge the session exactly like the interruption-end path does. At that
    /// point audio is already broken, so the fallback can only improve things.
    /// NOTE: exercised in simulator only so far — needs a real-device pass
    /// (CallKit timing differs on hardware).
    func scheduleStuckMutedFallback() {
        let armedForCallId = currentCallId
        audioActivationFallbackTask?.cancel()
        audioActivationFallbackTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.stuckMutedFallbackDelaySeconds))
            guard !Task.isCancelled, let self else { return }
            // Défensif : si l'appel qui a armé ce fallback s'est terminé et qu'un
            // autre a démarré entre-temps, ce timer ne parle plus pour personne —
            // sans ce guard il forcerait l'activation audio du NOUVEL appel avant
            // que CallKit n'ait eu la chance de le faire lui-même (cf. commentaire
            // ci-dessus sur le risque de casser l'audio device module).
            guard self.currentCallId == armedForCallId else { return }
            guard CallReliabilityPolicy.shouldForceAudioSessionActivation(
                usesCallKit: self.callUsesCallKit,
                didActivateFired: CallManager.callKitDidActivateFired,
                isAudioEnabled: RTCAudioSession.sharedInstance().isAudioEnabled,
                callIsActive: self.callState.isActive
            ) else { return }
            Logger.calls.fault("[AUDIO_FALLBACK] CallKit didActivate never fired \(Int(QualityThresholds.stuckMutedFallbackDelaySeconds))s after connect — forcing RTCAudioSession activation")
            self.audioSessionQueue.async {
                // Mirror of the interruption-end recovery: activate the system
                // session first, then bridge it to libwebrtc. Re-check the
                // flag INSIDE the queue — the outer checks above (armedForCallId,
                // shouldForceAudioSessionActivation) were read before this
                // deferred dispatch, and a hangup can race it from CallKit's
                // own private delegate queue.
                guard CallManager.isAudioSessionExpectedActive else {
                    Logger.calls.info("Skipping stuck-muted fallback reactivation — audio session already torn down")
                    return
                }
                do {
                    try AVAudioSession.sharedInstance().setActive(true, options: [])
                } catch {
                    Logger.calls.error("[AUDIO_FALLBACK] AVAudioSession activation failed: \(error.localizedDescription)")
                    return
                }
                let rtc = RTCAudioSession.sharedInstance()
                rtc.lockForConfiguration()
                rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
                rtc.isAudioEnabled = true
                rtc.unlockForConfiguration()
            }
        }
    }

    func deactivateAudioSession() {
        // CallKit deactivates the AVAudioSession on its own when the call ends.
        // We only flip RTCAudioSession.isAudioEnabled; setActive(false) is the
        // job of provider:didDeactivate:.
        audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = false
            let session = RTCAudioSession.sharedInstance()
            session.lockForConfiguration()
            session.isAudioEnabled = false
            session.unlockForConfiguration()
        }
        // Sans CallKit (appel entrant app au premier plan, iOS-app-on-Mac),
        // `provider:didDeactivate:` ne viendra JAMAIS : la session
        // `.playAndRecord` + `.duckOthers` auto-activée restait active après
        // raccrochage — l'audio des autres apps restait ducké jusqu'à une
        // reconfiguration fortuite. Désactivation explicite symétrique.
        if !callUsesCallKit {
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                Logger.calls.error("[no-callkit] AVAudioSession deactivation failed: \(error.localizedDescription)")
            }
        }
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
