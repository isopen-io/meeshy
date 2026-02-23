import Foundation

@MainActor
public final class PlaybackCoordinator {
    public static let shared = PlaybackCoordinator()

    private var audioPlayers: [ObjectIdentifier: WeakAudioPlayer] = [:]

    private init() {}

    // MARK: - Registration

    public func register(_ player: AudioPlaybackManager) {
        let id = ObjectIdentifier(player)
        audioPlayers[id] = WeakAudioPlayer(player: player)
    }

    public func unregister(_ player: AudioPlaybackManager) {
        let id = ObjectIdentifier(player)
        audioPlayers.removeValue(forKey: id)
    }

    // MARK: - Coordination

    public func willStartPlaying(audio player: AudioPlaybackManager) {
        pruneDeadReferences()

        for (id, weak) in audioPlayers where id != ObjectIdentifier(player) {
            weak.player?.stop()
        }

        SharedAVPlayerManager.shared.stop()
    }

    public func willStartPlaying(video manager: SharedAVPlayerManager) {
        pruneDeadReferences()

        for (_, weak) in audioPlayers {
            weak.player?.stop()
        }
    }

    // MARK: - Cleanup

    private func pruneDeadReferences() {
        audioPlayers = audioPlayers.filter { $0.value.player != nil }
    }
}

private struct WeakAudioPlayer {
    weak var player: AudioPlaybackManager?
}
