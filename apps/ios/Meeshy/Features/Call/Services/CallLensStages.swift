import CoreImage
import MeeshyUI

/// **Les étages de lens d'une trame d'appel** (#11298) : le flou de fond, la
/// colorimétrie et l'effet stylisé du visage, remis à `LensPainter` — le peintre
/// du composer —, qui les peint dans l'ordre de toute lens : segmentation →
/// LUT → visage. Le flou floutant la trame elle-même, les deux ordres rendent
/// à peu près la même image ; l'ordre compte pour un fond qui REMPLACE la
/// trame, que l'étalonnage doit alors harmoniser avec la personne.
///
/// Les corrections du CAPTEUR (retouche de la peau, scène sombre) ne sont pas
/// des étages : elles corrigent la source avant la lens. La politique — quand
/// flouter, à quel palier — reste au pipeline ; ce type ne fait que l'ordre.
nonisolated struct CallLensStages {
    let backgroundBlur: ((CIImage) -> CIImage)?
    let colorimetry: ((CIImage) -> CIImage)?
    let faceEffect: ((CIImage) -> CIImage)?

    var passes: [LensPass] {
        [
            backgroundBlur.map { blur in LensPass(.segmentation) { image, _ in blur(image) } },
            colorimetry.map { grade in LensPass(.lut) { image, _ in grade(image) } },
            faceEffect.map { stylize in LensPass(.face) { image, _ in stylize(image) } },
        ].compactMap { $0 }
    }

    func paint(_ source: CIImage) -> CIImage {
        LensPainter.paint(source, passes: passes, input: LensFrameInput())
    }
}
