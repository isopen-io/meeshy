import Foundation
import SwiftUI
import MeeshyUI

// #8735 — chaque bouton de l'écran d'appel répond au premier toucher.
// #8978 — plus aucun masquage minuté : un toucher sur la scène cache le
// chrome, un autre le remet ; seul le toucher reçu pendant le fondu compte.

/// Ce que le chrome d'appel apprend d'un toucher : un doigt qui se pose, un
/// doigt qui se lève, un geste bref déjà conclu — ou un toucher reçu PENDANT
/// le fondu de disparition, qui rallume le chrome qu'il vient d'utiliser.
enum CallChromeInteraction: Equatable, Sendable {
    case touchBegan
    case touchEnded
    case tap
    case revive

    var revealsChrome: Bool { self == .revive }
}

extension CallChromeVisibility {
    /// La durée du fondu d'apparition et de disparition du chrome : celle de la
    /// pilule de verre du kit (K10), dont la loi de présence est ici un appelant mince.
    static let fadeDuration: TimeInterval = MeeshyGlassPillRecipe.stowDuration

    static var fadeDurationNanoseconds: UInt64 {
        UInt64(fadeDuration * 1_000_000_000)
    }

    /// Pendant le fondu de disparition, le bouton est encore VU : il doit
    /// encore répondre. Il ne refuse le toucher qu'une fois le fondu achevé.
    static func acceptsTouches(isVisible: Bool, hiddenFor: TimeInterval) -> Bool {
        MeeshyGlassPillPresenceRule.acceptsTouches(presence: isVisible ? .shown : .stowed, stowedFor: hiddenFor)
    }
}

/// G1.11 · G2.8 — le premier toucher RANGE le chrome vers ses bords, le second le
/// rend par le chemin inverse : rien n'apparaît ni ne disparaît d'un coup. Seules la
/// transformation et l'opacité bougent ; « Réduire les animations » les remplace par
/// un fondu court, sans déplacement.
enum CallChromeStow {
    nonisolated static let reducedFadeDuration: TimeInterval = MeeshyGlassPillRecipe.reducedStowDuration

    static func leavesByItsEdge(isVisible: Bool, reduceMotion: Bool) -> Bool {
        MeeshyGlassPillPresenceRule.leavesByItsEdge(presence: isVisible ? .shown : .stowed, reduceMotion: reduceMotion)
    }

    static func animation(reduceMotion: Bool) -> Animation {
        .easeInOut(duration: MeeshyGlassPillPresenceRule.duration(reduceMotion: reduceMotion))
    }

    /// La translation d'un élément rangé vers SON bord : toute sa hauteur MESURÉE (`extent`) plus
    /// sa marge à ce bord, si bien qu'une pilule dépliée (rangées, journal) quitte l'écran aussi
    /// entièrement que la pilule nue. Une hauteur pas encore mesurée ne compte pas.
    static func travel(toward edge: VerticalEdge, extent: CGFloat, margin: CGFloat) -> CGFloat {
        let distance = MeeshyGlassPillPresenceRule.travel(extent: extent, margin: margin)
        return edge == .top ? -distance : distance
    }
}

/// Ce que fait le toucher d'une vignette de la scène de groupe.
enum GroupStageTapOutcome: Equatable, Sendable {
    case revealChrome
    case spotlight
}

/// #8735 — chrome masqué, une vignette touchée RALLUME les commandes (comme
/// partout ailleurs sur la scène) ; chrome visible, elle se met à la une.
/// G1.9 (loi 15) — ma vignette du duo suit la même règle : `.spotlight` la permute.
enum GroupStageTapRule {
    static func outcome(isChromeVisible: Bool) -> GroupStageTapOutcome {
        isChromeVisible ? .spotlight : .revealChrome
    }
}

/// #8735 — une rangée qui se met à défiler pose un doigt sur le chrome ; une
/// rangée qui s'arrête le lève. Rien entre les deux.
enum CallChromeScrollRule {
    static func interaction(wasScrolling: Bool, isScrolling: Bool) -> CallChromeInteraction? {
        switch (wasScrolling, isScrolling) {
        case (false, true): return .touchBegan
        case (true, false): return .touchEnded
        case (false, false), (true, true): return nil
        }
    }
}
