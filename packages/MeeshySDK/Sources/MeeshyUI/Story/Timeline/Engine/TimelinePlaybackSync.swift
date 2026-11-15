import AVFoundation
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

    /// **Le départ de la vidéo selon l'état de son item** (#9884). Un item pas
    /// encore prêt refuse `setRate(_:time:atHostTime:)` : partir sans ancre
    /// pendant que le son part à la sienne décale l'image du son. On attend
    /// donc qu'il soit prêt, et vidéo et son partent ensemble. Un item en
    /// échec joue sans ancre, pour que le son, lui, parte.
    nonisolated enum VideoStart: Equatable, Sendable {
        case anchored
        case awaitingReadiness
        case unanchored
    }

    nonisolated static func videoStart(itemStatus: AVPlayerItem.Status?) -> VideoStart {
        switch itemStatus {
        case .readyToPlay: return .anchored
        case .failed: return .unanchored
        case .unknown, .none: return .awaitingReadiness
        @unknown default: return .awaitingReadiness
        }
    }

    private static func saturatingAdd(_ lhs: UInt64, _ rhs: UInt64) -> UInt64 {
        let (sum, overflow) = lhs.addingReportingOverflow(rhs)
        return overflow ? .max : sum
    }
}

/// **Le tampon d'E/S de 5 ms n'est emprunté que pendant la lecture** (#9884).
/// Le scrub et le play du composer répondent sans latence audible ; le reste de
/// l'app (lecteur de stories, vocaux) n'a pas à payer ce coût CPU et énergie
/// pendant que le composer est seulement ouvert. Le bail garde la valeur
/// d'origine, une seule fois, et la rend une seule fois.
nonisolated struct IOBufferLease: Equatable, Sendable {
    static let previewDuration: TimeInterval = 0.005

    private(set) var original: TimeInterval?

    init() {}

    /// `true` : la valeur d'origine vient d'être notée, le tampon court peut se poser.
    mutating func borrow(current: TimeInterval) -> Bool {
        guard original == nil else { return false }
        original = current
        return true
    }

    /// La valeur à rendre à la session, `nil` si rien n'était emprunté.
    mutating func giveBack() -> TimeInterval? {
        defer { original = nil }
        return original
    }
}
