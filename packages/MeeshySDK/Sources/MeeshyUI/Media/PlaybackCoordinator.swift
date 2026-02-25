import Foundation

// MARK: - Protocol for any player that can be stopped by the coordinator

@MainActor
public protocol StoppablePlayer: AnyObject {
    func stop()
}

// MARK: - Playback Coordinator

@MainActor
public final class PlaybackCoordinator {
    public static let shared = PlaybackCoordinator()

    private var audioPlayers: [ObjectIdentifier: WeakAudioPlayer] = [:]
    private var externalPlayers: [ObjectIdentifier: WeakStoppablePlayer] = [:]

    private init() {}

    // MARK: - SDK AudioPlaybackManager Registration

    public func register(_ player: AudioPlaybackManager) {
        let id = ObjectIdentifier(player)
        audioPlayers[id] = WeakAudioPlayer(player: player)
    }

    public func unregister(_ player: AudioPlaybackManager) {
        let id = ObjectIdentifier(player)
        audioPlayers.removeValue(forKey: id)
    }

    // MARK: - Generic StoppablePlayer Registration

    public func registerExternal(_ player: StoppablePlayer) {
        let id = ObjectIdentifier(player)
        externalPlayers[id] = WeakStoppablePlayer(player: player)
    }

    public func unregisterExternal(_ player: StoppablePlayer) {
        let id = ObjectIdentifier(player)
        externalPlayers.removeValue(forKey: id)
    }

    // MARK: - Coordination

    public func willStartPlaying(audio player: AudioPlaybackManager) {
        pruneDeadReferences()

        for (id, weak) in audioPlayers where id != ObjectIdentifier(player) {
            weak.player?.stop()
        }

        stopAllExternal(except: nil)
        SharedAVPlayerManager.shared.stop()
    }

    public func willStartPlaying(video manager: SharedAVPlayerManager) {
        pruneDeadReferences()

        for (_, weak) in audioPlayers {
            weak.player?.stop()
        }

        stopAllExternal(except: nil)
    }

    public func willStartPlaying(external player: StoppablePlayer) {
        pruneDeadReferences()

        for (_, weak) in audioPlayers {
            weak.player?.stop()
        }

        stopAllExternal(except: ObjectIdentifier(player))
        SharedAVPlayerManager.shared.stop()
    }

    // MARK: - Cleanup

    private func stopAllExternal(except excludeId: ObjectIdentifier?) {
        for (id, weak) in externalPlayers where id != excludeId {
            weak.player?.stop()
        }
    }

    private func pruneDeadReferences() {
        audioPlayers = audioPlayers.filter { $0.value.player != nil }
        externalPlayers = externalPlayers.filter { $0.value.player != nil }
    }
}

private struct WeakAudioPlayer {
    weak var player: AudioPlaybackManager?
}

private struct WeakStoppablePlayer {
    weak var player: StoppablePlayer?
}
