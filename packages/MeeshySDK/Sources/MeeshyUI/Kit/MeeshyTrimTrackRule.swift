import CoreGraphics
import Foundation

/// La loi d'une piste de coupe : bornage de la plage, non-croisement, plancher et
/// plafond de durée, tête, échelle de précision. Pure, sans vue : les temps sont
/// des secondes de la SOURCE, `duration` est la source entière.
public nonisolated struct MeeshyTrimTrackRule: Sendable, Equatable {
    public let duration: Double
    public let minimumSpan: Double
    public let maximumSpan: Double?

    /// Le balayage du lecteur d'écran sur la tête, Page préc. / suiv. : une seconde.
    public static let coarseStep = 1.0
    /// Maj + flèche : un centième de seconde.
    public static let fineStep = 0.01
    /// Le facteur de la loupe de précision.
    public static let preciseZoom: CGFloat = 40
    /// Le plancher de l'échelle de précision : un point n'y vaut jamais plus de deux millisecondes.
    public static let minimumPrecisePointsPerSecond: CGFloat = 500
    /// Les temps se posent à la milliseconde : 0,1 + 0,2 vaut 0,3.
    public static let resolution = 1000.0
    private static let tolerance = 1e-9

    public init(duration: Double, minimumSpan: Double, maximumSpan: Double? = nil) {
        let floor = max(minimumSpan, Self.tolerance)
        self.duration = max(duration, 0)
        self.minimumSpan = floor
        self.maximumSpan = maximumSpan.flatMap { $0 > 0 ? max($0, floor) : nil }
    }

    /// Une source qui ne dépasse pas la durée minimale ne se coupe pas.
    public var canTrim: Bool { duration > minimumSpan }

    private var fullRange: ClosedRange<Double> { 0...duration }

    /// La plage ramenée dans la source, jamais plus courte que le plancher ni plus longue que le plafond.
    public func clamped(_ range: ClosedRange<Double>) -> ClosedRange<Double> {
        guard canTrim else { return fullRange }
        let lower = min(max(range.lowerBound, 0), duration - minimumSpan)
        let widest = maximumSpan.map { min(lower + $0, duration) } ?? duration
        let upper = min(max(range.upperBound, lower + minimumSpan), widest)
        return lower...upper
    }

    /// Le début suit le doigt : il ne passe ni sous zéro, ni à moins du plancher de la fin, ni à plus du plafond d'elle.
    public func movingStart(_ time: Double, range: ClosedRange<Double>) -> ClosedRange<Double> {
        guard canTrim else { return fullRange }
        let upper = range.upperBound
        let lowest = max(0, maximumSpan.map { upper - $0 } ?? 0)
        let highest = max(lowest, upper - minimumSpan)
        return Self.rounded(min(max(time, lowest), highest))...upper
    }

    /// La fin suit le doigt, symétrique : la borne opposée ne bouge jamais.
    public func movingEnd(_ time: Double, range: ClosedRange<Double>) -> ClosedRange<Double> {
        guard canTrim else { return fullRange }
        let lower = range.lowerBound
        let lowest = lower + minimumSpan
        let highest = max(lowest, min(duration, maximumSpan.map { lower + $0 } ?? duration))
        return lower...Self.rounded(min(max(time, lowest), highest))
    }

    public func moving(_ part: MeeshyTrimTrackPart, to time: Double, range: ClosedRange<Double>) -> ClosedRange<Double> {
        switch part {
        case .start: return movingStart(time, range: range)
        case .end: return movingEnd(time, range: range)
        case .playhead: return range
        }
    }

    /// La butée que `requested` atteint ou dépasse : le bord de la source, le plancher ou le plafond de durée.
    public func stop(part: MeeshyTrimTrackPart, requested: Double, range: ClosedRange<Double>) -> MeeshyTrimTrackStop? {
        guard canTrim else { return nil }
        switch part {
        case .start: return startStop(requested, range: range)
        case .end: return endStop(requested, range: range)
        case .playhead: return nil
        }
    }

    private func startStop(_ requested: Double, range: ClosedRange<Double>) -> MeeshyTrimTrackStop? {
        let upper = range.upperBound
        let widest = maximumSpan.map { upper - $0 } ?? 0
        if widest > 0, requested <= widest + Self.tolerance { return .ceiling }
        if requested <= Self.tolerance { return .edge }
        return requested >= upper - minimumSpan - Self.tolerance ? .floor : nil
    }

    private func endStop(_ requested: Double, range: ClosedRange<Double>) -> MeeshyTrimTrackStop? {
        let lower = range.lowerBound
        let widest = maximumSpan.map { lower + $0 } ?? duration
        if widest < duration, requested >= widest - Self.tolerance { return .ceiling }
        if requested >= duration - Self.tolerance { return .edge }
        return requested <= lower + minimumSpan + Self.tolerance ? .floor : nil
    }

    /// Un cran du lecteur d'écran, du clavier ou d'un balayage : la poignée ou la tête, de `step`.
    public func adjusted(
        part: MeeshyTrimTrackPart,
        up: Bool,
        step: Double,
        range: ClosedRange<Double>,
        playhead: Double,
        selection: MeeshyTrimTrackSelection = .kept
    ) -> MeeshyTrimTrackPosition {
        let delta = up ? step : -step
        switch part {
        case .start:
            return MeeshyTrimTrackPosition(range: movingStart(range.lowerBound + delta, range: range), playhead: playhead)
        case .end:
            return MeeshyTrimTrackPosition(range: movingEnd(range.upperBound + delta, range: range), playhead: playhead)
        case .playhead:
            return MeeshyTrimTrackPosition(range: range, playhead: self.playhead(playhead + delta, in: range, selection: selection))
        }
    }

    /// La tête ne sort jamais de la plage gardée ; en retrait, de la source.
    public func playhead(_ time: Double, in range: ClosedRange<Double>, selection: MeeshyTrimTrackSelection = .kept) -> Double {
        let bounds = selection == .kept ? range : fullRange
        return Self.rounded(min(bounds.upperBound, max(bounds.lowerBound, time)))
    }

    /// L'échelle de la loupe, depuis celle de la piste entière.
    public func preciseScale(pointsPerSecond: CGFloat) -> CGFloat {
        max(pointsPerSecond * Self.preciseZoom, Self.minimumPrecisePointsPerSecond)
    }

    /// En précision, la règle suit le doigt sous le trait fixe : vers la droite, un instant antérieur passe sous le trait.
    public func preciseTime(anchor: Double, translation: CGFloat, pointsPerSecond: CGFloat) -> Double {
        guard pointsPerSecond > 0 else { return anchor }
        return anchor - Double(translation / pointsPerSecond)
    }

    /// Ce que la loupe montre : la fenêtre de temps qui tient dans la piste autour du trait fixe.
    public func precisionWindow(anchor: Double, width: CGFloat, pointsPerSecond: CGFloat) -> ClosedRange<Double> {
        guard pointsPerSecond > 0, width > 0 else { return anchor...anchor }
        let half = Double(width / 2 / pointsPerSecond)
        return (anchor - half)...(anchor + half)
    }

    /// Au plus un changement par image, et seulement si la plage bornée change.
    public func shouldEmit(previous: ClosedRange<Double>, next: ClosedRange<Double>) -> Bool {
        clamped(previous) != clamped(next)
    }

    static func rounded(_ time: Double) -> Double {
        (time * resolution).rounded() / resolution
    }
}

/// Où la piste pose le temps : le contenu occupe `width`, en retrait de `inset`
/// de chaque côté — la place d'une poignée, qui se tient HORS de la plage.
public nonisolated struct MeeshyTrimTrackGeometry: Sendable, Equatable {
    public let inset: CGFloat
    public let width: CGFloat
    public let duration: Double

    public init(totalWidth: CGFloat, inset: CGFloat, duration: Double) {
        self.inset = inset
        self.width = max(1, totalWidth - inset * 2)
        self.duration = duration
    }

    public var pointsPerSecond: CGFloat {
        duration > 0 ? width / CGFloat(duration) : 0
    }

    /// L'abscisse d'un instant dans le contenu, depuis son bord gauche.
    public func offset(for time: Double) -> CGFloat {
        CGFloat(min(max(time, 0), duration)) * pointsPerSecond
    }

    /// L'abscisse d'un instant dans la piste entière.
    public func x(for time: Double) -> CGFloat {
        inset + offset(for: time)
    }

    /// L'instant sous une abscisse de la piste entière, borné à la source.
    public func time(atX x: CGFloat) -> Double {
        guard pointsPerSecond > 0 else { return 0 }
        return min(max(0, Double((x - inset) / pointsPerSecond)), duration)
    }
}
