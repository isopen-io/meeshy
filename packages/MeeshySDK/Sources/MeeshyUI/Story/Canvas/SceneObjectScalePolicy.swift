import Foundation

/// **Jusqu'où un objet posé grandit et rapetisse** — une règle, trois gestes
/// (#4722, #14299 ; jumelle Android #14298).
///
/// Le pinch UIKit du canvas, le `MagnificationGesture` de la puce son et ses
/// actions d'accessibilité bornent la même grandeur. Deux littéraux pour une
/// grandeur divergent au premier ajustement de l'un, sans qu'aucun témoin ne
/// rougisse : chacun reste juste vis-à-vis de lui-même. La grandeur a donc un
/// site unique.
///
/// ## La règle
///
/// - **Agrandir n'a aucun plafond.** La seule garde est une échelle finie et
///   strictement positive.
/// - **Réduire s'arrête quand le plus petit côté RENDU de l'objet vaut
///   `minimumRenderedSide` pixels de la scène de référence 1080 × 1920** —
///   celle où `baseSize`, `fontSize` et l'export sont exprimés. Le plancher ne
///   dépend donc pas de l'écran de l'auteur : la même échelle donne la même
///   taille chez le lecteur, dans la vignette et dans l'export.
/// - **Le plancher est une règle du GESTE.** Ce qui lit une échelle écrite
///   (lecteur, carte, export) passe par `sanitized`, qui ne borne rien.
///
/// Le média de FOND n'est pas un objet posé : son pinch relève du cadrage et
/// garde ses bornes, `backgroundRange`.
public nonisolated enum SceneObjectScalePolicy {

    public static let minimumRenderedSide: Double = 5

    public static let backgroundRange: ClosedRange<Double> = 0.3...4.0

    /// La plus petite échelle d'un objet dont le plus petit côté, à l'échelle
    /// 1, mesure `unitSide` pixels de la scène de référence.
    public static func floor(unitSide: Double) -> Double {
        minimumRenderedSide / unitSide
    }

    /// L'échelle retenue pour `base` multipliée par le facteur du geste.
    ///
    /// Prend les DEUX termes plutôt que le produit : la composition et la
    /// garde sont le même appel. Un produit non fini (débordement, geste
    /// dégénéré) laisse l'objet où il était. Un `unitSide` qui ne mesure rien
    /// ne permet pas de prouver le plancher : le geste grandit encore, il ne
    /// réduit plus.
    public static func settled(base: Double, gestureScale: Double, unitSide: Double) -> Double {
        let depart = sanitized(base)
        let voulu = depart * gestureScale
        guard voulu.isFinite, voulu > 0 else { return depart }
        guard unitSide.isFinite, unitSide > 0 else { return max(depart, voulu) }
        return max(floor(unitSide: unitSide), voulu)
    }

    /// L'échelle retenue pour le pinch du média de FOND.
    public static func settledBackground(base: Double, gestureScale: Double) -> Double {
        let voulu = sanitized(base) * gestureScale
        guard voulu.isFinite, voulu > 0 else { return sanitized(base) }
        return min(backgroundRange.upperBound, max(backgroundRange.lowerBound, voulu))
    }

    /// Une échelle déjà écrite, telle qu'un rendu doit la lire.
    ///
    /// **Zéro, négatif ou non fini se ramène à l'IDENTITÉ.** Zéro fait
    /// disparaître l'objet et un négatif le retourne : ce ne sont pas de
    /// petites tailles, ce sont des valeurs qu'aucun geste ne produit.
    public static func sanitized(_ scale: Double) -> Double {
        guard scale > 0, scale.isFinite else { return 1 }
        return scale
    }
}
