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

    #if DEBUG
    /// Test seam: increments `stopAllCount` from callers that want to assert
    /// whether `stopAll()` was invoked via the background transition path
    /// without having to install a stub of the coordinator itself. Production
    /// code reads/writes the probe through `#if DEBUG` guards so the symbol
    /// never ships in Release.
    public var testStopAllProbe: PlaybackCoordinatorStopAllProbe?
    #endif

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

    // MARK: - Active Playback Query

    /// `true` when ANY registered player (SDK `AudioPlaybackManager`,
    /// external `StoppablePlayer`, or the shared video manager) is currently
    /// playing. Used by the background-transition guard so playback driven by
    /// players the conversation-level coordinator does not own — e.g. the
    /// fullscreen audio page's own `AudioPlaybackManager` — survives
    /// backgrounding under the `audio` UIBackgroundMode.
    public var isAnyPlaying: Bool {
        if SharedAVPlayerManager.shared.isPlaying { return true }
        for (_, weak) in audioPlayers where weak.player?.isPlaying == true { return true }
        return false
    }

    // MARK: - Stop All Playback

    public func stopAll() {
        pruneDeadReferences()
        for (_, weak) in audioPlayers {
            weak.player?.stop()
        }
        stopAllExternal(except: nil)
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

#if DEBUG
/// Probe lazily attached to `PlaybackCoordinator.shared.testStopAllProbe` so
/// background-transition tests can verify whether the lifecycle bridge took
/// the "stop everything" path. Reference type so the +1 mutation done by the
/// production code is visible to the test that owns the probe.
@MainActor
public final class PlaybackCoordinatorStopAllProbe {
    public var stopAllCount: Int = 0
    public init() {}
}
#endif
