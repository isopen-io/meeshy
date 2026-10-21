import CoreGraphics
import Foundation

// MARK: - Story Transition Effects

/// Les constantes de rendu ne vivent PAS ici : elles sont sur `StoryRenderer`
/// (`slideTransitionDuration`, `zoomTransitionScale`, `slideTransitionTravelFraction`),
/// lues à l'identique par l'aperçu du composer, le lecteur et l'export.
///
/// Les commentaires de ce bloc ont porté pendant un temps des valeurs propres —
/// 0,3 s / scale 0,92 / décalage Y+30 — héritées de la ré-implémentation SwiftUI
/// du lecteur. Elles CONTREDISAIENT le SDK dans le sens même de l'effet (0,92
/// zoome, quand le SDK dézoome depuis 1,08 ; Y+30 glisse verticalement, quand le
/// SDK glisse horizontalement d'une fraction de la largeur). C'est exactement la
/// divergence que `StoryOpeningParityTests` verrouille. Décrire ici un COMPORTEMENT
/// et non des nombres est ce qui empêche la contradiction de revenir par la doc.
public enum StoryTransitionEffect: String, Codable, CaseIterable, Sendable {
    /// Fondu : l'opacité monte de 0 à 1 à l'entrée, et redescend à la sortie.
    case fade
    /// Zoom : DÉzoome à l'entrée (part au-dessus de 1 et retombe), rezoome à la sortie.
    case zoom
    /// Glissement HORIZONTAL : entre depuis le bord d'attaque, sort par le bord opposé.
    case slide
    /// Révélation circulaire : un masque circulaire s'élargit à l'entrée, se resserre à la sortie.
    case reveal

    public var iconName: String {
        switch self {
        case .fade:   return "sun.max"
        case .zoom:   return "arrow.up.left.and.arrow.down.right"
        case .slide:  return "arrow.up"
        case .reveal: return "circle.dashed"
        }
    }
}
