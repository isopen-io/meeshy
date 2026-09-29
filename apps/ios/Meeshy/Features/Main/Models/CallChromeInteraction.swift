import Foundation

// #8735 — chaque bouton de l'écran d'appel répond au premier toucher. Le
// masquage automatique (4 s) comptait depuis la dernière APPARITION : un
// bouton pressé, une rangée défilée ne le relançaient pas, et le chrome
// s'éteignait sous le doigt — le toucher suivant ne faisait que le rallumer.

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

/// Les touchers en cours sur le chrome et leur révision. Chaque interaction
/// fait avancer la révision — c'est elle qui réarme le compte à rebours — et
/// tant qu'un doigt est posé, rien ne se masque.
struct CallChromeTouches: Equatable, Sendable {
    let revision: Int
    let activeCount: Int

    init(revision: Int = 0, activeCount: Int = 0) {
        self.revision = revision
        self.activeCount = max(0, activeCount)
    }

    var isTouching: Bool { activeCount > 0 }

    func noting(_ interaction: CallChromeInteraction) -> CallChromeTouches {
        switch interaction {
        case .touchBegan:
            return CallChromeTouches(revision: revision &+ 1, activeCount: activeCount + 1)
        case .touchEnded:
            return CallChromeTouches(revision: revision &+ 1, activeCount: activeCount - 1)
        case .tap, .revive:
            return CallChromeTouches(revision: revision &+ 1, activeCount: activeCount)
        }
    }

    /// Un sous-arbre qui disparaît sous le doigt ne rendra jamais son
    /// « doigt levé » : on repart d'un chrome sans toucher, sans perdre la
    /// révision (le compte à rebours repart).
    func released() -> CallChromeTouches {
        CallChromeTouches(revision: revision &+ 1, activeCount: 0)
    }
}

/// La clé du compte à rebours : il repart quand le chrome apparaît, quand la
/// couche change (menu, panneau, mode) ET à chaque interaction.
struct AutoHideKey: Equatable {
    let isVisible: Bool
    let layer: CallScreenLayer
    let interactionRevision: Int
}

extension CallChromeVisibility {
    /// La durée du fondu d'apparition et de disparition du chrome.
    static let fadeDuration: TimeInterval = 0.25

    static var fadeDurationNanoseconds: UInt64 {
        UInt64(fadeDuration * 1_000_000_000)
    }

    /// Jamais sous un doigt posé : un bouton maintenu, une rangée qui défile.
    static func mayAutoHide(
        isVideoStage: Bool,
        isPanelOpen: Bool,
        isOnMac: Bool,
        isVoiceOverRunning: Bool,
        isTouching: Bool
    ) -> Bool {
        !isTouching && mayAutoHide(
            isVideoStage: isVideoStage,
            isPanelOpen: isPanelOpen,
            isOnMac: isOnMac,
            isVoiceOverRunning: isVoiceOverRunning
        )
    }

    /// Pendant le fondu de disparition, le bouton est encore VU : il doit
    /// encore répondre. Il ne refuse le toucher qu'une fois le fondu achevé.
    static func acceptsTouches(isVisible: Bool, hiddenFor: TimeInterval) -> Bool {
        isVisible || hiddenFor < fadeDuration
    }
}

/// Ce que fait le toucher d'une vignette de la scène de groupe.
enum GroupStageTapOutcome: Equatable, Sendable {
    case revealChrome
    case spotlight
}

/// #8735 — chrome masqué, une vignette touchée RALLUME les commandes (comme
/// partout ailleurs sur la scène) ; chrome visible, elle se met à la une.
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
