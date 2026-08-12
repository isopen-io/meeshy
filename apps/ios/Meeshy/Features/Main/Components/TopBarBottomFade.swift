import SwiftUI

/// Fondu du bord bas des barres de chrome supérieures (retour user
/// 2026-08-12) : une barre immersive ne se termine pas en arête nette — les
/// 6 % inférieurs de sa hauteur sont totalement transparents, surmontés d'une
/// zone de dégradé (~24 %, dans la fourchette 20–30 % demandée) qui remonte
/// vers la pleine opacité.
///
/// Consommateur : `FloatingCallPillView` — masque alpha sur le décor indigo
/// (brandGradient + scrim) de la bannière d'appel réduite. (Le scrim status
/// bar de ConversationView l'a utilisé brièvement puis a été RETIRÉ — retour
/// user 2026-08-12, pas de barre noire en conversation ; cf.
/// `ConversationTopChromeFadeTests`.)
enum TopBarBottomFade {
    /// Fraction inférieure de la hauteur totalement transparente.
    nonisolated static let transparentFraction: CGFloat = 0.06
    /// Hauteur de la zone de dégradé transparent → pleine opacité.
    nonisolated static let gradientFraction: CGFloat = 0.24
    /// Emplacement (unité 0–1 depuis le HAUT) où l'opacité commence à décroître.
    nonisolated static var fadeStartLocation: CGFloat { 1 - transparentFraction - gradientFraction }
    /// Emplacement où l'opacité atteint zéro (début de la bande transparente).
    nonisolated static var fullyTransparentLocation: CGFloat { 1 - transparentFraction }

    /// Rampe verticale noir → transparent portant les bandes ci-dessus :
    /// opaque du haut jusqu'à `fadeStartLocation`, dégradé jusqu'à
    /// `fullyTransparentLocation`, transparent jusqu'au bord bas. Posée en
    /// `.mask()` = rampe d'alpha sur un décor coloré (bannière d'appel).
    static var gradient: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: .black, location: 0),
                .init(color: .black, location: fadeStartLocation),
                .init(color: .black.opacity(0), location: fullyTransparentLocation),
                .init(color: .black.opacity(0), location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}
