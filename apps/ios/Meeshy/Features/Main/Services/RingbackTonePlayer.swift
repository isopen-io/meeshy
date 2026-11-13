import Foundation
import AVFoundation
import AudioToolbox
import WebRTC
import os
import MeeshySDK

/// SOTA call-lifecycle sounds, all in one place:
///   • **ringback** — the looping "rrr-rrr" the CALLER hears while waiting for the
///     callee to answer (`RingbackTone.caf`).
///   • **ringtone** — the looping tone the CALLEE hears while a call is incoming
///     (`Ringtone.caf`). On normal iOS CallKit plays this; on iOS-app-on-Mac
///     CallKit is bypassed (no system call UI) so we play it in-app.
///   • **connected** — a short one-shot cue when the call establishes.
///   • **ended** — a short one-shot cue when the call terminates.
///
/// Audio-session ownership: CallKit owns the `AVAudioSession` when present, so on
/// iOS we just hand players to the already-active session. On iOS-app-on-Mac there
/// is NO CallKit to activate the session during the ringing phase, so the loop
/// players would be silent — the loop starter brings the WebRTC
/// session up (playback) so the ringback/ringtone are audible; the call's
/// `[AUDIO_FALLBACK]` re-activation at connect is then a no-op.
///
/// The class name stays `RingbackTonePlayer` to avoid churn at every call site;
/// it is effectively the call sound manager.
@MainActor
final class RingbackTonePlayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private var loop: CallSoundLoop?
    private var activeLoop: String?
    private var loopGeneration = 0
    private let starter: any CallSoundLoopStarting
    private let logger = MeeshyLog.logger(.callSounds)

    init(starter: any CallSoundLoopStarting = BackgroundCallSoundLoopStarter()) {
        self.starter = starter
    }

    /// Set by `CallManager` to `!callUsesCallKit`: true when there is no CallKit to
    /// activate the AVAudioSession during the ringing phase (iOS-app-on-Mac, or a
    /// foreground in-app call), so the loop players must bring the session up
    /// themselves. False on CallKit-driven calls (CallKit owns activation).
    var shouldSelfActivateSession = false

    // MARK: - Ringback (caller)

    func start() { startLoop(resource: "RingbackTone", volume: 0.6) }

    /// Audit fix: must mirror `stopRingtone`'s
    /// `activeLoop` check. Before this fix, `stop()` tore down whichever loop
    /// happened to be playing — if `startRingtone()` had won the race (e.g. an
    /// incoming call while a stale ringback loop reference lingered), a call
    /// site that calls `stop()` alone would silently cut the ringtone instead
    /// of being a no-op. Every current call site pairs `stop()` with
    /// `stopRingtone()`, which masked this; a future call site that calls only
    /// `stop()` would not be so lucky.
    func stop() { if activeLoop == "RingbackTone" { stopLoop() } }

    // MARK: - Ringtone (callee — in-app, Mac only; iOS uses CallKit)

    func startRingtone() { startLoop(resource: "Ringtone", volume: 0.9) }
    func stopRingtone() { if activeLoop == "Ringtone" { stopLoop() } }

    // MARK: - One-shot cues

    /// VERY short cue when the call connects (a single light "Tink"). Plays via
    /// `AudioServicesPlaySystemSound` (system path, reliable while WebRTC owns the
    /// session, no bundled asset).
    func playConnected() {
        AudioServicesPlaySystemSound(SystemSoundID(1057)) // "Tink" — very brief
        logger.info("connected cue played")
    }

    /// Short cue when the call ends (raccroché / remote hangup / failure).
    func playEnded() {
        AudioServicesPlaySystemSound(SystemSoundID(1075)) // soft "end" tone
        logger.info("ended cue played")
    }

    // MARK: - Internal

    private func startLoop(resource: String, volume: Float) {
        stopLoop()
        guard let url = Bundle.main.url(forResource: resource, withExtension: "caf") else {
            logger.error("\(resource, privacy: .public).caf not found in bundle")
            return
        }
        activeLoop = resource
        loopGeneration += 1
        let generation = loopGeneration
        starter.startLoop(url: url, volume: volume, activatingSession: shouldSelfActivateSession) { [weak self] loop in
            guard let self, self.loopGeneration == generation else {
                loop?.stop()
                return
            }
            self.loop = loop
        }
    }

    private func stopLoop() {
        loopGeneration += 1
        loop?.stop()
        loop = nil
        activeLoop = nil
    }
}

/// Une boucle de sonnerie qui joue : on ne sait que l'arrêter.
protocol CallSoundLoop: AnyObject, Sendable {
    func stop()
}

/// Active la session de sonnerie et démarre une boucle. Avec une route Bluetooth
/// HFP, ce travail bloque plusieurs secondes : il ne tourne JAMAIS sur le fil
/// principal, et la boucle est livrée sur le MainActor une fois qu'elle joue (#17953).
protocol CallSoundLoopStarting: Sendable {
    func startLoop(
        url: URL,
        volume: Float,
        activatingSession: Bool,
        delivered: @escaping @MainActor @Sendable (CallSoundLoop?) -> Void
    )
}

struct BackgroundCallSoundLoopStarter: CallSoundLoopStarting {
    private static let queue = DispatchQueue(label: "me.meeshy.call-sounds", qos: .userInitiated)

    func startLoop(
        url: URL,
        volume: Float,
        activatingSession: Bool,
        delivered: @escaping @MainActor @Sendable (CallSoundLoop?) -> Void
    ) {
        Self.queue.async {
            if activatingSession { RingingAudioSession.activate() }
            let loop = PlayingSoundLoop.start(url: url, volume: volume)
            Task { @MainActor in delivered(loop) }
        }
    }
}

private final class PlayingSoundLoop: CallSoundLoop, @unchecked Sendable {
    private let player: AVAudioPlayer

    private init(player: AVAudioPlayer) { self.player = player }

    static func start(url: URL, volume: Float) -> PlayingSoundLoop? {
        let logger = MeeshyLog.logger(.callSounds)
        let resource = url.deletingPathExtension().lastPathComponent
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = -1
            player.volume = volume
            player.prepareToPlay()
            if player.play() {
                logger.info("\(resource, privacy: .public) loop started")
            } else {
                logger.warning("\(resource, privacy: .public) play() returned false — audio session not active yet")
            }
            return PlayingSoundLoop(player: player)
        } catch {
            logger.error("Failed to start \(resource, privacy: .public): \(error.localizedDescription)")
            return nil
        }
    }

    func stop() { player.stop() }
}

/// Sans CallKit pour activer la session pendant la sonnerie (Mac, ou appel au
/// premier plan), la session WebRTC passe en `.playAndRecord` — catégorie qui
/// ignore le bouton silence, comme l'app Téléphone. `isAudioEnabled` n'est
/// jamais posé ici : c'est le drapeau audio de l'APPEL, que WebRTC bascule
/// lui-même à la connexion.
private enum RingingAudioSession {
    static func activate() {
        let logger = MeeshyLog.logger(.callSounds)
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        defer { rtc.unlockForConfiguration() }
        let config = RTCAudioSessionConfiguration.webRTC()
        config.category = AVAudioSession.Category.playAndRecord.rawValue
        config.mode = AVAudioSession.Mode.default.rawValue
        config.categoryOptions = [.allowBluetoothHFP, .duckOthers, .defaultToSpeaker]
        do {
            try rtc.setConfiguration(config, active: true)
            logger.info("ringing-phase audio session active (.playAndRecord — ignores silent switch)")
        } catch {
            logger.error("ringing-phase session activation failed: \(error.localizedDescription)")
        }
    }
}
