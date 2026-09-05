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
                color: Self.ink(spec.ink, textColor: textColor).opacity(spec.opacity),
                radius: spec.blurRadius(fontSize: Double(fontSize)),
                x: offset.x,
                y: offset.y)
        } else {
            content
        }
    }

    /// L'encre SwiftUI de la table — jumelle de
    /// `StoryTextEffectRendering.shadowColor` côté UIKit, et exhaustive pour
    /// la même raison : une encre neuve doit dire sa couleur ICI aussi, sans
    /// quoi les deux moteurs peindraient le même effet différemment.
    static func ink(_ ink: StoryTextEffectInk, textColor: Color) -> Color {
        switch ink {
        case .text:  return textColor
        case .dark:  return .black
        case .light: return .white
        // `Color(hex:)` du design system — le même lecteur que partout ailleurs
        // côté SwiftUI. Il ne rend jamais `nil` (il retombe sur du noir), donc
        // le repli vers la couleur du texte que fait le miroir UIKit n'a pas
        // d'équivalent ici : c'est une divergence CONNUE et bornée à une
        // chaîne malformée, que la table ne contient pas.
        case .tint(let hex): return Color(hex: hex)
        }
    }
}
