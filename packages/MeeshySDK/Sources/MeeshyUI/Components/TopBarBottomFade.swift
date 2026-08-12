import SwiftUI

/// Fondu du bord bas des barres de chrome supérieures (retour user
/// 2026-08-12) : une barre immersive ne se termine pas en arête nette — les
/// 6 % inférieurs de sa hauteur sont totalement transparents, surmontés d'une
/// zone de dégradé (~24 %, dans la fourchette 20–30 % demandée) qui remonte
/// vers la pleine opacité.
///
/// Vit dans MeeshyUI (et non dans l'app) : composant atomique aux paramètres
/// opaques — des bandes et une rampe, aucune règle produit — ET les cibles
/// SPM sont globées automatiquement, là où un fichier app neuf n'entre dans
/// le pbxproj committé qu'à la régénération XcodeGen (le build local
/// `meeshy.sh` ne le voyait pas : « cannot find TopBarBottomFade in scope »).
///
/// Consommateur : `FloatingCallPillView` (app) — masque alpha sur le décor
/// indigo (brandGradient + scrim) de la bannière d'appel réduite. (Le scrim
/// status bar de ConversationView l'a utilisé brièvement puis a été RETIRÉ —
/// retour user 2026-08-12, pas de barre noire en conversation ; cf.
/// `ConversationTopChromeFadeTests`.)
public enum TopBarBottomFade {
    /// Fraction inférieure de la hauteur totalement transparente.
    public nonisolated static let transparentFraction: CGFloat = 0.06
    /// Hauteur de la zone de dégradé transparent → pleine opacité.
    public nonisolated static let gradientFraction: CGFloat = 0.24
    /// Emplacement (unité 0–1 depuis le HAUT) où l'opacité commence à décroître.
    public nonisolated static var fadeStartLocation: CGFloat { 1 - transparentFraction - gradientFraction }
    /// Emplacement où l'opacité atteint zéro (début de la bande transparente).
    public nonisolated static var fullyTransparentLocation: CGFloat { 1 - transparentFraction }

    /// Rampe verticale noir → transparent portant les bandes ci-dessus :
    /// opaque du haut jusqu'à `fadeStartLocation`, dégradé jusqu'à
    /// `fullyTransparentLocation`, transparent jusqu'au bord bas. Posée en
    /// `.mask()` = rampe d'alpha sur un décor coloré (bannière d'appel).
    public static var gradient: LinearGradient {
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
