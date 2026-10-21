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
    /// Un de ses lecteurs joue avec le son, baissable ou non (#11040).
    var holdsAudiblePlayback: Bool { get }
}

extension AudiblePlaybackSource {
    public var holdsAudiblePlayback: Bool { !audibleVolumeTargets.isEmpty }
}

/// **Le mécanisme UNIQUE de « baisse puis restauration »** des lecteurs Meeshy
/// pendant un enregistrement (#11042).
///
/// Les registres de lecteurs (`PlaybackCoordinator` pour la vidéo partagée et
/// les vocaux, `AudioPlayerManager` pour les extraits de sons) s'inscrivent
/// ici ; le ducker leur demande, au début d'un enregistrement, ce qui
/// s'entend, le baisse par `PlaybackDuckLedger`, et le rend à la fin. Un
/// lecteur libéré entre-temps est oublié ; un lecteur dont l'utilisateur a
/// changé le volume garde le sien.
///
/// Hors du ducker, par construction : le lecteur de stories, qui réécrit le
/// volume de ses pistes à chaque image (automation, `ReaderAudioMixer`) et se
/// met en pause quand on compose une réponse.
@MainActor
public final class RecordingPlaybackDucker {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    public static let shared = RecordingPlaybackDucker()

    private struct WeakSource {
        weak var source: (any AudiblePlaybackSource)?
    }

    private struct WeakTarget {
        weak var target: (any PlaybackVolumeTarget)?
    }

    private var sources: [ObjectIdentifier: WeakSource] = [:]
    private var ducked: [ObjectIdentifier: WeakTarget] = [:]
    private var ledger = PlaybackDuckLedger()

    init() {}

    public func register(_ source: any AudiblePlaybackSource) {
        sources = sources.filter { $0.value.source != nil }
        sources[ObjectIdentifier(source)] = WeakSource(source: source)
    }

    /// Un lecteur Meeshy s'entend-il maintenant ?
    public var hasAudiblePlayback: Bool { !audibleTargets.isEmpty }

    /// Un lecteur Meeshy joue-t-il encore, quel qu'il soit (vidéo, vocal,
    /// story, aperçu) ? Une libération de session l'attend (#11040, j).
    public var meeshyStillPlays: Bool {
        sources.values.compactMap(\.source).contains { $0.holdsAudiblePlayback }
    }

    /// Baisse ce qui s'entend. Idempotent.
    public func duck() {
        for target in audibleTargets {
            let key = ObjectIdentifier(target)
            guard let lowered = ledger.duck(key, currentVolume: target.volume) else { continue }
            ducked[key] = WeakTarget(target: target)
            target.volume = lowered
        }
    }

    /// Rend à chaque lecteur baissé le volume qu'il avait. Sans `duck()`
    /// préalable, ne fait rien.
    public func restore() {
        for (key, weak) in ducked {
            guard let target = weak.target else {
                ledger.forget(key)
                continue
            }
            guard let original = ledger.restore(key, currentVolume: target.volume) else { continue }
            target.volume = original
        }
        ducked = [:]
    }

    private var audibleTargets: [any PlaybackVolumeTarget] {
        let all = sources.values.compactMap(\.source).flatMap(\.audibleVolumeTargets)
        var seen = Set<ObjectIdentifier>()
        return all.filter { seen.insert(ObjectIdentifier($0)).inserted }
    }
}
#endif
