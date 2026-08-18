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

    /// Direction du swipe REPLY (signe de la translation qui commite une
    /// réponse). Rangée plate (Script, `uniformFlatRow`) : géométrie
    /// UNIFORME — tous les messages étant alignés pareil, reply = glisser à
    /// DROITE (+1) et forward = glisser à GAUCHE, indépendamment de
    /// l'expéditeur (directive user 2026-08-18). Bulles : convention
    /// historique — le côté qui « pointe vers l'expéditeur »
    /// (`isMine ? -1 : +1`), inchangée bit-à-bit.
    static func replyDirection(uniformFlatRow: Bool, isMine: Bool) -> CGFloat {
        uniformFlatRow ? 1 : (isMine ? -1 : 1)
    }

    /// Bord où l'indicateur (icône reply/forward, tampon date) apparaît.
    /// Rangée plate : le bord que la rangée LIBÈRE en glissant — gauche
    /// quand on glisse à droite (reply, icône à GAUCHE), droite quand on
    /// glisse à gauche (forward, icône à DROITE). Bulles : bord historique
    /// fixe selon l'expéditeur.
    enum IndicatorEdge { case leading, trailing }
    static func indicatorEdge(uniformFlatRow: Bool, isMine: Bool, offset: CGFloat) -> IndicatorEdge {
        guard uniformFlatRow else { return isMine ? .trailing : .leading }
        return offset < 0 ? .trailing : .leading
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
