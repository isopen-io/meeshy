import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation

/// **Le réglage fin d'une ambiance** (OPUS-2, doc 08 § R6) : sa DOSE, et le pavé
/// chaleur × contraste. Neutre par défaut, borné à la construction : une valeur
/// hors bornes ne se pose jamais.
nonisolated struct ComposerLookTuning: Hashable, Sendable {
    /// La dose de l'ambiance : 0 ⇒ la prise telle quelle, 1 ⇒ l'ambiance pleine.
    let intensity: Double
    /// −1 frais … 1 chaud.
    let warmth: Double
    /// −1 doux … 1 contrasté.
    let contrast: Double

    static let neutral = ComposerLookTuning()

    init(intensity: Double = 1, warmth: Double = 0, contrast: Double = 0) {
        self.intensity = ComposerLookTuningRule.bounded(intensity, 0...1)
        self.warmth = ComposerLookTuningRule.pad(warmth)
        self.contrast = ComposerLookTuningRule.pad(contrast)
    }

    /// Le pavé a bougé : il peint, même sans ambiance.
    var adjusts: Bool { warmth != 0 || contrast != 0 }

    func with(intensity: Double) -> ComposerLookTuning {
        ComposerLookTuning(intensity: intensity, warmth: warmth, contrast: contrast)
    }

    func with(warmth: Double, contrast: Double) -> ComposerLookTuning {
        ComposerLookTuning(intensity: intensity, warmth: warmth, contrast: contrast)
    }
}

nonisolated enum ComposerLookTuningRule {

    /// Autour du centre, le pavé retombe à zéro : on y revient sans viser.
    static let deadZone = 0.06

    static func bounded(_ value: Double, _ range: ClosedRange<Double>) -> Double {
        min(range.upperBound, max(range.lowerBound, value.isFinite ? value : 0))
    }

    static func pad(_ value: Double) -> Double {
        let borne = bounded(value, -1...1)
        return abs(borne) < deadZone ? 0 : borne
    }

    /// **Un point du pavé, lu en réglage** : x vers la droite réchauffe, y vers le
    /// HAUT contraste. `size` est la taille du pavé ; le point peut en sortir.
    static func values(at point: CGPoint, in size: CGSize) -> (warmth: Double, contrast: Double) {
        guard size.width > 0, size.height > 0 else { return (0, 0) }
        let x = Double(point.x / size.width) * 2 - 1
        let y = 1 - Double(point.y / size.height) * 2
        return (pad(x), pad(y))
    }

    /// Où se pose le témoin du pavé pour ce réglage — l'inverse de `values`.
    static func point(warmth: Double, contrast: Double, in size: CGSize) -> CGPoint {
        CGPoint(x: (warmth + 1) / 2 * size.width, y: (1 - contrast) / 2 * size.height)
    }

    /// Le pas d'un geste VoiceOver sur un axe du pavé ou sur la dose.
    static let accessibilityStep = 0.1
}

/// **Le réglage peint** : la dose mêle l'ambiance à la prise, puis le pavé
/// réchauffe et contraste. Une seule matrice de couleur, sans écrêtage : les
/// couleurs étendues (Display P3) passent intactes.
nonisolated enum ComposerLookTuningGrade {

    /// Gain des voies rouge et bleue à chaleur pleine.
    static let warmthGain = 0.08
    /// Pente ajoutée à contraste plein.
    static let contrastGain = 0.25
    /// Le gris moyen de l'espace de travail linéaire : le contraste pivote autour.
    static let pivot = 0.18

    static func blended(original: CIImage, graded: CIImage, intensity: Double) -> CIImage {
        guard intensity < 1 else { return graded }
        guard intensity > 0 else { return original }
        let fondu = CIFilter.dissolveTransition()
        fondu.inputImage = original
        fondu.targetImage = graded
        fondu.time = Float(intensity)
        return fondu.outputImage?.cropped(to: original.extent) ?? graded
    }

    static func adjusted(_ image: CIImage, tuning: ComposerLookTuning) -> CIImage {
        guard tuning.adjusts else { return image }
        let pente = 1 + contrastGain * tuning.contrast
        let biais = CGFloat(pivot * (1 - pente))
        let chaleur = warmthGain * tuning.warmth
        let matrice = CIFilter.colorMatrix()
        matrice.inputImage = image
        matrice.rVector = CIVector(x: CGFloat(pente * (1 + chaleur)), y: 0, z: 0, w: 0)
        matrice.gVector = CIVector(x: 0, y: CGFloat(pente), z: 0, w: 0)
        matrice.bVector = CIVector(x: 0, y: 0, z: CGFloat(pente * (1 - chaleur)), w: 0)
        matrice.aVector = CIVector(x: 0, y: 0, z: 0, w: 1)
        matrice.biasVector = CIVector(x: biais, y: biais, z: biais, w: 0)
        return matrice.outputImage?.cropped(to: image.extent) ?? image
    }
}
