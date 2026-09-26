import SwiftUI
import MeeshyUI

/// Le BLOC DE VERRE sur lequel le message mis en avant grossit (#8147) — le
/// message élu du mode Focal, et le message long déplié dans tous les modes.
///
/// Il remplace la carte OPAQUE teintée : iOS 26+ reçoit le vrai Liquid Glass
/// (`glassEffect`), iOS 16–25 le verre adaptatif fait main de MeeshyUI
/// (`LiquidGlassFallbackRecipe`) — un seul atome, `adaptiveLiquidGlass`,
/// porte la bascule ; aucune valeur de verre n'est recopiée ici.
///
/// La géométrie (rayon, marges) est celle de la carte qu'il remplace, et que
/// le web lit dans les mêmes jetons (`FocalScrollPerspective`,
/// `FocalMetrics.FocusCard`). Purement décoratif : aucun hit-test, masqué à
/// VoiceOver.
struct FocalGlassBlock: View, Equatable {
    let accentHex: String

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: FocalScrollPerspective.focusCardCornerRadius, style: .continuous)
    }

    /// Le verre reste NEUTRE — le texte y garde son contraste clair/sombre ;
    /// l'accent de la conversation ne tient qu'au FILET de bordure (parité
    /// web, #8147).
    var body: some View {
        Color.clear
            .adaptiveLiquidGlass(in: shape)
            .overlay(shape.strokeBorder(Color(hex: accentHex).opacity(FocalMetrics.FocusCard.glassRimOpacity), lineWidth: FocalMetrics.FocusCard.ringSize))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
