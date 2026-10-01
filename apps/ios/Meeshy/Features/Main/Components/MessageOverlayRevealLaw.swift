import CoreGraphics

/// **Glisser vers le haut réduit l'aperçu pour dégager le menu coupé**
/// (directive porteur 2026-10-01, #9043).
///
/// Un long message élevé par l'appui long pousse le menu d'actions sous le bas
/// de l'écran. Le glissement vertical PILOTE un facteur de réduction de
/// l'aperçu (ancré en haut) : le menu remonte EXACTEMENT de ce que le doigt
/// parcourt — suivi image par image, annulable en redescendant (directive
/// « gestes progressifs et annulables », `apps/ios/CLAUDE.md`).
///
/// Le doigt sert d'abord la réduction, puis le RESTE du parcours nourrit le
/// geste existant (`MessageOverlayDragLaw` : « Plus… » vers le haut, fermeture
/// vers le bas). Un message court, dont le menu tient déjà à l'écran, n'a rien
/// à réduire (`floor == 1`) : tout le parcours va au geste existant, inchangé.
///
/// Au relâchement, l'état atteint est GARDÉ, sans aimant : l'utilisateur a
/// choisi une taille pour lire le menu ; un aimant la lui reprendrait ou la
/// pousserait plus loin qu'il ne l'a voulu. Redescendre rend la taille.
///
/// Miroir web : `apps/web/src/lib/view/message-menu-reveal.ts`.
enum MessageOverlayRevealLaw {
    /// L'aperçu ne descend jamais sous 40 % de sa taille de repos.
    static let minimumFactor: CGFloat = 0.4

    struct Split: Equatable {
        /// Le facteur de réduction rendu (1 = taille de repos).
        let factor: CGFloat
        /// Le parcours que la réduction n'a pas consommé — il va au geste
        /// existant (`MessageOverlayDragLaw`).
        let residual: CGFloat
    }

    /// Le plancher du facteur : juste ce qu'il faut pour que le menu caché de
    /// `hiddenHeight` remonte entièrement, jamais sous `minimumFactor`.
    /// `shrinkableHeight` est la hauteur VISIBLE de l'aperçu au repos.
    static func floor(hiddenHeight: CGFloat, shrinkableHeight: CGFloat) -> CGFloat {
        guard hiddenHeight > 0, shrinkableHeight > 0 else { return 1 }
        return max(minimumFactor, 1 - hiddenHeight / shrinkableHeight)
    }

    /// Partage un parcours vertical (négatif = vers le haut) entre la réduction
    /// de l'aperçu, partie de `committed`, et le geste existant.
    static func split(translation: CGFloat, committed: CGFloat, floor: CGFloat, shrinkableHeight: CGFloat) -> Split {
        guard shrinkableHeight > 0 else { return Split(factor: 1, residual: translation) }
        let factor = min(1, max(floor, committed + translation / shrinkableHeight))
        let consumed = (factor - committed) * shrinkableHeight
        return Split(factor: factor, residual: translation - consumed)
    }

    /// De combien le menu remonte pour un facteur donné.
    static func rise(factor: CGFloat, shrinkableHeight: CGFloat) -> CGFloat {
        (1 - factor) * shrinkableHeight
    }

    /// Le facteur à l'ouverture. Sous VoiceOver, le menu doit être atteignable
    /// SANS le geste : l'overlay s'ouvre déjà réduit, menu entièrement visible.
    static func restingFactor(floor: CGFloat, assistiveReveal: Bool) -> CGFloat {
        assistiveReveal ? floor : 1
    }
}
