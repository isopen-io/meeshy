import Foundation
import QuartzCore

/// **L'horloge Core Animation d'une slide : pause, seek et parcours au doigt
/// exacts, sans réévaluer un seul calque (#9865).**
///
/// Les animations des éléments vivent dans le temps LOCAL d'un calque conteneur,
/// où une seconde locale vaut une seconde de slide. Core Animation calcule ce
/// temps par `local = (parent − beginTime) × speed + timeOffset` (CAMediaTiming) :
/// - en lecture, `speed = 1`, `beginTime` = l'instant parent du départ et
///   `timeOffset` = le playhead à cet instant — le temps local suit l'horloge ;
/// - en pause ou sous le doigt, `speed = 0` et `timeOffset` = le playhead — le
///   temps local est figé à l'image demandée, quel que soit le parent.
///
/// Un tick ne pose donc plus rien par calque : au plus ces trois valeurs sur UN
/// conteneur, aux transitions (départ, pause, seek).
public nonisolated struct StoryAnimationClockState: Equatable, Sendable {
    public let speed: Float
    public let timeOffset: CFTimeInterval
    public let beginTime: CFTimeInterval
}

public nonisolated enum StoryAnimationClock {
    public static func state(playhead: Double, isRunning: Bool, parentNow: CFTimeInterval) -> StoryAnimationClockState {
        isRunning
            ? StoryAnimationClockState(speed: 1, timeOffset: playhead, beginTime: parentNow)
            : StoryAnimationClockState(speed: 0, timeOffset: playhead, beginTime: 0)
    }

    /// Le temps local (secondes de slide) que Core Animation lit à l'instant
    /// parent `parentTime` sous `state`.
    public static func localTime(of state: StoryAnimationClockState, atParentTime parentTime: CFTimeInterval) -> Double {
        (parentTime - state.beginTime) * Double(state.speed) + state.timeOffset
    }

    @MainActor
    public static func apply(_ state: StoryAnimationClockState, to layer: CALayer) {
        layer.speed = state.speed
        layer.timeOffset = state.timeOffset
        layer.beginTime = state.beginTime
    }
}
