import Foundation
import CoreGraphics

/// **La loi pure de la frise** : où va une fenêtre qu'on glisse ou qu'on tire,
/// à quoi elle s'aimante et avec quelle tolérance, ce qu'un pas du lecteur
/// d'écran lui fait, et où vivent les zones des poignées. Lois de geste
/// extraites de `ComposerSceneFriseMetrics` (app) ; l'aimant est `SnapEngine`
/// et sa tolérance `TimelineGeometry`, appelés, jamais recopiés.
public nonisolated struct MeeshyTimelineFriseRule: Sendable, Equatable {
    public let duration: Double
    /// L'écart plancher entre deux poignées : une fenêtre ne devient jamais plus courte.
    public let minimumSpan: Double

    /// Le pas fin du clavier (Maj + ← →).
    public static let fineStep: Double = 0.1
    /// La cible d'une poignée : 44 de large, dont 14 dans la barre et 30 dehors.
    public static let handleInside: CGFloat = 14
    public static let handleOutside: CGFloat = 30
    /// La zone d'un losange : 32 de large, le plus proche gagne.
    public static let keyframeZone: CGFloat = 32
    /// Ce qu'il reste toujours de la barre au doigt entre ses deux poignées.
    public static let minimumBody: CGFloat = 16

    public init(duration: Double, minimumSpan: Double) {
        self.duration = max(duration.isFinite ? duration : 0, 0)
        self.minimumSpan = max(minimumSpan.isFinite ? minimumSpan : 0, 0)
    }

    // MARK: - Glisser, tirer

    /// **La fenêtre après un glissé de `delta` secondes.** Déplacer garde la
    /// durée et reste dans la scène ; une poignée ne franchit jamais l'autre
    /// (`minimumSpan` les sépare) ni les bords.
    public func dragged(_ range: ClosedRange<Double>, part: MeeshyTimelineFrisePart, by delta: Double) -> ClosedRange<Double> {
        let step = delta.isFinite ? delta : 0
        let floor = min(minimumSpan, duration)
        switch part {
        case .playhead:
            return range
        case .move:
            let length = min(range.upperBound - range.lowerBound, duration)
            let first = max(0, min(range.lowerBound + step, duration - length))
            return first...(first + length)
        case .start:
            let first = max(0, min(range.lowerBound + step, range.upperBound - floor))
            return min(first, range.upperBound)...range.upperBound
        case .end:
            let last = min(duration, max(range.upperBound + step, range.lowerBound + floor))
            return range.lowerBound...max(last, range.lowerBound)
        }
    }

    /// **Le glissé AIMANTÉ** : le bord qui bouge — début, fin, ou le plus proche
    /// des deux pour la barre entière — s'accroche au candidat élu par
    /// `SnapEngine` dans la tolérance, puis la fenêtre est bornée comme un glissé libre.
    public func snapped(
        _ range: ClosedRange<Double>,
        part: MeeshyTimelineFrisePart,
        by delta: Double,
        candidates: [SnapCandidate],
        tolerance: Double
    ) -> MeeshyTimelineFriseDrag {
        let step = delta.isFinite ? delta : 0
        let engine = SnapEngine(toleranceSeconds: Float(tolerance.isFinite ? tolerance : 0))
        let correction: Double?
        let byTheEnd: Bool
        switch part {
        case .playhead:
            return MeeshyTimelineFriseDrag(range: range, snappedTime: nil)
        case .start:
            correction = Self.gap(engine, raw: range.lowerBound + step, candidates: candidates)
            byTheEnd = false
        case .end:
            correction = Self.gap(engine, raw: range.upperBound + step, candidates: candidates)
            byTheEnd = true
        case .move:
            let head = Self.gap(engine, raw: range.lowerBound + step, candidates: candidates)
            let tail = Self.gap(engine, raw: range.upperBound + step, candidates: candidates)
            correction = [head, tail].compactMap { $0 }.min { abs($0) < abs($1) }
            byTheEnd = correction != nil && correction != head
        }
        let result = dragged(range, part: part, by: step + (correction ?? 0))
        return MeeshyTimelineFriseDrag(
            range: result,
            snappedTime: correction == nil ? nil : (byTheEnd ? result.upperBound : result.lowerBound)
        )
    }

    /// Les points d'accroche d'une piste : la tête, les bords de la scène, les
    /// bords et les images clés des AUTRES pistes — jamais les siens.
    public func candidates(
        tracks: [MeeshyTimelineFriseTrack],
        excluding id: String,
        playhead: Double?
    ) -> [SnapCandidate] {
        let others = tracks.filter { $0.id != id }
        let edges = others.flatMap {
            [SnapCandidate(kind: .clipStart, time: Float($0.range.lowerBound)),
             SnapCandidate(kind: .clipEnd, time: Float($0.range.upperBound))]
        }
        let keys = others.flatMap { track in
            track.keyframes.map { SnapCandidate(kind: .keyframe, time: Float($0.time)) }
        }
        let scene = [SnapCandidate(kind: .slideStart, time: 0), SnapCandidate(kind: .slideEnd, time: Float(duration))]
        let head = playhead.map { [SnapCandidate(kind: .playhead, time: Float($0))] } ?? []
        return scene + head + edges + keys
    }

    /// Huit points de doigt à l'échelle RENDUE, plafonnés à un quart de seconde :
    /// la tolérance de `TimelineGeometry`, celle de l'atelier et d'Android.
    public static func tolerance(span: Double, width: CGFloat) -> Double {
        guard span > 0, span.isFinite, width > 0 else { return 0 }
        let zoom = width / (TimelineGeometry.basePixelsPerSecond * CGFloat(span))
        return Double(TimelineGeometry(zoomScale: zoom).dragSnapToleranceSeconds)
    }

    // MARK: - Lecteur d'écran, clavier

    /// Un pas de `step` secondes sur la partie : plus tard (`up`) ou plus tôt.
    public func adjusted(
        _ range: ClosedRange<Double>,
        part: MeeshyTimelineFrisePart,
        up: Bool,
        step: Double
    ) -> ClosedRange<Double> {
        let size = abs(step.isFinite ? step : 0)
        return dragged(range, part: part, by: up ? size : -size)
    }

    /// Début et Fin : la butée la plus lointaine de la partie.
    public func jumped(_ range: ClosedRange<Double>, part: MeeshyTimelineFrisePart, toStart: Bool) -> ClosedRange<Double> {
        dragged(range, part: part, by: toStart ? -duration - 1 : duration + 1)
    }

    // MARK: - Zones

    /// Ce qu'une poignée prend de la barre (au plus 14, toujours 16 de corps
    /// laissés au doigt) et hors d'elle (30).
    public static func handleZone(barWidth: CGFloat) -> (inside: CGFloat, outside: CGFloat) {
        let width = max(barWidth.isFinite ? barWidth : 0, 0)
        return (min(handleInside, max(0, (width - minimumBody) / 2)), handleOutside)
    }

    /// Le losange touché : le plus proche dans sa zone de 32, ou aucun.
    public static func keyframe(
        near time: Double,
        in keys: [MeeshyTimelineFriseKey],
        pointsPerSecond: CGFloat
    ) -> MeeshyTimelineFriseKey? {
        guard pointsPerSecond > 0, time.isFinite else { return nil }
        let reach = Double(keyframeZone / 2 / pointsPerSecond)
        return keys
            .filter { abs($0.time - time) <= reach }
            .min { abs($0.time - time) < abs($1.time - time) }
    }

    private static func gap(_ engine: SnapEngine, raw: Double, candidates: [SnapCandidate]) -> Double? {
        let result = engine.snap(rawTime: Float(raw), candidates: candidates)
        return result.matched == nil ? nil : Double(result.snappedTime) - raw
    }
}
