import CoreGraphics
import Foundation

/// **Ce que la capture a le droit de coûter, palier par palier** (#9349, spec § 5).
///
/// Dans TOUS les paliers, la photo et l'export reçoivent l'effet complet : seul
/// ce qu'on regarde se dégrade, jamais ce qui part.
nonisolated struct ComposerThermalBudget: Equatable, Sendable {
    let previewFPS: Int
    /// 0 ⇒ miniatures figées.
    let thumbnailFPS: Int
    /// 0 ⇒ miniatures coupées.
    let thumbnailCells: Int
    /// La surface de l'aperçu, en fraction de la définition de l'écran.
    let surfaceScale: CGFloat
    /// L'aperçu n'est plus que la couche système ; l'écran le dit.
    let systemLayerOnly: Bool

    static func budget(for state: ProcessInfo.ThermalState) -> ComposerThermalBudget {
        switch state {
        case .nominal:
            return ComposerThermalBudget(previewFPS: 30, thumbnailFPS: 12, thumbnailCells: 8,
                                         surfaceScale: 1, systemLayerOnly: false)
        case .fair:
            return ComposerThermalBudget(previewFPS: 24, thumbnailFPS: 6, thumbnailCells: 5,
                                         surfaceScale: 1, systemLayerOnly: false)
        case .critical:
            return ComposerThermalBudget(previewFPS: 0, thumbnailFPS: 0, thumbnailCells: 0,
                                         surfaceScale: 1, systemLayerOnly: true)
        case .serious:
            return serious
        @unknown default:
            return serious
        }
    }

    private static let serious = ComposerThermalBudget(previewFPS: 15, thumbnailFPS: 0, thumbnailCells: 5,
                                                       surfaceScale: 0.75, systemLayerOnly: false)

    /// Pendant l'enregistrement, seule la miniature choisie vit, au rythme du palier.
    func whileRecording() -> ComposerThermalBudget {
        ComposerThermalBudget(previewFPS: previewFPS, thumbnailFPS: thumbnailFPS,
                              thumbnailCells: min(1, thumbnailCells), surfaceScale: surfaceScale,
                              systemLayerOnly: systemLayerOnly)
    }
}
