import Foundation
import CoreGraphics

/// Mappe le driver de pression `[0,1]` vers une largeur effective. Fonction pure unique,
/// partagée live + baked. Legacy (`captureVersion == 0`) → `base` constant (non-régression).
public enum StrokeWidthMapping {
    private static let minPressureFactor: CGFloat = 0.5
    private static let maxPressureFactor: CGFloat = 1.6
    private static let hardCapFactor: CGFloat = 2.5
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
