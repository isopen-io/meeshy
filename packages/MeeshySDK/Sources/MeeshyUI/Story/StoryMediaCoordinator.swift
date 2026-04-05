import SwiftUI
import AVFoundation

/// Coordinates story audio/video with the rest of the app.
///
/// Acts as a single `StoppablePlayer` representing ALL active story media.
/// When a story plays, all other app audio stops. When external audio starts,
/// story media stops via the registered `onStop` handler.
/// Within a story, multiple tracks can play simultaneously (timeline multi-track).
@MainActor
public final class StoryMediaCoordinator: StoppablePlayer {
    public static let shared = StoryMediaCoordinator()
    private var isRegistered = false
    private var stopHandler: (() -> Void)?

    private init() {}

    /// Claim exclusive audio for story playback. Stops all other app audio.
    /// - Parameter onStop: Called when PlaybackCoordinator needs story media to stop
    ///   (e.g., when a message vocal starts playing).
    public func activate(onStop: @escaping () -> Void) {
        stopHandler = onStop
        if !isRegistered {
            PlaybackCoordinator.shared.registerExternal(self)
            isRegistered = true
        }
        PlaybackCoordinator.shared.willStartPlaying(external: self)

        // Ensure audio plays through speakers (not just ringer) regardless of silent switch
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}
    }

    /// Release exclusive audio (story dismissed). Triggers stop handler for cleanup.
    public func deactivate() {
        stopHandler?()
        stopHandler = nil
    }

    /// Called by PlaybackCoordinator when other app audio needs to play.
    public func stop() {
        stopHandler?()
    }
}
