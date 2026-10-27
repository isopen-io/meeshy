import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Call Display Mode

enum CallDisplayMode: Sendable {
    case fullScreen
    case pip
    case bubble
}

/// Bord horizontal d'ancrage de la bulle d'appel repliée (`CallBubbleView`),
/// mis à jour au relâchement du drag de repositionnement.
enum BubbleHorizontalEdge: Sendable { case leading, trailing }
