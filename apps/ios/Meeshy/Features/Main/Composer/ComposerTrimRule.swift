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
    /// Le plancher de l'échelle de précision : un point d'écran n'y vaut jamais
    /// plus de deux millisecondes, même sur une longue prise.
    static let minimumPrecisePointsPerSecond: CGFloat = 500
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
    /// Le style natif porte le système de chiffres et le séparateur décimal de
    /// la langue : une horloge composée à la main graverait les chiffres latins.
    static func millisecondText(_ time: TimeInterval, locale: Locale = .current) -> String {
        let millis = time.isFinite ? Int((min(max(0, time), 86_400) * 1000).rounded()) : 0
        return Duration.milliseconds(millis).formatted(
            .time(pattern: .minuteSecond(padMinuteToLength: 0, fractionalSecondsLength: 3)).locale(locale))
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

    /// L'échelle de la piste dilatée, depuis celle de la piste entière.
    static func precisePointsPerSecond(_ pointsPerSecond: CGFloat) -> CGFloat {
        max(pointsPerSecond * preciseZoom, minimumPrecisePointsPerSecond)
    }

    /// **Ce que la loupe montre** : la fenêtre de temps qui tient dans la piste
    /// autour du trait fixe — seule elle se dessine, jamais la piste dilatée entière.
    static func precisionWindow(anchor: TimeInterval, width: CGFloat,
                                pointsPerSecond: CGFloat) -> ClosedRange<TimeInterval> {
        guard pointsPerSecond > 0, width > 0 else { return anchor...anchor }
        let demi = TimeInterval(width / 2 / pointsPerSecond)
        return (anchor - demi)...(anchor + demi)
    }

    /// La plage exportée, à la milliseconde lue sur la piste ; `nil` quand elle
    /// est le clip entier, ou hors découpe.
    static func timeRange(_ range: ClosedRange<TimeInterval>?, duration: TimeInterval) -> CMTimeRange? {
        guard let range, range.lowerBound > epsilon || range.upperBound < duration - epsilon else { return nil }
        return CMTimeRange(start: CMTime(seconds: range.lowerBound, preferredTimescale: 1000),
                           end: CMTime(seconds: range.upperBound, preferredTimescale: 1000))
    }
}
