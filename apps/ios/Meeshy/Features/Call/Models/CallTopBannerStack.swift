import CoreGraphics

/// APP-1 — les bannières du haut de l'appel établi (partage d'écran,
/// enregistrement, cadre en direct) forment UNE pile, ancrée sous la rangée
/// d'en-tête (`topChrome` : Réduire, Conversation, durée). Avant, chacune
/// était posée à un décalage fixe (60, 110, 160 pt depuis le bord) : sur un
/// iPhone à Dynamic Island, la première passait sous le chevron « Réduire »,
/// et deux bannières de hauteur variable se chevauchaient.
nonisolated enum CallTopBanner: Int, CaseIterable, Sendable {
    case screenShare
    case recording
    case liveFrame
}

nonisolated enum CallTopBannerStack {
    /// Hauteur de la rangée d'en-tête (cible tactile 44 pt) plus l'écart qui
    /// la sépare de la première bannière. Même valeur que le badge « micro
    /// coupé » du correspondant, posé lui aussi sous l'en-tête.
    static let headerRowClearance: CGFloat = 52

    /// Le haut de la pile, depuis le bord de l'écran.
    static func topInset(chromeTopInset: CGFloat) -> CGFloat {
        chromeTopInset + headerRowClearance
    }

    /// Ordre fixe, quel que soit l'ordre d'arrivée : partage → enregistrement
    /// → cadre. Une bannière absente ne laisse pas de trou.
    static func ordered(_ present: Set<CallTopBanner>) -> [CallTopBanner] {
        CallTopBanner.allCases.filter(present.contains)
    }
}
