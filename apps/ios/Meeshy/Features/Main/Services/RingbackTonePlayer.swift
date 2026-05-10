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
            player.play()
            self.player = player
            logger.info("Ringback tone started")
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
