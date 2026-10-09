import CoreGraphics
import CoreImage
import Foundation

/// **Basculer d'objectif sans écran noir** (#9464).
///
/// Le temps que le nouvel objectif serve sa première image, l'aperçu montre
/// la dernière trame de l'ancien, floutée — sur la couche système comme sur
/// la vue Metal —, et le bouton de bascule se tait : un second toucher ne
/// relance pas une bascule pendant que la première se fait.
nonisolated enum ComposerCameraSwitchRule {

    /// Ce que la couverture reste après la pose du nouvel objectif — le temps
    /// que ses premières trames arrivent.
    static let coverHold: TimeInterval = 0.2

    /// L'attente au plus d'une trame de l'objectif encore en place.
    static let frameWait: TimeInterval = 0.12

    /// Une couverture floutée n'a pas besoin de détail : une petite image suffit.
    static let coverWidth = 270

    static let coverBlur: Double = 18

    static func mayFlip(isSwitching: Bool) -> Bool {
        !isSwitching
    }

    /// **La trame qui couvre la bascule** (#9778) : celle que le guetteur retient
    /// déjà, sans attendre ; sinon la prochaine de l'objectif en place, attendue
    /// au plus `frameWait` — une caméra avant en faible lumière en sert une
    /// toutes les 66 ms.
    static func coverFrame(latest: CIImage?, hold: () -> CIImage?) -> CIImage? {
        latest ?? hold()
    }

    /// La validation peut rendre l'objectif à son format, et son zoom à ×1 de
    /// l'appareil — l'ultra grand-angle d'une caméra virtuelle. Ré-affirmer
    /// l'ouverture ne coûte que si elle a bougé.
    static func needsZoomReassert(current: CGFloat, target: CGFloat) -> Bool {
        abs(current - target) > 0.001
    }

    /// La trame, réduite puis floutée, sans bord sombre (étendue avant le flou).
    static func cover(from frame: CIImage) -> CGImage? {
        let cadre = frame.extent
        guard cadre.width > 0, cadre.height > 0, !cadre.isInfinite else { return nil }
        let echelle = min(1, CGFloat(coverWidth) / cadre.width)
        let reduite = frame
            .transformed(by: CGAffineTransform(translationX: -cadre.minX, y: -cadre.minY))
            .transformed(by: CGAffineTransform(scaleX: echelle, y: echelle))
        let zone = CGRect(x: 0, y: 0, width: (cadre.width * echelle).rounded(.down),
                          height: (cadre.height * echelle).rounded(.down))
        let floue = reduite.clampedToExtent().applyingGaussianBlur(sigma: coverBlur).cropped(to: zone)
        return ComposerLookGPU.context.createCGImage(floue, from: zone)
    }

    /// La couverture voyage de la file de la session au fil principal.
    struct Cover: @unchecked Sendable {
        let image: CGImage
    }

    /// La trame retenue voyage de la file de la session à celle du flou —
    /// une `CIImage` est immuable.
    struct Frame: @unchecked Sendable {
        let image: CIImage
    }
}
