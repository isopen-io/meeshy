import Foundation

// MARK: - StoryDrawingStroke

/// Un trait individuel dans une story. Remplace le format opaque `PKDrawing.dataRepresentation()`
/// du legacy : avec ce modèle, le composer peut sélectionner, recolorer, supprimer ou lisser
/// chaque trait après coup (UX type "calques de dessin"). Les points sont stockés dans
/// l'espace canonique design 1080×1920 (cf. `PencilKitCanvas.designSize` legacy) pour rester
/// portables entre tailles d'écran.
public struct StoryDrawingStroke: Codable, Identifiable, Sendable, Equatable {
    public var id: String
    public var points: [StoryDrawingStrokePoint]
    /// Couleur sans alpha — hex "RRGGBB". L'alpha est porté implicitement par le `tool`
    /// (`.marker` se rend en 50% par exemple) et par la `pressure` des points.
    public var colorHex: String
    /// Épaisseur en design-pixels (référentiel 1080×1920). Le rendu projette vers la taille
    /// d'affichage réelle au moment du dessin.
    public var width: Double
    public var tool: StrokeTool
    public var smoothing: StrokeSmoothing
    public var createdAt: Date

    public init(id: String = UUID().uuidString,
                points: [StoryDrawingStrokePoint] = [],
                colorHex: String,
                width: Double,
                tool: StrokeTool = .pen,
                smoothing: StrokeSmoothing = .raw,
                createdAt: Date = Date()) {
        self.id = id
        self.points = points
        self.colorHex = colorHex
        self.width = width
        self.tool = tool
        self.smoothing = smoothing
        self.createdAt = createdAt
    }
}

// MARK: - StoryDrawingStrokePoint

/// Un point capturé le long d'un trait. La `pressure` provient de l'Apple Pencil quand
/// disponible (sinon 1.0 pour les doigts). Le rendu peut moduler l'épaisseur le long du
/// trait via cette valeur.
public struct StoryDrawingStrokePoint: Codable, Sendable, Equatable {
    public var x: Double
    public var y: Double
    public var pressure: Double

    public init(x: Double, y: Double, pressure: Double = 1.0) {
        self.x = x
        self.y = y
        self.pressure = pressure
    }
}

// MARK: - StrokeTool

/// Le pinceau actif au moment de la capture. `eraser` n'est jamais persisté sur un trait
/// existant : c'est une action côté capture qui supprime les traits dont le hit-test
/// intersecte le doigt (cf. `StrokeCaptureLayer`).
public enum StrokeTool: String, Codable, Sendable, CaseIterable, Equatable {
    case pen
    case marker
    case eraser
}

// MARK: - StrokeSmoothing

/// Le lissage appliqué au rendu d'un trait. `raw` rend les points capturés tels quels,
/// `curve` interpole en Catmull-Rom (lignes plus douces), `line` simplifie en segments
/// droits via Ramer-Douglas-Peucker.
public enum StrokeSmoothing: String, Codable, Sendable, CaseIterable, Equatable {
    case raw
    case curve
    case line
}
