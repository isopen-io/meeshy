import CoreGraphics

/// Niveau de résistance du swipe latéral d'une bulle.
/// `.resistant` = bulle audio/vidéo avec curseur de lecture : le swipe
/// Répondre/Transférer doit être « forcé » pour ne pas gêner le scrubbing.
enum SwipeResistance { case normal, resistant }

/// Logique pure des seuils de swipe. Aucune dépendance UI — testable.
enum BubbleSwipeResistance {
    static func minimumDistance(_ r: SwipeResistance) -> CGFloat {
        switch r { case .normal: return 22; case .resistant: return 48 }
    }

    static func horizontalDominanceRatio(_ r: SwipeResistance) -> CGFloat {
        switch r { case .normal: return 3; case .resistant: return 4 }
    }

    /// Vrai si le drag doit engager le swipe (déplacer la bulle).
    /// Faux pendant un scrubbing actif ou tant que le geste n'est pas un
    /// swipe horizontal franc dépassant le seuil du niveau de résistance.
    static func shouldEngage(translationWidth h: CGFloat, translationHeight v: CGFloat,
                             isScrubbing: Bool, resistance: SwipeResistance) -> Bool {
        if isScrubbing { return false }
        let absH = abs(h)
        let absV = abs(v)
        guard absH > absV * horizontalDominanceRatio(resistance) else { return false }
        guard absH > minimumDistance(resistance) else { return false }
        return true
    }

    /// Vrai si un widget descendant possède déjà le glissement horizontal —
    /// scrubbing média (waveform/seek bar, `MediaScrubbingPreferenceKey`) OU
    /// carrousel inline ouvert (`BubbleInlinePagingPreferenceKey`) — auquel
    /// cas le swipe reply/forward doit rester désengagé. Combinaison OR :
    /// un seul des deux suffit.
    static func isGestureOwnershipClaimed(mediaScrubbing: Bool, inlinePaging: Bool) -> Bool {
        mediaScrubbing || inlinePaging
    }
}
