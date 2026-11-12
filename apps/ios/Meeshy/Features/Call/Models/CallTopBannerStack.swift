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

    /// Le plancher d'un bandeau (cible tactile) et l'écart que la pile met entre deux bandeaux
    /// (`MeeshySpacing.sm`, tenu égal par un témoin) : le même écart sépare le dernier de ma vignette.
    static let bannerMinimumHeight: CGFloat = 44
    static let bannerGap: CGFloat = 8

    /// #17791 (R1.6, R3.10) — les bandeaux dont la place revient à ma vignette. Un partage REÇU n'y
    /// est pas : sa place est en décision porteur (#17730).
    static func countedForSelfTile(isLocalScreenShareShown: Bool, isRecordingShown: Bool, isCaptureAlertShown: Bool) -> Set<CallTopBanner> {
        var counted: Set<CallTopBanner> = []
        if isLocalScreenShareShown { counted.insert(.screenShare) }
        if isRecordingShown { counted.insert(.recording) }
        if isCaptureAlertShown { counted.insert(.capture) }
        return counted
    }

    /// #17791 — la place que la pile prend sous l'en-tête : ma vignette descend d'autant. Chaque
    /// bandeau compte sa hauteur MESURÉE (une puce à deux lignes, un nom long), jamais moins que le
    /// plancher tant qu'il n'a pas rendu sa mesure.
    static func selfTileClearance(counted: Set<CallTopBanner>, heights: [CallTopBanner: CGFloat]) -> CGFloat {
        ordered(counted).reduce(0) { $0 + max(heights[$1] ?? 0, bannerMinimumHeight) + bannerGap }
    }

    /// #17833 — les bandeaux présents à l'écran : un partage (le mien ou reçu), l'enregistrement, la
    /// capture, le cadre en direct. Le site UNIQUE de la présence, que la pile et la grille lisent.
    static func present(isScreenShareShown: Bool, isRecordingShown: Bool, isCaptureAlertShown: Bool, isLiveFrameShown: Bool) -> Set<CallTopBanner> {
        var present = countedForSelfTile(isLocalScreenShareShown: isScreenShareShown, isRecordingShown: isRecordingShown, isCaptureAlertShown: isCaptureAlertShown)
        if isLiveFrameShown { present.insert(.liveFrame) }
        return present
    }

    /// #17833 (L4.11) — en groupe, la grille cède sa place à la pile au lieu de passer dessous : MÊME loi
    /// que ma vignette de duo, mais tous les bandeaux présents comptent (un partage reçu aussi, le cadre
    /// en direct aussi), puisque la grille n'a pas de coin à se garder.
    static func groupGridClearance(present: Set<CallTopBanner>, heights: [CallTopBanner: CGFloat]) -> CGFloat {
        selfTileClearance(counted: present, heights: heights)
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
