import SwiftUI
import MeeshySDK

/// **Le rendu SwiftUI de l'axe EFFET** (#4870) — pour ce qui MONTRE un effet
/// sans être le canvas : les vignettes du panneau, la bulle de la rangée
/// flottante, un aperçu. La table vit dans le SDK core
/// (`StoryTextEffect.shadow`) ; ce modificateur ne fait que la projeter sur
/// `View.shadow(color:radius:x:y:)`, comme `StoryTextEffectRendering` le fait
/// pour UIKit.
public extension View {
    /// `fontSize` en points RENDUS : la table est en em, l'ombre suit la
    /// taille du « Aa » qui la porte.
    func storyTextEffect(_ effect: StoryTextEffect,
                         fontSize: CGFloat,
                         textColor: Color) -> some View {
        modifier(StoryTextEffectModifier(effect: effect,
                                         fontSize: fontSize,
                                         textColor: textColor))
    }
}

struct StoryTextEffectModifier: ViewModifier {
    let effect: StoryTextEffect
    let fontSize: CGFloat
    let textColor: Color

    @ViewBuilder
    func body(content: Content) -> some View {
        if let spec = effect.shadow {
            let offset = spec.offset(fontSize: Double(fontSize))
            content.shadow(
                color: (spec.usesTextColor ? textColor : Color.black).opacity(spec.opacity),
                radius: spec.blurRadius(fontSize: Double(fontSize)),
                x: offset.x,
                y: offset.y)
        } else {
            content
        }
    }
}
