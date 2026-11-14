import Foundation
import CoreGraphics

/// **La fenêtre VISIBLE de la frise** : la portion du temps de la scène que la
/// largeur montre. Entière par défaut ; le pincement la resserre jusqu'à
/// `minimumSpan`, le glissé du fond la fait défiler. Toujours dans la scène.
/// Loi extraite de `ComposerSceneFriseViewport` (app), tenue égale par le
/// fichier de vecteurs jusqu'à l'intégration.
public nonisolated struct MeeshyTimelineFriseViewport: Sendable, Equatable {
    public let start: Double
    public let span: Double

    /// La fenêtre la plus étroite par défaut : trois secondes.
    public static let defaultMinimumSpan: Double = 3

    public init(start: Double, span: Double) {
        self.start = start
        self.span = span
    }

    public static func whole(_ duration: Double) -> MeeshyTimelineFriseViewport {
        MeeshyTimelineFriseViewport(start: 0, span: max(duration, 0))
    }

    public var end: Double { start + span }

    /// La même fenêtre ramenée dans une scène de `duration` secondes, jamais
    /// plus étroite que `minimumSpan` (ni que la scène).
    public func clamped(to duration: Double, minimumSpan: Double = defaultMinimumSpan) -> MeeshyTimelineFriseViewport {
        let total = max(duration.isFinite ? duration : 0, 0)
        let width = min(max(span.isFinite ? span : total, min(minimumSpan, total)), total)
        let first = min(max(start.isFinite ? start : 0, 0), total - width)
        return MeeshyTimelineFriseViewport(start: first, span: width)
    }

    /// La position de `seconds` dans la fenêtre : 0 au bord gauche, 1 au bord
    /// droit, hors de [0, 1] quand l'instant n'est pas visible.
    public func fraction(_ seconds: Double) -> Double {
        guard span > 0, seconds.isFinite else { return 0 }
        return (seconds - start) / span
    }

    public func time(atFraction value: Double) -> Double {
        start + max(0, min(1, value.isFinite ? value : 0)) * span
    }

    public func isShowing(_ seconds: Double) -> Bool {
        seconds.isFinite && seconds >= start && seconds <= end
    }

    /// **Pincer** : la fenêtre se resserre (`scale` > 1) ou s'élargit autour de
    /// `anchor`, qui garde sa place à l'écran.
    public func zoomed(
        by scale: Double,
        around anchor: Double,
        duration: Double,
        minimumSpan: Double = defaultMinimumSpan
    ) -> MeeshyTimelineFriseViewport {
        guard scale.isFinite, scale > 0, span > 0 else { return clamped(to: duration, minimumSpan: minimumSpan) }
        let pivot = min(max(anchor.isFinite ? anchor : start, start), end)
        let place = (pivot - start) / span
        let width = MeeshyTimelineFriseViewport(start: 0, span: span / scale)
            .clamped(to: duration, minimumSpan: minimumSpan).span
        return MeeshyTimelineFriseViewport(start: pivot - place * width, span: width)
            .clamped(to: duration, minimumSpan: minimumSpan)
    }

    /// **Défiler** de `fraction` de largeur : un glissé vers la droite (fraction
    /// positive) montre ce qui précède.
    public func panned(
        by fraction: Double,
        duration: Double,
        minimumSpan: Double = defaultMinimumSpan
    ) -> MeeshyTimelineFriseViewport {
        MeeshyTimelineFriseViewport(start: start - (fraction.isFinite ? fraction : 0) * span, span: span)
            .clamped(to: duration, minimumSpan: minimumSpan)
    }

    /// La fenêtre qui montre `seconds` : inchangée s'il est visible, sinon la
    /// page qui commence (ou finit) à lui.
    public func showing(
        _ seconds: Double,
        duration: Double,
        minimumSpan: Double = defaultMinimumSpan
    ) -> MeeshyTimelineFriseViewport {
        guard seconds.isFinite, seconds < start || seconds > end else {
            return clamped(to: duration, minimumSpan: minimumSpan)
        }
        let first = seconds < start ? seconds : seconds - span
        return MeeshyTimelineFriseViewport(start: first, span: span).clamped(to: duration, minimumSpan: minimumSpan)
    }

    /// Zoomée quand elle montre moins que la scène entière.
    public func isZoomed(in duration: Double) -> Bool {
        span < duration - 1e-9
    }
}

