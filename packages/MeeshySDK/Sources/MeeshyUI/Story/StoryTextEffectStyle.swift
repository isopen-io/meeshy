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
            let shadowed = content.shadow(
                color: Self.ink(spec.ink, textColor: textColor).opacity(spec.opacity),
                radius: spec.blurRadius(fontSize: Double(fontSize)),
                x: offset.x,
                y: offset.y)
            if effect.burns {
                burning(shadowed, glyphs: content)
            } else {
                shadowed
            }
        } else {
            content
        }
    }

    /// **La Flamme figée d'une vignette** (#17112) : les lettres prennent la
    /// chaleur du feu, et une flamme floue née de leur silhouette monte
    /// au-dessus d'elles. Image FIXE et déterministe — la vignette compare des
    /// effets, elle ne joue pas ; le feu animé vit sur le canvas
    /// (`StoryFlameLayer`), dont elle reprend le dégradé de chaleur.
    private func burning<Shadowed: View>(_ shadowed: Shadowed, glyphs: Content) -> some View {
        let lick = StoryFlameTextRenderer.lickHeight(fontSize: fontSize)
        return shadowed
            .overlay {
                LinearGradient(stops: Self.heatStops(lickFraction: 0), startPoint: .top, endPoint: .bottom)
                    .mask { glyphs }
            }
            .background {
                LinearGradient(stops: Self.heatStops(lickFraction: 0.6), startPoint: .top, endPoint: .bottom)
                    .mask { glyphs.blur(radius: fontSize * 0.10) }
                    .scaleEffect(x: 0.9, y: 1.4, anchor: .bottom)
                    .offset(y: -lick * 0.15)
            }
    }

    static func heatStops(lickFraction: Double) -> [Gradient.Stop] {
        StoryFlameTextRenderer.heatStops(lickFraction: lickFraction).map { stop in
            Gradient.Stop(color: Color(hex: stop.hex).opacity(stop.alpha), location: stop.location)
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
