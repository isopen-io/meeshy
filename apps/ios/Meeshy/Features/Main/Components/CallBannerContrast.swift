import SwiftUI
import MeeshyUI

/// Vérification de contraste WCAG (1.4.3 texte, 1.4.11 composants UI/graphiques)
/// pour le contenu de la bannière d'appel plein-écran, posé sur l'aplat
/// `MeeshyColors.brandGradient` + un scrim noir semi-opaque.
///
/// Le scrim est calibré par test (`CallBannerContrastTests`), jamais à l'œil —
/// voir la spec `docs/superpowers/specs/2026-08-11-global-chrome-banner-stacking-design.md`
/// §Partie 2 pour les ratios mesurés sur le dégradé brut (aucun ne passait).
enum CallBannerContrast {
    /// Opacité du scrim noir appliqué entre `MeeshyColors.brandGradient` et le
    /// contenu de la bannière d'appel. Calibrée pour que TOUS les éléments de
    /// `FloatingCallPillView` passent leur seuil WCAG contre LES DEUX arrêts
    /// du dégradé — voir `CallBannerContrastTests.test_scrimCalibration_*`.
    nonisolated static let scrimOpacity: Double = 0.40

    /// Ratio de contraste WCAG entre deux couleurs (formule sRGB relative
    /// luminance standard). Symétrique — l'ordre des arguments n'importe pas.
    nonisolated static func contrastRatio(_ a: Color, _ b: Color) -> Double {
        let l1 = Double(a.luminance)
        let l2 = Double(b.luminance)
        let lighter = max(l1, l2)
        let darker = min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }

    /// Couleur résultante d'un scrim noir semi-opaque posé sur `background` —
    /// composition alpha canal par canal, PUIS luminance recalculée sur le
    /// résultat. Ne JAMAIS mettre à l'échelle la luminance directement : la
    /// formule WCAG applique une correction gamma non linéaire par canal, une
    /// mise à l'échelle de la luminance finale serait fausse.
    nonisolated static func scrimmed(_ background: Color, scrimOpacity: Double) -> Color {
        let ui = UIColor(background)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getRed(&r, green: &g, blue: &b, alpha: &a) else { return background }
        let factor = 1 - scrimOpacity
        return Color(red: r * factor, green: g * factor, blue: b * factor)
    }
}
