import SwiftUI

/// Ce que l'hôte demande à la pilule : la montrer, la resserrer autour de son
/// dessus (la rangée se replie dans le même verre), ou la ranger par son bord.
public nonisolated enum MeeshyGlassPillPresence: String, Sendable, Equatable, CaseIterable {
    case shown
    case withoutRow
    case stowed

    public var isStowed: Bool { self == .stowed }

    /// La rangée est dans l'arbre sauf quand l'hôte la replie.
    public var showsRow: Bool { self != .withoutRow }
}

/// **La loi du retrait** : la pilule sort par son bord (toute sa hauteur
/// mesurée plus sa marge) et fond, en 250 ms ; elle répond jusqu'au TERME du
/// fondu, car un bouton encore vu doit encore répondre. « Réduire les
/// animations » : un fondu de 150 ms, rien ne se déplace.
public nonisolated enum MeeshyGlassPillPresenceRule {

    public static func duration(reduceMotion: Bool) -> TimeInterval {
        reduceMotion ? MeeshyGlassPillRecipe.reducedStowDuration : MeeshyGlassPillRecipe.stowDuration
    }

    public static func leavesByItsEdge(presence: MeeshyGlassPillPresence, reduceMotion: Bool) -> Bool {
        presence.isStowed && !reduceMotion
    }

    /// Une hauteur pas encore mesurée, négative ou infinie ne compte pas.
    public static func travel(extent: CGFloat, margin: CGFloat) -> CGFloat {
        (extent.isFinite ? max(extent, 0) : 0) + margin
    }

    public static func acceptsTouches(
        presence: MeeshyGlassPillPresence,
        stowedFor: TimeInterval,
        reduceMotion: Bool = false
    ) -> Bool {
        !presence.isStowed || stowedFor < duration(reduceMotion: reduceMotion)
    }
}
