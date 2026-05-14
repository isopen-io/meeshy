import Foundation
import AVFoundation
import os

/// Plays a ringback tone (the "rrr-rrr" sound the caller hears while waiting
/// for the callee to pick up). CallKit does NOT provide this automatically —
/// each app must implement it. This player loops a bundled .caf file at low
/// volume on the call audio session route.
///
/// Lifecycle:
///   - `start()` from `.outgoing.ringing` and `.outgoing.offering` states
///   - `stop()` on transition to `.connected`, `.reconnecting`, or any `.ended` state
///
/// Audio session compatibility: the player creates its own player but plays
/// through the active audio session category (PlayAndRecord). Because CallKit
/// owns the AVAudioSession lifecycle in this app, we DO NOT call setActive.
/// We just hand a player to AVAudioPlayer; iOS routes it through the active
/// session.
///
/// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.3
@MainActor
final class RingbackTonePlayer {
    private var player: AVAudioPlayer?
    private let logger = Logger(subsystem: "me.meeshy.app", category: "ringback-tone")

    func start() {
        guard player == nil else { return }
        guard let url = Bundle.main.url(forResource: "RingbackTone", withExtension: "caf") else {
            logger.error("RingbackTone.caf not found in bundle")
            return
        }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = -1   // infinite loop
            player.volume = 0.6         // softer than the caller's voice
            player.prepareToPlay()
            // Audit 2026-05-11 §A-Claim-4 — capture and log the play() Bool.
            // It silently returns false if the AVAudioSession is not yet
            // active (we're called from `startCall` which runs BEFORE
            // `configureAudioSession` AND BEFORE CallKit's `didActivate`).
            // Without this log we can't tell from a sysdiagnose whether the
            // user heard the ringback or just silence — and a `false` here
            // is the actual root cause of "I started a call but heard
            // nothing for 2-3 seconds" reports.
            let started = player.play()
            self.player = player
            if started {
                logger.info("Ringback tone started")
            } else {
                logger.warning("Ringback tone play() returned false — audio session likely not active yet (caller may hear silence until didActivate)")
            }
        } catch {
            logger.error("Failed to start ringback tone: \(error.localizedDescription)")
        }
    }

    func stop() {
        guard let player else { return }
        player.stop()
        self.player = nil
        logger.info("Ringback tone stopped")
    }
}
