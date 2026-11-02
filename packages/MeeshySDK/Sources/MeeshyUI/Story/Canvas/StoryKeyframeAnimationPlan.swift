import Foundation
import CoreGraphics
import MeeshySDK

/// **La courbe d'un segment de keyframe, telle que Core Animation la joue (#9865).**
///
/// Chaque cas est une Bézier cubique EXACTE de la courbe `StoryEasing` qu'il
/// remplace — pas une approximation : la coordonnée temps de ses points de
/// contrôle est linéaire (1/3, 2/3), donc le temps avance uniformément le long
/// de la courbe, et l'élévation de degré d'une quadratique tombe juste.
/// `easeInOut` n'a pas d'équivalent en un segment : il se coupe en deux
/// (`quadraticIn` puis `quadraticOut`) à mi-parcours, où il vaut 0,5.
public nonisolated enum StoryKeyframeTiming: CaseIterable, Equatable, Sendable {
    case linear
    case quadraticIn
    case quadraticOut

    /// Points de contrôle de `CAMediaTimingFunction(controlPoints:)`.
    public var controlPoints: (Float, Float, Float, Float) {
        switch self {
        case .linear: return (1.0 / 3, 1.0 / 3, 2.0 / 3, 2.0 / 3)
        case .quadraticIn: return (1.0 / 3, 0, 2.0 / 3, 1.0 / 3)
        case .quadraticOut: return (1.0 / 3, 2.0 / 3, 2.0 / 3, 1)
        }
    }

    /// La fraction parcourue à la fraction de temps `u` du segment.
    public func progress(_ u: Double) -> Double {
        switch self {
        case .linear: return u
        case .quadraticIn: return u * u
        case .quadraticOut: return 1 - (1 - u) * (1 - u)
        }
    }
}

