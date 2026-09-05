import UIKit
import QuartzCore
import MeeshySDK

/// **Le rendu UIKit de l'axe EFFET** (#4870) — un site pour les trois moteurs
/// qui peignent un texte de story côté UIKit : le calque du canvas
/// (`StoryTextLayer`, ombre `CALayer`), l'éditeur en ligne
/// (`StoryInlineTextEditor`, `NSShadow` TextKit) et le composite cover /
/// thumbHash (`StorySlideRenderer`, `NSShadow` TextKit). La TABLE vit dans le
/// SDK core (`StoryTextEffect.shadow`) ; ici on ne fait que la projeter sur
/// les primitives Apple, une fois, pour qu'aucun des trois ne refasse la
/// conversion em → points ni le choix de couleur.
///
/// `nonisolated` : projection PURE, sans état main-actor, appelable depuis
/// n'importe quel contexte — ce qui laisse la porte ouverte à un appelant hors
/// main actor sans que ce type ait à changer. Aujourd'hui ses trois appelants
/// tournent tous sur le main actor (`StorySlideRenderer` compris : il est
/// MainActor-isolé par le défaut du package, cf. `StoryThumbHashEnricher`).
/// Seules les mutations de `CALayer` sont `@MainActor`.
public nonisolated enum StoryTextEffectRendering {

    /// Couleur de l'ombre : l'encre de la table, à l'opacité de la table.
    ///
    /// Le `switch` est EXHAUSTIF sur `StoryTextEffectInk` : une quatrième
    /// encre ne compilera pas tant qu'elle n'aura pas dit quelle couleur elle
    /// vaut ici — plutôt que d'hériter du noir par un `default`, ce qui
    /// rendrait l'effet neuf visuellement identique à une ombre.
    public static func shadowColor(_ shadow: StoryTextEffectShadow,
                                   textColor: UIColor) -> UIColor {
        let base: UIColor
        switch shadow.ink {
        case .text:  base = textColor
        case .dark:  base = .black
        case .light: base = .white
        }
        return base.withAlphaComponent(CGFloat(shadow.opacity))
    }

    /// L'`NSShadow` TextKit d'un texte pour une taille de police RENDUE, ou
    /// `nil` sans effet — l'attribut `.shadow` ne se pose alors pas du tout.
    public static func nsShadow(for text: StoryTextObject,
                                fontSize: CGFloat,
                                textColor: UIColor) -> NSShadow? {
        guard let spec = text.parsedTextEffect.shadow else { return nil }
        let offset = spec.offset(fontSize: Double(fontSize))
        let shadow = NSShadow()
        shadow.shadowColor = shadowColor(spec, textColor: textColor)
        shadow.shadowOffset = CGSize(width: offset.x, height: offset.y)
        shadow.shadowBlurRadius = spec.blurRadius(fontSize: Double(fontSize))
        return shadow
    }

    /// Pose l'ombre de `effect` sur `layer`, et rasterise la calque : une
    /// ombre `CALayer` sans `shadowPath` se recalcule hors écran à chaque
    /// image, et un texte n'a pas de tracé simple — la rasterisation met le
    /// résultat en cache tant que le contenu ne change pas, ce qui est le cas
    /// entre deux `configure`.
    @MainActor
    public static func apply(_ effect: StoryTextEffect,
                             to layer: CALayer,
                             fontSize: CGFloat,
                             textColor: UIColor,
                             rasterizationScale: CGFloat) {
        guard let spec = effect.shadow else {
            clear(layer)
            return
        }
        let offset = spec.offset(fontSize: Double(fontSize))
        layer.shadowColor = shadowColor(spec, textColor: textColor).cgColor
        layer.shadowOpacity = 1
        layer.shadowOffset = CGSize(width: offset.x, height: offset.y)
        layer.shadowRadius = spec.blurRadius(fontSize: Double(fontSize))
        layer.shouldRasterize = true
        layer.rasterizationScale = rasterizationScale
    }

    /// Retire toute ombre — `configure` est idempotent, et une calque
    /// réutilisée ne doit pas garder l'effet d'un objet précédent. Ne touche
    /// pas `shouldRasterize`, que le calque règle pour d'autres raisons.
    @MainActor
    public static func clear(_ layer: CALayer) {
        layer.shadowColor = nil
        layer.shadowOpacity = 0
        layer.shadowOffset = .zero
        layer.shadowRadius = 0
    }
}
