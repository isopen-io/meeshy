import CoreGraphics
import CoreMedia
import Foundation
import MeeshyUI

/// **La découpe d'une vidéo capturée** (#9353, spec § 3.3) — le principe de
/// `MeeshyAudioTrimmer` (#4657) : en précision, on amène l'instant sous un trait
/// FIXE plutôt que de viser un trait du doigt.
nonisolated enum ComposerTrimRule {

    /// La plus courte plage gardée — celle du rognage audio.
    static let minimum: TimeInterval = AudioTrimGeometry.minimumSegment
    /// L'appui long sur une poignée dilate la piste à ce facteur.
    static let preciseZoom: CGFloat = AudioTrimGeometry.zoomRange.upperBound
    /// Sous la demi-milliseconde, une borne EST celle du clip.
    private static let epsilon: TimeInterval = 0.0005

    static func initialRange(duration: TimeInterval) -> ClosedRange<TimeInterval> {
        0...max(0, duration)
    }

    /// Une prise qui ne dépasse pas la plage minimale ne se découpe pas.
    static func canTrim(duration: TimeInterval) -> Bool {
        duration > minimum
    }

    /// Le début suit le doigt, sans passer sous zéro ni approcher la fin à moins
    /// de la plage minimale.
    static func movedStart(_ time: TimeInterval, range: ClosedRange<TimeInterval>) -> ClosedRange<TimeInterval> {
        let debut = min(max(0, time), max(0, range.upperBound - minimum))
        return debut...range.upperBound
    }

    /// La fin suit le doigt, sans sortir du clip ni approcher le début à moins de
    /// la plage minimale.
    static func movedEnd(_ time: TimeInterval, range: ClosedRange<TimeInterval>,
                         duration: TimeInterval) -> ClosedRange<TimeInterval> {
        let plafond = max(range.lowerBound, duration)
        let fin = max(min(plafond, time), min(plafond, range.lowerBound + minimum))
        return range.lowerBound...fin
    }

    /// « 0:03.482 » — minutes, secondes, millisecondes.
    static func millisecondText(_ time: TimeInterval) -> String {
        let millis = Int((max(0, time) * 1000).rounded())
        let minutes = millis / 60_000
        let secondes = (millis % 60_000) / 1000
        let reste = millis % 1000
        return String(format: "%d:%02d.%03d", minutes, secondes, reste)
    }

    /// La tête de lecture ne sort jamais de la plage gardée.
    static func playhead(_ time: TimeInterval, in range: ClosedRange<TimeInterval>) -> TimeInterval {
        min(range.upperBound, max(range.lowerBound, time))
    }

    /// Le point touché sur la piste (non dilatée), en temps du clip.
    static func time(atX x: CGFloat, width: CGFloat, duration: TimeInterval) -> TimeInterval {
        guard width > 0 else { return 0 }
        return min(max(0, duration), max(0, TimeInterval(x / width) * duration))
    }

    /// En précision : la bande suit le doigt sous le trait fixe — vers la droite,
    /// un instant antérieur passe sous le trait.
    static func preciseTime(anchor: TimeInterval, translationX: CGFloat, pointsPerSecond: CGFloat) -> TimeInterval {
        guard pointsPerSecond > 0 else { return anchor }
        return anchor - TimeInterval(translationX / pointsPerSecond)
    }

    /// La plage exportée, à la milliseconde lue sur la piste ; `nil` quand elle
    /// est le clip entier, ou hors découpe.
    static func timeRange(_ range: ClosedRange<TimeInterval>?, duration: TimeInterval) -> CMTimeRange? {
        guard let range, range.lowerBound > epsilon || range.upperBound < duration - epsilon else { return nil }
        return CMTimeRange(start: CMTime(seconds: range.lowerBound, preferredTimescale: 1000),
                           end: CMTime(seconds: range.upperBound, preferredTimescale: 1000))
    }
}
