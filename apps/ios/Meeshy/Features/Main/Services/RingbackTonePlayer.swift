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

    private var isMac: Bool { ProcessInfo.processInfo.isiOSAppOnMac }

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

    /// Short cue when the call connects. `AudioServicesPlaySystemSound` plays
    /// through the system path so it is reliable even while WebRTC owns the
    /// session, and needs no bundled asset.
    func playConnected() {
        AudioServicesPlaySystemSound(SystemSoundID(1336)) // subtle "connect" tock
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
        activateForMacRingingIfNeeded()
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

    /// Mac has no CallKit to activate the session during ringing → bring the
    /// WebRTC session up (playback, speaker) so the loops are audible. No-op on
    /// iOS (CallKit owns activation) and when the session is already enabled.
    private func activateForMacRingingIfNeeded() {
        guard isMac else { return }
        let rtc = RTCAudioSession.sharedInstance()
        guard !rtc.isAudioEnabled else { return }
        rtc.lockForConfiguration()
        do {
            let config = RTCAudioSessionConfiguration.webRTC()
            config.category = AVAudioSession.Category.playAndRecord.rawValue
            config.mode = AVAudioSession.Mode.default.rawValue
            config.categoryOptions = [.allowBluetoothHFP, .duckOthers, .defaultToSpeaker]
            try rtc.setConfiguration(config, active: true)
            rtc.isAudioEnabled = true
            logger.info("[macOS] audio session activated for ringing-phase sounds")
        } catch {
            logger.error("[macOS] ringing-phase session activation failed: \(error.localizedDescription)")
        }
        rtc.unlockForConfiguration()
    }
}
