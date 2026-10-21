import CoreGraphics
import Foundation

// MARK: - Story Effects

// MARK: - Story Canvas Aspect (forme du canvas : vertical par défaut, horizontal si fond paysage)

/// Forme du canvas d'une story. Le canvas est **vertical 9:16 par défaut** ;
/// l'import d'une image de fond **paysage** (largeur > hauteur) bascule le canvas
/// en **horizontal 16:9** — « l'import de l'image de fond impose le cadre et forme
/// du Canvas ». Décision pure, sans dépendance UI, réutilisée par le composer.
public enum StoryCanvasAspect: String, Codable, Sendable, CaseIterable {
    case portrait   // 9:16 (défaut)
    case landscape  // 16:9

    /// Ratio largeur / hauteur du canvas (portrait 0.5625, paysage 1.7778).
    public var ratio: Double {
        switch self {
        case .portrait:  return Double(SceneShape.aspect)
        case .landscape: return 1 / Double(SceneShape.aspect)
        }
    }

    /// Décide la forme du canvas depuis les dimensions d'une image de fond importée.
    /// Une image plus large que haute → canvas horizontal ; sinon (portrait ou carré,
    /// ou dimensions invalides) → canvas vertical par défaut.
    public static func from(width: Double, height: Double) -> StoryCanvasAspect {
        guard width > 0, height > 0 else { return .portrait }
        return width > height ? .landscape : .portrait
    }

    /// Reconstruit la forme depuis un ratio persisté (`canvasAspectRatio`). `nil`
    /// ou ratio ≤ 1 → portrait ; ratio > 1 → paysage.
    public static func from(ratio: Double?) -> StoryCanvasAspect {
        guard let ratio, ratio > 1 else { return .portrait }
        return .landscape
    }
}
