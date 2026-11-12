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
    case capture
    case liveFrame
}

nonisolated enum CallTopBannerStack {
    /// Hauteur de la rangée d'en-tête (cible tactile 44 pt) plus l'écart qui
    /// la sépare de la première bannière. Même valeur que le badge « micro
    /// coupé » du correspondant, posé lui aussi sous l'en-tête.
    static let headerRowClearance: CGFloat = 52

    /// P16.4 — la marge latérale de la pile : les bandeaux tiennent presque toute la largeur.
    static let horizontalMargin: CGFloat = 12

    /// P16.8 — la place que le bandeau « Vous partagez · Arrêter » prend sous l'en-tête (sa
    /// hauteur de 44 pt plus l'écart de la pile) : ma vignette descend d'autant. Un partage REÇU
    /// ne touche pas la place de la vignette (#17730).
    static func selfTileClearance(isLocalScreenShareShown: Bool) -> CGFloat {
        isLocalScreenShareShown ? headerRowClearance : 0
    }

    /// Le haut de la pile, depuis le bord de l'écran.
    static func topInset(chromeTopInset: CGFloat) -> CGFloat {
        chromeTopInset + headerRowClearance
    }

    /// Ordre fixe, quel que soit l'ordre d'arrivée : partage → enregistrement
    /// → capture (R1, #16665) → cadre. Une bannière absente ne laisse pas de trou.
    static func ordered(_ present: Set<CallTopBanner>) -> [CallTopBanner] {
        CallTopBanner.allCases.filter(present.contains)
    }
}
