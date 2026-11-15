import CoreGraphics

/// **Le glisser d'un objet de premier plan, dit à l'hôte** (#18712) : le doigt en coordonnées
/// de FENÊTRE, pour qu'il pose ses cibles — la copie en haut, la poubelle en bas
/// (`MeeshyDragTargets`). Le canvas ne décide rien du lâcher : il déplace, l'hôte tranche.
public enum StoryCanvasItemDrag: Equatable, Sendable {
    /// Le glisser est reconnu ; `start` est la place de l'objet avant lui, en unités de scène.
    case began(id: String, finger: CGPoint, start: CGPoint)
    case moved(finger: CGPoint)
    case ended(finger: CGPoint)
    case cancelled
}
