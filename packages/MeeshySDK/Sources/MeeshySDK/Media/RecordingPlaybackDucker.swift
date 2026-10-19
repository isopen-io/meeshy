#if os(iOS)
import AVFoundation
import Foundation

/// Ce dont on baisse le volume : le lecteur lui-même (`AVPlayer`,
/// `AVAudioPlayer`), jamais le volume du système.
@MainActor
public protocol PlaybackVolumeTarget: AnyObject {
    var volume: Float { get set }
}

extension AVPlayer: PlaybackVolumeTarget {}
extension AVAudioPlayer: PlaybackVolumeTarget {}

/// Un registre de lecteurs Meeshy qui sait lesquels s'entendent MAINTENANT.
@MainActor
public protocol AudiblePlaybackSource: AnyObject {
    var audibleVolumeTargets: [any PlaybackVolumeTarget] { get }
}

/// **Le mécanisme UNIQUE de « baisse puis restauration »** des lecteurs Meeshy
/// pendant un enregistrement (#11042).
@MainActor
public final class RecordingPlaybackDucker {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    public static let shared = RecordingPlaybackDucker()

    init() {}

    public func register(_ source: any AudiblePlaybackSource) {}

    public var hasAudiblePlayback: Bool { false }

    public func duck() {}

    public func restore() {}
}
#endif
