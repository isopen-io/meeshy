import SwiftUI
import MeeshyUI

/// Décor et vérification de contraste WCAG (1.4.3 texte, 1.4.11 composants
/// UI/graphiques) de la bannière d'appel réduite (`FloatingCallPillView`).
///
/// Retour user 2026-08-12 (second passage) : la bannière est un aplat
/// PLEINEMENT indigo — plus de voile noir semi-opaque (l'ancien scrim 40 %
/// la faisait lire comme une « barre noire »), plus de fondu transparent en
/// bas. Le contraste est obtenu par le CHOIX DES ARRÊTS du dégradé (600→800,
/// même famille que `brandGradient`, un cran plus profonds) et par des
/// teintes d'état recalibrées pour cette surface — jamais à l'œil, toujours
/// par test (`CallBannerContrastTests`).
enum CallBannerContrast {
    /// Arrêt haut du dégradé de la bannière. Blanc : 6.3:1.
    nonisolated static var bannerTop: Color { MeeshyColors.indigo600 }
    /// Arrêt bas du dégradé de la bannière. Blanc : 9.9:1.
    nonisolated static var bannerBottom: Color { MeeshyColors.indigo800 }

    /// Teinte des états « rupture réseau » (glyphe reconnexion, micro coupé)
    /// SUR CETTE SURFACE : `MeeshyColors.error` (#F87171) ne tient que
    /// 2.27:1 contre l'arrêt haut — `errorSoft` (#FCA5A5) passe 3.3:1/5.2:1.
    nonisolated static var errorStateTint: Color { MeeshyColors.errorSoft }
    /// Teinte « haut-parleur actif » sur cette surface : `indigo400` ne tient
    /// que 2.1:1 contre l'arrêt haut — `indigo200` passe 4.2:1/6.7:1.
    nonisolated static var speakerActiveTint: Color { MeeshyColors.indigo200 }

    /// Ratio de contraste WCAG entre deux couleurs (formule sRGB relative
    /// luminance standard). Symétrique — l'ordre des arguments n'importe pas.
    nonisolated static func contrastRatio(_ a: Color, _ b: Color) -> Double {
        let l1 = Double(a.luminance)
        let l2 = Double(b.luminance)
        let lighter = max(l1, l2)
        let darker = min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }
}