/// **La règle graduée** : un pas MAJEUR choisi sur une échelle lisible (1 s →
/// 1 h) pour que deux libellés gardent au moins `labelGap` entre eux et qu'il
/// n'y en ait jamais plus de douze, et des graduations mineures tant qu'elles
/// restent à six points l'une de l'autre. Loi extraite de
/// `ComposerSceneFriseRuler` (app) ; les libellés sont à l'hôte (`timeText`).
public nonisolated enum MeeshyTimelineFriseRuler {
    public nonisolated struct Tick: Sendable, Equatable {
        public let time: Double
        public let isMajor: Bool

        public init(time: Double, isMajor: Bool) {
            self.time = time
            self.isMajor = isMajor
        }
    }

    private static let scale: [(step: Double, divisions: Int)] = [
        (1, 5), (2, 4), (5, 5), (10, 5), (15, 3), (30, 3),
        (60, 4), (120, 4), (300, 5), (600, 5), (900, 3), (1800, 3), (3600, 4),
    ]

    public static let defaultLabelGap: CGFloat = 44
    public static let maximumLabels: Double = 12
    public static let minimumMinorGap: CGFloat = 6
    /// Ce qu'on ajoute à la largeur du plus large libellé pour qu'il respire.
    public static let labelBreathing: CGFloat = 8

    /// L'écart entre deux libellés : 44, ou la largeur du plus large plus 8.
    public static func labelGap(widestLabel: CGFloat) -> CGFloat {
        max(defaultLabelGap, (widestLabel.isFinite ? widestLabel : 0) + labelBreathing)
    }

    /// La largeur d'un libellé à chasse fixe de `characters` signes, avant de
    /// le dessiner : elle choisit le pas, la police de l'utilisateur comprise.
    public static func estimatedLabelWidth(characters: Int, fontSize: CGFloat) -> CGFloat {
        CGFloat(max(characters, 0)) * max(fontSize, 0) * monospacedAdvance
    }

    /// L'avance d'un chiffre à chasse fixe, en fraction de la taille de la police.
    public static let monospacedAdvance: CGFloat = 0.62

    public static func majorStep(span: Double, width: CGFloat, labelGap: CGFloat = defaultLabelGap) -> Double {
        chosen(span: span, width: width, labelGap: labelGap).step
    }

    /// Les graduations de la seule fenêtre VISIBLE.
    public static func ticks(
        in viewport: MeeshyTimelineFriseViewport,
        width: CGFloat,
        labelGap: CGFloat = defaultLabelGap
    ) -> [Tick] {
        guard viewport.span > 0, viewport.span.isFinite, viewport.start.isFinite, width > 0 else { return [] }
        let choice = chosen(span: viewport.span, width: width, labelGap: labelGap)
        let minor = choice.step / Double(choice.divisions)
        let withMinors = CGFloat(minor / viewport.span) * width >= minimumMinorGap
        let pitch = withMinors ? minor : choice.step
        let perMajor = withMinors ? choice.divisions : 1
        let first = Int((viewport.start / pitch - 0.0001).rounded(.up))
        let last = Int((viewport.end / pitch + 0.0001).rounded(.down))
        guard first <= last else { return [] }
        return (first...last).map { rank in
            let time = min(viewport.end, Double(rank / perMajor) * choice.step + Double(rank % perMajor) * minor)
            return Tick(time: time, isMajor: rank % perMajor == 0)
        }
    }

    /// La tête a-t-elle franchi une graduation majeure entre deux images ?
    public static func crossesMajor(from origin: Double, to target: Double, step: Double) -> Bool {
        guard step > 0, origin.isFinite, target.isFinite else { return false }
        return (origin / step).rounded(.down) != (target / step).rounded(.down)
    }

    private static func chosen(span: Double, width: CGFloat, labelGap: CGFloat) -> (step: Double, divisions: Int) {
        guard span > 0, width > 0 else { return scale[0] }
        return scale.first { CGFloat($0.step / span) * width >= labelGap && span / $0.step <= maximumLabels }
            ?? scale[scale.count - 1]
    }
}
