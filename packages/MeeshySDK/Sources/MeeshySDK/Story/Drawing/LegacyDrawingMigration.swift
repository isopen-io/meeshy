import Foundation
import CoreGraphics
import PencilKit
import UIKit

// MARK: - Legacy migration : PKDrawing → [StoryDrawingStroke]

/// Conversion best-effort des dessins legacy (`StoryEffects.drawingData` = `PKDrawing.dataRepresentation()`)
/// vers le nouveau format `[StoryDrawingStroke]`. Appelée à la lecture (`init(from:)` de `StoryEffects`)
/// pour que les stories déjà publiées continuent d'apparaître dans le composer après la refonte
/// dessin (2026-05-30).
///
/// **Limitations** (acceptables — annotation "best-effort") :
/// - `PKEraserTool` strokes ne sont pas conservés (pas modélisés en `StoryDrawingStroke`).
/// - `PKInkType.pencil` est mappé à `.pen` (le modèle ne distingue que pen / marker / eraser).
/// - La largeur ne provient pas d'un champ `PKInk` (inexistant) mais du `size.width` du premier
///   `PKStrokePoint`. C'est suffisant pour le rendu approximatif legacy.
extension StoryDrawingStroke {

    /// Décode `data` (sérialisation `PKDrawing.dataRepresentation()`) et retourne un tableau
    /// de `StoryDrawingStroke` équivalents. Retourne `[]` si :
    /// - `data` est vide,
    /// - le décodage `PKDrawing(data:)` échoue,
    /// - le dessin ne contient aucun trait.
    public static func fromLegacyPKDrawing(_ data: Data) -> [StoryDrawingStroke] {
        guard !data.isEmpty else { return [] }
        guard let drawing = try? PKDrawing(data: data) else { return [] }

        return drawing.strokes.map { pkStroke -> StoryDrawingStroke in
            let interpolated = Array(pkStroke.path)

            let points: [StoryDrawingStrokePoint] = interpolated.map { pt in
                StoryDrawingStrokePoint(
                    x: Double(pt.location.x),
                    y: Double(pt.location.y),
                    pressure: Double(pt.force)
                )
            }

            let colorHex = Self.hexFromUIColor(pkStroke.ink.color)
            let width = interpolated.first.map { Double($0.size.width) } ?? 5.0

            let tool: StrokeTool
            switch pkStroke.ink.inkType {
            case .pen:    tool = .pen
            case .marker: tool = .marker
            case .pencil: tool = .pen
            default: tool = .pen
            }

            return StoryDrawingStroke(
                points: points,
                colorHex: colorHex,
                width: width,
                tool: tool,
                smoothing: .raw,
                createdAt: pkStroke.path.creationDate
            )
        }
    }

    // MARK: - Color helper

    /// Convertit un `UIColor` en hex `"RRGGBB"` 6-digit. Gère les colorspace RGB,
    /// grayscale (renvoie hex monochrome) et tombe sur `"FFFFFF"` en dernier recours.
    static func hexFromUIColor(_ color: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        if color.getRed(&r, green: &g, blue: &b, alpha: &a) {
            // Troncature (`Int(x * 255)`) pour rester cohérent avec la convention du
            // codebase (`ColorGeneration.swift`, `StoryComposerView.swift`).
            return String(format: "%02X%02X%02X",
                          Int(max(0, min(1, r)) * 255),
                          Int(max(0, min(1, g)) * 255),
                          Int(max(0, min(1, b)) * 255))
        }
        var white: CGFloat = 0
        var alpha: CGFloat = 0
        if color.getWhite(&white, alpha: &alpha) {
            let v = Int(max(0, min(1, white)) * 255)
            return String(format: "%02X%02X%02X", v, v, v)
        }
        return "FFFFFF"
    }
}
