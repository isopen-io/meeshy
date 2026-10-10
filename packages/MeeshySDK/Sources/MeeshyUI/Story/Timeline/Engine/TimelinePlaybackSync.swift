import Foundation
import Darwin

/// Loi d'horloge de l'aperçu du composer (#9702) : UNE ancre en temps hôte,
/// partagée par la vidéo (`AVPlayer.setRate(_:time:atHostTime:)`), l'audio
/// (`AVAudioPlayerNode.play(at:)`) et l'horloge interne des slides sans vidéo.
///
/// Avant, la vidéo partait sur `player.play()` (au gré du player, qui attendait
/// en plus de minimiser les stalls) et l'audio à `mach_absolute_time() + délai`
/// calculé un peu plus tard : deux origines, donc un décalage fixe audible.
enum TimelinePlaybackSync {

    /// Marge entre la décision de jouer et l'instant commun : le temps qu'il faut
    /// au moteur audio pour rendre son premier tampon et au player pour caler
    /// sa première image. Assez courte pour rester imperceptible au toucher.
    static let defaultLeadSeconds: Double = 0.05

    private static let systemTimebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    static func anchorHostTime(now: UInt64 = mach_absolute_time(),
                               leadSeconds: Double = defaultLeadSeconds) -> UInt64 {
        anchorHostTime(now: now, leadSeconds: leadSeconds, timebase: systemTimebase)
    }

    static func anchorHostTime(now: UInt64,
                               leadSeconds: Double,
                               timebase: mach_timebase_info_data_t) -> UInt64 {
        saturatingAdd(now, AudioMixer.hostTime(forDelaySeconds: leadSeconds, timebase: timebase))
    }

    /// Instant hôte où un clip qui commence à `clipStartSeconds` sur la timeline
    /// doit partir, quand la lecture reprend à `playheadSeconds` à l'`anchor`.
    /// Un clip déjà commencé part À l'ancre (depuis un décalage dans le fichier).
    static func clipStartHostTime(anchor: UInt64,
                                  clipStartSeconds: Double,
                                  playheadSeconds: Double) -> UInt64 {
        clipStartHostTime(anchor: anchor,
                          clipStartSeconds: clipStartSeconds,
                          playheadSeconds: playheadSeconds,
                          timebase: systemTimebase)
    }

    static func clipStartHostTime(anchor: UInt64,
                                  clipStartSeconds: Double,
                                  playheadSeconds: Double,
                                  timebase: mach_timebase_info_data_t) -> UInt64 {
        let delay = AudioMixer.hostTime(forDelaySeconds: clipStartSeconds - playheadSeconds,
                                        timebase: timebase)
        return saturatingAdd(anchor, delay)
    }

    /// Temps hôte exprimé en secondes, dans le même domaine que
    /// `CACurrentMediaTime()` et `CADisplayLink.timestamp`.
    static func hostSeconds(_ hostTime: UInt64) -> Double {
        hostSeconds(hostTime, timebase: systemTimebase)
    }

    static func hostSeconds(_ hostTime: UInt64, timebase: mach_timebase_info_data_t) -> Double {
        guard timebase.denom > 0 else { return 0 }
        return Double(hostTime) * Double(timebase.numer) / Double(timebase.denom) / 1_000_000_000
    }

    /// Tête de lecture de l'horloge interne : DÉRIVÉE du temps hôte écoulé
    /// depuis l'ancre, jamais accumulée tick après tick — un tick en retard ou
    /// perdu ne décale donc rien. Avant l'ancre, elle reste à l'origine.
    static func internalClockPlayhead(origin: Float,
                                      anchorSeconds: Double,
                                      now: Double,
                                      duration: Float) -> Float {
        let elapsed = max(0, now - anchorSeconds)
        return min(duration, origin + Float(elapsed))
    }

    private static func saturatingAdd(_ lhs: UInt64, _ rhs: UInt64) -> UInt64 {
        let (sum, overflow) = lhs.addingReportingOverflow(rhs)
        return overflow ? .max : sum
    }
}
