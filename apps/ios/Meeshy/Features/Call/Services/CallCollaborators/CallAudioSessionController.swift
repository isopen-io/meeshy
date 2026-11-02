import AVFoundation
import Foundation
import UIKit
import MeeshySDK
@preconcurrency import WebRTC
import os

/// La session audio d'un appel : configuration `.playAndRecord`/`.voiceChat`,
/// mode vidéo/voix, route haut-parleur, filet « micro muet » et désactivation.
/// Le collaborateur possède la file sérielle de la session — créée tout de suite,
/// jamais paresseusement : le proxy CallKit la lit depuis sa propre file privée —
/// et tient l'appel faiblement (#11522). Les verrous statiques de `CallManager`
/// (`isCallActiveFlag`, `callKitDidActivateFired`, `isAudioSessionExpectedActive`)
/// restent sur l'appel, lisibles depuis n'importe quel fil.
@MainActor
final class CallAudioSessionController: CallAudioSessionControllerProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    let audioSessionQueue = DispatchQueue(label: "me.meeshy.callmanager.audiosession")
    /// One-shot stuck-muted fallback (§RC-2): armed when `.connected` is
    /// reached on iPhone/iPad before CallKit delivered `provider:didActivate:`.
    private var audioActivationFallbackTask: Task<Void, Never>?
    /// L'app a activé la session elle-même pendant cet appel (sonnerie in-app,
    /// filet « micro muet ») : elle devra la rendre, CallKit ou pas.
    private(set) var audioSessionSelfActivated = false

    var isStuckMutedFallbackArmed: Bool { audioActivationFallbackTask != nil }

    func attach(to call: CallManager) {
        self.call = call
    }

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
        guard let call else { return }
        Logger.calls.info("[AUDIO_SESS] configure begin")
        let videoUIActive = call.isVideoUIActive
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
        configuration.categoryOptions = CallAudioSessionTuning.categoryOptions(
            isiOSAppOnMac: ProcessInfo.processInfo.isiOSAppOnMac
        )
        let activation = CallAudioSessionPolicy.activation(usesCallKit: call.callUsesCallKit)
        if activation == true { audioSessionSelfActivated = true }

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
                CallAudioSessionTuning.applyCallPreferences(to: session.session)
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
        guard let call, !ProcessInfo.processInfo.isiOSAppOnMac else { return }
        // C7 — `isVideoUIActive`, pas `isVideoEnabled`. Un correspondant qui
        // allume seul sa caméra fait basculer l'UI en layout vidéo et rend le
        // PiP éligible ; la session doit suivre, sinon elle reste en
        // `.voiceChat` et `AVPictureInPictureVideoCallViewController` peut
        // refuser de démarrer. Appelé aussi depuis les deux écritures d'état
        // vidéo distant (track reçu, `call:media-toggled`).
        let videoUIActive = call.isVideoUIActive
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
        guard let call, call.callState.isActive else { return true }
        let speaker = call.isSpeaker
        let port = CallSpeakerRoute.port(isSpeaker: speaker)
        var succeeded = true
        audioSessionQueue.sync {
            if !CallSpeakerRoute.override(port, isSpeaker: speaker) { succeeded = false }
        }
        return succeeded
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
        let armedForCallId = call?.currentCallId
        audioActivationFallbackTask?.cancel()
        audioActivationFallbackTask = Task { @MainActor [weak self] in
            guard await cancellableSleep(for: .seconds(QualityThresholds.stuckMutedFallbackDelaySeconds)), !Task.isCancelled, let self, let call = self.call else { return }
            // Défensif : si l'appel qui a armé ce fallback s'est terminé et qu'un
            // autre a démarré entre-temps, ce timer ne parle plus pour personne —
            // sans ce guard il forcerait l'activation audio du NOUVEL appel avant
            // que CallKit n'ait eu la chance de le faire lui-même (cf. commentaire
            // ci-dessus sur le risque de casser l'audio device module).
            guard call.currentCallId == armedForCallId else { return }
            guard CallReliabilityPolicy.shouldForceAudioSessionActivation(
                usesCallKit: call.callUsesCallKit,
                didActivateFired: CallManager.callKitDidActivateFired,
                isAudioEnabled: RTCAudioSession.sharedInstance().isAudioEnabled,
                callIsActive: call.callState.isActive
            ) else { return }
            self.audioSessionSelfActivated = true
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

    func cancelStuckMutedFallback() {
        audioActivationFallbackTask?.cancel()
        audioActivationFallbackTask = nil
    }

    /// Avec CallKit, `provider:didDeactivate:` désactive la session ; sans lui
    /// (app au premier plan, Mac), on la libère nous-mêmes. D2 (#11468) : sur la
    /// file audio, jamais le fil principal (« AVAudioSession Hang Risk ») ; file
    /// sérielle, donc la configuration d'un appel suivant passe après.
    func deactivateAudioSession() {
        CallManager.isAudioSessionExpectedActive = false
        let releaseSession = CallAudioSessionPolicy.shouldDeactivateOnEnd(
            usesCallKit: call?.callUsesCallKit ?? true, sessionSelfActivated: audioSessionSelfActivated)
        audioSessionSelfActivated = false
        audioSessionQueue.async {
            let session = RTCAudioSession.sharedInstance()
            session.lockForConfiguration()
            session.isAudioEnabled = false
            session.unlockForConfiguration()
            guard releaseSession else { return }
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                Logger.calls.error("[no-callkit] AVAudioSession deactivation failed: \(error.localizedDescription)")
            }
        }
    }

    func activateAudioOnConnect() {
        // §2.3/§6.4 — audio activation is gated on the PLATFORM, not on the
        // fragile `!rtc.isAudioEnabled` heuristic.
        //   - iPhone/iPad (`callUsesCallKit == true`): CallKit owns activation via
        //     `provider:didActivate:`. We must NEVER self-activate here — calling
        //     `setActive(true)` before `didActivate` makes iOS fail the audio
        //     device module silently ("no sound on 1st call"). Log only.
        //   - Mac (`callUsesCallKit == false`, iOS-app-on-Mac): `didActivate`
        //     never fires, so this `[AUDIO_FALLBACK]` IS the activation path.
        guard let call else { return }
        if !call.callUsesCallKit {
            activateAudioSessionWithoutCallKit()
        } else if !RTCAudioSession.sharedInstance().isAudioEnabled {
            Logger.calls.warning("[AUDIO] connected but RTCAudioSession not yet active — awaiting CallKit provider:didActivate (do NOT self-activate on iPhone/iPad)")
            // §RC-2 — if `didActivate` never arrives, the call would stay
            // connected-but-muted forever. Arm the one-shot fallback; it
            // re-checks the full stuck condition after a short delay and
            // no-ops when CallKit did its job in the meantime.
            scheduleStuckMutedFallback()
        }
    }

    /// Mac (`callUsesCallKit == false`, iOS-app-on-Mac): `didActivate` never
    /// fires, so this `[AUDIO_FALLBACK]` IS the activation path.
    func activateAudioSessionWithoutCallKit() {
        Logger.calls.warning("[AUDIO_FALLBACK] Mac (no CallKit didActivate) — activation manuelle de RTCAudioSession")
        audioSessionQueue.sync {
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            do {
                let configuration = RTCAudioSessionConfiguration.webRTC()
                configuration.category = AVAudioSession.Category.playAndRecord.rawValue
                // CALL-FIX 2026-06-06 (macOS) — `.default` avoids the voice-processing
                // I/O unit that faults on the mic uplink on iOS-app-on-Mac.
                configuration.mode = AVAudioSession.Mode.default.rawValue
                configuration.categoryOptions = [.allowBluetoothHFP, .duckOthers]
                try rtc.setConfiguration(configuration, active: true)
                rtc.isAudioEnabled = true
                Logger.calls.info("[AUDIO_FALLBACK] RTCAudioSession activée manuellement (mode=\(configuration.mode), category=\(configuration.category))")
            } catch {
                Logger.calls.error("[AUDIO_FALLBACK] échec activation manuelle: \(error.localizedDescription)")
            }
            rtc.unlockForConfiguration()
        }
    }

    /// Applique la route du haut-parleur SANS bloquer le fil principal, puis
    /// rend son issue sur le fil principal. Appel inactif : rien à appliquer,
    /// rien à annuler — l'issue est un succès.
    func applySpeakerRouteOffMain(completion: @escaping @MainActor @Sendable (Bool) -> Void) {
        guard let call, call.callState.isActive else { return completion(true) }
        let speaker = call.isSpeaker
        let port = CallSpeakerRoute.port(isSpeaker: speaker)
        audioSessionQueue.async {
            let applied = CallSpeakerRoute.override(port, isSpeaker: speaker)
            Task { @MainActor in completion(applied) }
        }
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallAudioSessionControllerProviding: AnyObject {
    var audioSessionQueue: DispatchQueue { get }
    var audioSessionSelfActivated: Bool { get }
    var isStuckMutedFallbackArmed: Bool { get }
    func attach(to call: CallManager)
    func configureAudioSession()
    func updateAudioSessionModeForCurrentVideoState()
    @discardableResult
    func applySpeakerRoute() -> Bool
    func applySpeakerRouteOffMain(completion: @escaping @MainActor @Sendable (Bool) -> Void)
    func scheduleStuckMutedFallback()
    func cancelStuckMutedFallback()
    func deactivateAudioSession()
    func activateAudioOnConnect()
    func activateAudioSessionWithoutCallKit()
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
