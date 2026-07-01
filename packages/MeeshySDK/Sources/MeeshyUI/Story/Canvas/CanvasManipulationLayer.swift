import Foundation

// MARK: - Canvas Manipulation Layer

/// Couche active pour la manipulation des éléments du canvas. Détermine quel
/// type d'élément reçoit les gestes (pan/pinch/rotate) selon le contenu de la
/// slide. Le verrouillage se fait en cascade : dès qu'un foreground est posé,
/// le background n'est plus manipulable. Voir spec
/// `2026-05-20-stories-video-layers-text-sprint-design.md` § 4.
public enum CanvasManipulationLayer: String, Sendable, Equatable {
    /// Slide vierge (aucun média / texte / sticker). Aucune manipulation.
    case canvas
    /// Background media posé, aucun foreground. Le bg seul est manipulable.
    case background
    /// Au moins un foreground (média fg, texte ou sticker). Le fg sous le
    /// doigt est manipulable ; le bg et le canvas root sont gelés.
    case foreground
}
