import SwiftUI
import MeeshyUI

/// Le BLOC DE VERRE sur lequel le message mis en avant grossit (#8147) — le
/// message élu du mode Focal, et le message long déplié dans tous les modes.
///
/// **La MÊME matière que le panneau de la barre de composition** (#8506,
/// directive porteur 2026-09-28 : « le bloc de verre ne ressemble pas au verre
/// qu'on a dans universal composer bar ! Ce doit être le vrai verre de 26
/// quand disponible ») : `adaptiveLiquidGlass(in:)` SANS teinte, comme
/// `UniversalComposerBar` au repos — `glassEffect(.regular, in:)` sur iOS 26+,
/// le verre fait main de MeeshyUI (`LiquidGlassFallbackRecipe`) en dessous.
///
/// Le FILET d'accent qui le bordait (1,5 pt à 0,55) a disparu avec cette
/// directive : il faisait du verre une carte bordée, ce que le composer n'est
/// pas. Aucune valeur de verre n'est recopiée ici.
///
/// Le verre se pose sur une FORME remplie (un vrai contenu de la taille du
/// bloc), jamais sur un `Color.clear` nu. Purement décoratif : aucun
/// hit-test, masqué à VoiceOver.
struct FocalGlassBlock: View, Equatable {

    static let shape = RoundedRectangle(cornerRadius: FocalScrollPerspective.focusCardCornerRadius, style: .continuous)

    var body: some View {
        Self.shape
            .fill(Color.clear)
            .adaptiveLiquidGlass(in: Self.shape)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
