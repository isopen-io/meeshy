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

/// Les interruptions audio du système pendant un appel : appel GSM, alarme,
/// Siri, changement de route, réinitialisation des services média.

extension CallManager {

    /// Audit P1-31 — observe `AVAudioSession.interruptionNotification`
    /// throughout the singleton's lifetime. When iOS interrupts a VoIP call
    /// for a system event (cellular GSM call, alarm, Siri), CallKit suspends
    /// the audio session via `provider:didDeactivate:` (which sets
    /// `RTCAudioSession.isAudioEnabled = false`) but iOS does NOT
    /// automatically call `didActivate` on resume — it waits for a user
    /// action. Without an explicit interruption-end observer, the VoIP
    /// audio path stayed silent indefinitely after the interrupting event
    /// ended, even though WebRTC ICE was still connected.
    @MainActor
    func startAudioInterruptionMonitoring() {
        // Swift 6 : Notification n'est pas Sendable, donc on extrait les
        // valeurs primitives (UInt? sont Sendable) AVANT de traverser la
        // frontière Task. Le closure d'observateur exécute déjà sur .main
        // (queue: .main), l'extraction est donc synchrone et sûre.
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let info = notification.userInfo
            let typeRaw = info?[AVAudioSessionInterruptionTypeKey] as? UInt
            let optionsRaw = info?[AVAudioSessionInterruptionOptionKey] as? UInt
            Task { @MainActor [weak self] in
                self?.handleAudioInterruption(typeRaw: typeRaw, optionsRaw: optionsRaw)
            }
        }
    }

    @MainActor
    private func handleAudioInterruption(typeRaw: UInt?, optionsRaw: UInt?) {
        guard callState.isActive else { return }
        guard let typeRaw,
              let type = AVAudioSession.InterruptionType(rawValue: typeRaw) else {
            return
        }
        switch type {
        case .began:
            Logger.calls.info("Audio interruption began (call active)")
        case .ended:
            // `.shouldResume` is an opportunistic hint from iOS, NOT a guarantee.
            // After an alarm / Siri / GSM interruption iOS frequently omits it
            // AND never calls provider:didActivate: on its own — which left the
            // rest of the call silent (mic + output dead) while ICE stayed
            // connected. For a VoIP call we KNOW must continue (callState.isActive
            // was checked above) we reactivate the RTCAudioSession regardless of
            // the hint; deferring to a hint that may never come is the bug.
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw ?? 0)
            if options.contains(.shouldResume) {
                Logger.calls.info("Audio interruption ended (shouldResume) — re-enabling RTCAudioSession")
            } else {
                Logger.calls.info("Audio interruption ended without shouldResume — reactivating anyway (call active)")
            }
            // Use async dispatch to avoid blocking the MainActor while
            // AVAudioSession.setActive (which can take 10–100ms) and
            // RTCAudioSession configuration run. The audio reconfiguration is
            // fire-and-forget: the call stays active; the next ICE heartbeat
            // will surface any persistent failure to the user.
            audioSessionQueue.async {
                // Re-check INSIDE the queue, not just via the `callState.isActive`
                // guard above: a hangup can race this async dispatch from a
                // different thread (MainActor teardown, or CallKit's own
                // `didDeactivate` on its private delegate queue) and land on
                // `audioSessionQueue` either before or after this block. Reading
                // `isAudioSessionExpectedActive` here — rather than trusting the
                // stale outer check — serializes the decision against every other
                // writer that also routes through this queue.
                guard CallManager.isAudioSessionExpectedActive else {
                    Logger.calls.info("Skipping interruption-ended reactivation — audio session already torn down")
                    return
                }
                // Re-activate the system AVAudioSession first — the interruption
                // deactivated it, so RTCAudioSession.audioSessionDidActivate is a
                // no-op until the OS session is active again.
                do {
                    try AVAudioSession.sharedInstance().setActive(true, options: [])
                } catch {
                    Logger.calls.error("AVAudioSession reactivation failed after interruption: \(error.localizedDescription)")
                    return
                }
                let rtc = RTCAudioSession.sharedInstance()
                rtc.lockForConfiguration()
                rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
                rtc.isAudioEnabled = true
                rtc.unlockForConfiguration()
            }
        @unknown default:
            break
        }
    }

    // P0-8 — reconcile `isSpeaker` when iOS changes the audio route (headset
    // plug/unplug, Bluetooth connect/disconnect, AirPlay). Without this, the
    // UI speaker button stays out of sync: the user taps "speaker on", plugs
    // headphones → audio routes to headphones but `isSpeaker` stays true;
    // unplugging then re-routes to the built-in speaker unexpectedly.
    @MainActor
    func startAudioRouteChangeMonitoring() {
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let reasonRaw = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
            Task { @MainActor [weak self] in
                self?.handleAudioRouteChange(reasonRaw: reasonRaw)
            }
        }
    }

    @MainActor
    private func handleAudioRouteChange(reasonRaw: UInt) {
        guard callState.isActive else { return }
        let reason = AVAudioSession.RouteChangeReason(rawValue: reasonRaw) ?? .unknown
        switch reason {
        case .newDeviceAvailable:
            // Headset / Bluetooth connected — clear a stale speaker override.
            // Same discipline as toggleSpeaker() (§7.8): overrideOutputAudioPort
            // can throw (e.g. `insufficientPriority` when the just-connected
            // accessory itself holds route priority), and discarding that failure
            // here left `isSpeaker` at `false` even when the override never
            // actually applied — desyncing the speaker-toggle UI from the real
            // audio route until an unrelated route change or manual toggle
            // happened to reconcile it.
            let previousSpeaker = isSpeaker
            isSpeaker = false
            if !applySpeakerRoute() {
                isSpeaker = previousSpeaker
            }
            Logger.calls.info("Audio route: new device available — isSpeaker = \(self.isSpeaker)")
        case .oldDeviceUnavailable:
            // Headset / Bluetooth disconnected — iOS routes back to built-in;
            // re-apply the current speaker preference so RTCAudioSession follows.
            applySpeakerRoute()
            Logger.calls.info("Audio route: device removed — re-applying speaker route (isSpeaker=\(self.isSpeaker))")
        case .override:
            reconcileSpeakerWithCurrentOutput()
        default:
            if currentOutputKind()?.isExternalOutput == true {
                isSpeaker = false
                break
            }
            applySpeakerRoute()
        }
    }

    func startMediaServicesResetMonitoring() {
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.handleMediaServicesReset()
            }
        }
    }

    @MainActor
    private func handleMediaServicesReset() {
        guard callState.isActive else { return }
        Logger.calls.fault("AVAudioSession media services reset during call — rebuilding audio stack")
        // The media server process crashed and restarted. All session state is
        // gone. Reconstruct: reconfigure RTCAudioSession (category / mode /
        // options), then notify libwebrtc that the session cycled so it
        // restarts its audio I/O unit. Re-apply the speaker route last, once
        // the engine is live again.
        configureAudioSession()
        audioSessionQueue.async { [weak self] in
            // Re-check INSIDE the queue, not just via the `callState.isActive`
            // guard above: a hangup can race this async dispatch from a
            // different thread (MainActor teardown, or CallKit's own
            // `didDeactivate`/`providerDidReset` on its private delegate
            // queue) — mirrors handleAudioInterruption's reactivation guard.
            guard self != nil, CallManager.isAudioSessionExpectedActive else {
                Logger.calls.info("Skipping media-services-reset reactivation — audio session already torn down")
                return
            }
            do {
                try AVAudioSession.sharedInstance().setActive(true, options: [])
            } catch {
                Logger.calls.error("AVAudioSession reactivation after media-services reset failed: \(error.localizedDescription)")
                // Do not proceed: telling RTCAudioSession the session is active when
                // setActive(true) just failed would corrupt the WebRTC audio state.
                // The next ICE heartbeat or user action will surface the failure.
                return
            }
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.audioSessionDidDeactivate(AVAudioSession.sharedInstance())
            rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
            rtc.isAudioEnabled = true
            rtc.unlockForConfiguration()
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.mediaServicesResetSpeakerDelaySeconds))
            self?.applySpeakerRoute()
        }
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
