import Foundation
import AVFoundation
import AudioToolbox
import WebRTC
import os

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
/// players would be silent — `activateForMacRingingIfNeeded()` brings the WebRTC
/// session up (playback) so the ringback/ringtone are audible; the call's
/// `[AUDIO_FALLBACK]` re-activation at connect is then a no-op.
///
/// The class name stays `RingbackTonePlayer` to avoid churn at every call site;
/// it is effectively the call sound manager.
@MainActor
final class RingbackTonePlayer {
    private var loopPlayer: AVAudioPlayer?
    private var activeLoop: String?
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-sounds")

    /// Set by `CallManager` to `!callUsesCallKit`: true when there is no CallKit to
    /// activate the AVAudioSession during the ringing phase (iOS-app-on-Mac, or a
    /// foreground in-app call), so the loop players must bring the session up
    /// themselves. False on CallKit-driven calls (CallKit owns activation).
    var shouldSelfActivateSession = false

    // MARK: - Ringback (caller)

    func start() { startLoop(resource: "RingbackTone", volume: 0.6) }

    func stop() {
        guard loopPlayer != nil else { return }
        stopLoop()
    }

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
        activateForRingingIfNeeded()
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = -1
            player.volume = volume
            player.prepareToPlay()
            let started = player.play()
            loopPlayer = player
            activeLoop = resource
            if started {
                logger.info("\(resource, privacy: .public) loop started")
            } else {
                logger.warning("\(resource, privacy: .public) play() returned false — audio session not active yet")
            }
        } catch {
            logger.error("Failed to start \(resource, privacy: .public): \(error.localizedDescription)")
        }
    }

    private func stopLoop() {
        loopPlayer?.stop()
        loopPlayer = nil
        activeLoop = nil
    }

    /// When there is no CallKit to activate the session during ringing (Mac, or a
    /// foreground in-app call), bring the WebRTC session up (playback, speaker) so
    /// the loops are audible. No-op on CallKit-driven calls (it owns activation)
    /// and when the session is already enabled.
    private func activateForRingingIfNeeded() {
        guard shouldSelfActivateSession else { return }
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        do {
            // `.playAndRecord` IGNORES the hardware silent switch (recording
            // categories always do), so the in-app ringtone/ringback rings even in
            // silent mode — matching the system Phone app. `.defaultToSpeaker` keeps
            // it audible. Applied unconditionally: the session may already be active
            // in a category that RESPECTS the mute switch (then the sound is silent).
            let config = RTCAudioSessionConfiguration.webRTC()
            config.category = AVAudioSession.Category.playAndRecord.rawValue
            config.mode = AVAudioSession.Mode.default.rawValue
            config.categoryOptions = [.allowBluetoothHFP, .duckOthers, .defaultToSpeaker]
            try rtc.setConfiguration(config, active: true)
            // CALL-FIX 2026-06-06 — do NOT set `rtc.isAudioEnabled` here. That is
            // WebRTC's CALL-audio flag (manual-audio mode): setting it during the
            // ringing phase starts WebRTC's audio I/O unit prematurely AND makes
            // the call's `[AUDIO_FALLBACK]` (transitionToConnected) think the
            // session was already activated by CallKit → it SKIPS the real call
            // activation → on Mac the mic never starts (the peer can't hear us).
            // The ringback/ringtone AVAudioPlayer only needs the AVAudioSession
            // ACTIVE (done by setConfiguration above); WebRTC flips isAudioEnabled
            // itself at connect.
            logger.info("ringing-phase audio session active (.playAndRecord — ignores silent switch)")
        } catch {
            logger.error("ringing-phase session activation failed: \(error.localizedDescription)")
        }
        rtc.unlockForConfiguration()
    }
}
