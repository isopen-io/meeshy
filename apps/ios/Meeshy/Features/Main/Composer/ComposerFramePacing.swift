import CoreGraphics
import CoreImage
import Foundation

/// **Une source de trames pour le peintre** (#9349) : la caméra, la photo figée
/// ou la vidéo en boucle (#9352). Elle PRÉVIENT à chaque trame neuve : la vue
/// Metal ne dessine qu'alors, jamais sur une horloge libre.
protocol ComposerFrameSourcing: AnyObject, Sendable {
    nonisolated func latestImage() -> CIImage?
    nonisolated var declaredSpace: CGColorSpace? { get }
    nonisolated func setFrameHandler(_ handler: (@Sendable () -> Void)?, for owner: ObjectIdentifier)
}

/// La cadence permise : une trame qui arrive plus vite que le budget attend la suivante.
nonisolated struct ComposerFramePacer: Equatable, Sendable {
    let fps: Int

    func shouldDraw(now: TimeInterval, last: TimeInterval?) -> Bool {
        guard fps > 0 else { return false }
        guard let last else { return true }
        return now - last >= 1 / Double(fps) - 0.002
    }
}

/// **Une image par trame, jamais deux** (spec § 5) : sans effet, la couche
/// système seule ; avec effet, la vue Metal seule.
nonisolated enum ComposerCaptureSurfaceRule {
    static func paintsWithMetal(look: ComposerPhotoLook, budget: ComposerThermalBudget, fixture: Bool) -> Bool {
        guard !budget.systemLayerOnly else { return false }
        return fixture || ComposerLiveLookRule.rendersLive(look)
    }

    /// Au palier critique, un effet choisi ne se montre plus : l'écran le dit.
    static func showsThermalNotice(look: ComposerPhotoLook, budget: ComposerThermalBudget) -> Bool {
        budget.systemLayerOnly && ComposerLiveLookRule.rendersLive(look)
    }
}

/// Les mots de la capture unifiée.
enum ComposerCaptureCopy {
    static var thermalNotice: String {
        String(localized: "composer.capture.thermal.notice",
               defaultValue: "Aperçu simplifié : l'appareil chauffe. La prise garde tout l'effet.", bundle: .main)
    }
}
