import Foundation
import MeeshySDK

// MARK: - Protocol for any player that can be stopped by the coordinator

@MainActor
public protocol StoppablePlayer: AnyObject {
    func stop()
}

/// Un lecteur externe qui sait dire s'il joue avec le son : tant qu'il joue,
/// aucune libération de session ne passe sous lui (#11040, j).
@MainActor
public protocol AudiblyPlayingPlayer: StoppablePlayer {
    var isPlayingAudibly: Bool { get }
}

/// Un lecteur externe qui sait s'arrêter « interrompu » pendant un appel
/// Meeshy, et reprendre au raccrochage (`.callEndedShouldResume`, #11063).
@MainActor
public protocol InterruptiblePlayer: StoppablePlayer {
    func interruptForCall()
}

/// Un lecteur qui sait s'éteindre en fondu plutôt que se couper net (#9867).
@MainActor
public protocol FadingStoppablePlayer: StoppablePlayer, Sendable {
    func fadeOutAndStop(duration: TimeInterval) async
}

// MARK: - Playback Coordinator

@MainActor
public final class PlaybackCoordinator {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = PlaybackCoordinator()

    private var audioPlayers: [ObjectIdentifier: WeakAudioPlayer] = [:]
    private var externalPlayers: [ObjectIdentifier: WeakStoppablePlayer] = [:]

    private init() {
        RecordingPlaybackDucker.shared.register(self)
    }

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
        SharedAVPlayerManager.shared.stopForHandoff()
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
        SharedAVPlayerManager.shared.stopForHandoff()
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

    /// `true` when any registered AUDIO engine is playing — the shared VIDEO
    /// manager is deliberately excluded. This is the background-transition
    /// discriminant: audio playback survives backgrounding under the `audio`
    /// UIBackgroundMode, while video NEVER does (it either hands off to PiP or
    /// pauses). `isAnyPlaying` above stays the global predicate (video included)
    /// for the post-call resume gate in `ConversationAudioCoordinator`.
    public var isAnyAudioPlaying: Bool {
        for (_, weak) in audioPlayers where weak.player?.isPlaying == true { return true }
        return false
    }

    // MARK: - Appel Meeshy décroché (#11063)

    /// L'appel prend la main : chaque lecteur qui sait reprendre se met en
    /// pause MARQUÉE « interrompue » — sa reprise au raccrochage passe par
    /// `.callEndedShouldResume`, comme après un appel du système. Les autres
    /// s'arrêtent, comme le faisait `stopAll()`.
    public func interruptAllForCall() {
        pruneDeadReferences()
        SharedAVPlayerManager.shared.handleSessionEvent(.interruptionBegan)
        for (_, weak) in audioPlayers {
            guard let player = weak.player else { continue }
            if player.respondsToSessionInterruptions {
                player.handleSessionEvent(.interruptionBegan)
            } else {
                player.stop()
            }
        }
        for (_, weak) in externalPlayers {
            if let player = weak.player as? InterruptiblePlayer {
                player.interruptForCall()
            } else {
                weak.player?.stop()
            }
        }
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

    /// Stops every audio / external player but leaves the shared video engine
    /// (`SharedAVPlayerManager`) untouched. Used when paging away from a reel so
    /// the previous clip's audio is cut without racing the incoming video reel,
    /// which drives its own engine.
    public func stopAllAudio() {
        pruneDeadReferences()
        for (_, weak) in audioPlayers {
            weak.player?.stop()
        }
        stopAllExternal(except: nil)
    }

    /// Éteint en fondu chaque lecteur externe qui le sait, en parallèle, et
    /// rend la main quand tous sont arrêtés. Appelé par le lecteur de stories
    /// au début de sa fermeture : le son descend pendant le ressort au lieu de
    /// se couper net quand la vue disparaît (#9867). Les lecteurs sans fondu
    /// ne sont pas touchés — `stopAll()` les arrête à la disparition.
    public func fadeOutAllExternal(duration: TimeInterval) async {
        pruneDeadReferences()
        let fades = externalPlayers.values
            .compactMap { $0.player as? FadingStoppablePlayer }
            .map { player in Task { await player.fadeOutAndStop(duration: duration) } }
        for fade in fades { await fade.value }
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

// MARK: - Enregistrement (#11042)

/// Le point d'accès aux lecteurs actifs : pendant un vocal ou une vidéo
/// filmée, `RecordingPlaybackDucker` baisse ce que ce registre dit audible.
extension PlaybackCoordinator: AudiblePlaybackSource {
    public var audibleVolumeTargets: [any PlaybackVolumeTarget] {
        let video = SharedAVPlayerManager.shared.audibleVolumeTarget.map { [$0] } ?? []
        let audio = audioPlayers.values.compactMap { $0.player?.audibleVolumeTarget }
        return video + audio
    }

    /// Les lecteurs externes (story, aperçu d'un vocal) comptent aussi : ils
    /// n'ont pas de volume à baisser, mais leur son empêche de rendre la
    /// session.
    public var holdsAudiblePlayback: Bool {
        guard audibleVolumeTargets.isEmpty else { return true }
        return externalPlayers.values.contains { ($0.player as? AudiblyPlayingPlayer)?.isPlayingAudibly == true }
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public var stopAllCount: Int = 0
    public init() {}
}
#endif
