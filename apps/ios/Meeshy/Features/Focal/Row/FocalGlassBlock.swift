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

// MARK: - La loupe de l'élu, sur son seul contenu (#8537)

/// Ce que le contenu grossi de l'élu dit au cadre et à la bande qui
/// l'entourent : ses bornes (avant la loupe) et l'échelle qu'il porte.
struct FocalElectedContent {
    let bounds: Anchor<CGRect>
    let scale: CGFloat
}

struct FocalElectedContentKey: PreferenceKey {
    static let defaultValue: FocalElectedContent? = nil
    static func reduce(value: inout FocalElectedContent?, nextValue: () -> FocalElectedContent?) {
        value = value ?? nextValue()
    }
}

/// **La loupe de l'élu Focal ne grossit que son CONTENU** (#8537, directive
/// porteur 2026-09-28 : « seul le contenu grandit : la date, le bouton de
/// changement de langue, l'auteur et son avatar doivent rester à la taille
/// originale »). Elle vivait sur le calque UIKit de la cellule entière
/// (`FocalScrollPerspective.magnifyElected`), qui agrandissait tout ce que la
/// rangée porte.
///
/// Posée sur le bord haut d'ATTAQUE du contenu (le sens de lecture) : la
/// première lettre reste à sa place, le reste grandit vers la fin de ligne et
/// vers le bas. Un effet de RENDU — la hauteur de rangée ne change pas. Hors
/// élection, échelle 1 : la rangée Script reste plate.
struct FocalElectedLoupe: ViewModifier {
    let isFocused: Bool
    let rowWidth: CGFloat?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var scale: CGFloat {
        guard isFocused, let rowWidth else { return 1 }
        return FocalScrollPerspective.electedScale(reduceMotion: reduceMotion, rowWidth: rowWidth)
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale, anchor: .topLeading)
            .animation(.easeOut(duration: FocalMetrics.Scene.enterDuration), value: scale)
            .anchorPreference(key: FocalElectedContentKey.self, value: .bounds) { bounds in
                isFocused ? FocalElectedContent(bounds: bounds, scale: scale) : nil
            }
    }
}

extension View {
    func focalElectedLoupe(isFocused: Bool, rowWidth: CGFloat?) -> some View {
        modifier(FocalElectedLoupe(isFocused: isFocused, rowWidth: rowWidth))
    }
}
