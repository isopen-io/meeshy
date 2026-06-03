import Foundation
import CoreGraphics

/// Mappe le driver de pression `[0,1]` vers une largeur effective. Fonction pure unique,
/// partagée live + baked. Legacy (`captureVersion == 0`) → `base` constant (non-régression).
///
/// **La largeur choisie au pinceau est le PLAFOND** (atteint au trait LENT / forte pression) ;
/// les tracés RAPIDES / pression légère **affinent** le trait (user 2026-06-03 « lent = largeur
/// choisie, rapide on raffine »). Driver 1 (lent / forte pression) → largeur choisie exacte
/// (`maxPressureFactor = 1.0`) ; driver 0 (rapide / pression légère) → `minPressureFactor × base`
/// (plus fin). La largeur choisie n'est donc JAMAIS dépassée — elle est la pleine épaisseur.
public enum StrokeWidthMapping {
    private static let minPressureFactor: CGFloat = 0.4
    private static let maxPressureFactor: CGFloat = 1.0
    private static let hardCapFactor: CGFloat = 1.0
    private static let minWidth: CGFloat = 1

    public static func base(width: Double, tool: StrokeTool) -> CGFloat {
        CGFloat(width) * (tool == .marker ? 2 : 1)
    }

    public static func effectiveWidth(of stroke: StoryDrawingStroke, pressure: Double) -> CGFloat {
        let base = base(width: stroke.width, tool: stroke.tool)
        guard stroke.captureVersion >= 1 else { return max(minWidth, base) }
        let factor = minPressureFactor + (maxPressureFactor - minPressureFactor) * CGFloat(pressure)
        return min(hardCapFactor * base, max(minWidth, base * factor))
    }
}