/// **Les keyframes d'un élément de story, décrits UNE fois pour Core Animation (#9865).**
///
/// Le canevas réévaluait chaque keyframe à chaque image (`StoryRenderer.applyKeyframes`
/// depuis `rebuildLayers`). Cette description est ce que Core Animation jouera
/// seul, sous une horloge pilotée par `StoryAnimationClock` : une piste par
/// canal (position, échelle, opacité), ses instants clés normalisés, ses valeurs
/// et une courbe par segment. `value(of:at:)` l'évalue comme Core Animation la
/// jouerait ; le témoin de parité la compare à l'évaluateur image par image.
///
/// Les sémantiques gardées : avant la première clé d'un canal, la couche garde
/// sa BASE (pas de remplissage arrière) ; après la dernière, la valeur est
/// TENUE. Ce que Core Animation ne jouerait pas à l'identique n'est pas décrit :
/// `make` rend `nil` (x sans y, deux clés au même instant sur un canal) et le
/// canevas garde alors l'évaluation image par image pour cet élément.
public nonisolated struct StoryKeyframeAnimationPlan: Equatable, Sendable {
    public nonisolated enum Channel: String, Equatable, Sendable {
        case position, scale, opacity
    }

    public nonisolated enum KeyValue: Equatable, Sendable {
        /// Position NORMALISÉE (0…1 de la scène), projetée au montage.
        case point(CGPoint)
        case scalar(CGFloat)
    }

    public nonisolated struct Track: Equatable, Sendable {
        public let channel: Channel
        /// Secondes depuis l'origine de la slide : `startTime` + première clé.
        public let beginTime: Double
        /// Toujours > 0 : une clé seule se tient sur une seconde, puis au-delà.
        public let duration: Double
        public let keyTimes: [Double]
        public let values: [KeyValue]
        /// Un par segment : `values.count - 1`.
        public let timings: [StoryKeyframeTiming]
    }

    public let tracks: [Track]

    public static func make(keyframes: [StoryKeyframe], startTime: Double) -> StoryKeyframeAnimationPlan? {
        let halfPositions = keyframes.contains { ($0.x == nil) != ($0.y == nil) }
        guard !halfPositions else { return nil }
        let channels: [(Channel, (StoryKeyframe) -> KeyValue?)] = [
            (.position, { kf in kf.x.flatMap { x in kf.y.map { KeyValue.point(CGPoint(x: x, y: $0)) } } }),
            (.scale, { kf in kf.scale.map { KeyValue.scalar($0) } }),
            (.opacity, { kf in kf.opacity.map { KeyValue.scalar($0) } }),
        ]
        let keys: [(Channel, [Key])] = channels.map { channel, pick in
            (channel, keyframes.compactMap { kf in pick(kf).map { Key(time: Double(kf.time), value: $0, easing: kf.easing ?? .linear) } }
                .sorted { $0.time < $1.time })
        }
        let hasTiedInstants = keys.contains { _, sorted in
            zip(sorted, sorted.dropFirst()).contains { $0.time >= $1.time }
        }
        guard !hasTiedInstants else { return nil }
        return StoryKeyframeAnimationPlan(tracks: keys.compactMap { channel, sorted in
            Self.track(channel, keys: sorted, startTime: startTime)
        })
    }

    /// La valeur que Core Animation pose à l'instant `slideTime` (secondes depuis
    /// l'origine de la slide) ; `nil` quand le canal n'est pas animé ou que sa
    /// première clé n'est pas encore atteinte (la couche garde sa base).
    public func value(of channel: Channel, at slideTime: Double) -> KeyValue? {
        guard let track = tracks.first(where: { $0.channel == channel }) else { return nil }
        let local = slideTime - track.beginTime
        guard local >= 0, let last = track.values.last else { return nil }
        let u = local / track.duration
        guard u < 1 else { return last }
        let segment = track.keyTimes.indices.dropLast().last { track.keyTimes[$0] <= u } ?? 0
        let span = track.keyTimes[segment + 1] - track.keyTimes[segment]
        let fraction = span > 0 ? (u - track.keyTimes[segment]) / span : 1
        return Self.lerp(track.values[segment], track.values[segment + 1],
                         track.timings[segment].progress(fraction))
    }

    // MARK: - Construction

    private nonisolated struct Key {
        let time: Double
        let value: KeyValue
        let easing: StoryEasing
    }

    private static func track(_ channel: Channel, keys: [Key], startTime: Double) -> Track? {
        guard let first = keys.first, let last = keys.last else { return nil }
        guard keys.count > 1 else {
            return Track(channel: channel, beginTime: startTime + first.time, duration: 1,
                         keyTimes: [0, 1], values: [first.value, first.value], timings: [.linear])
        }
        let segments = zip(keys, keys.dropFirst()).map { Self.segment($0.0, $0.1) }
        let times = [first.time] + segments.flatMap { $0.times }
        let duration = last.time - first.time
        return Track(channel: channel, beginTime: startTime + first.time, duration: duration,
                     keyTimes: times.map { ($0 - first.time) / duration },
                     values: [first.value] + segments.flatMap { $0.values },
                     timings: segments.flatMap { $0.timings })
    }

    /// Un segment `lo → hi` : ses instants et valeurs APRÈS `lo`, et ses courbes.
    private static func segment(_ lo: Key, _ hi: Key) -> (times: [Double], values: [KeyValue], timings: [StoryKeyframeTiming]) {
        switch lo.easing {
        case .linear: return ([hi.time], [hi.value], [.linear])
        case .easeIn: return ([hi.time], [hi.value], [.quadraticIn])
        case .easeOut: return ([hi.time], [hi.value], [.quadraticOut])
        case .easeInOut:
            return ([(lo.time + hi.time) / 2, hi.time],
                    [lerp(lo.value, hi.value, 0.5), hi.value],
                    [.quadraticIn, .quadraticOut])
        }
    }

    private static func lerp(_ from: KeyValue, _ to: KeyValue, _ t: Double) -> KeyValue {
        let f = CGFloat(t)
        switch (from, to) {
        case let (.point(a), .point(b)):
            return .point(CGPoint(x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f))
        case let (.scalar(a), .scalar(b)):
            return .scalar(a + (b - a) * f)
        default:
            return to
        }
    }
}
