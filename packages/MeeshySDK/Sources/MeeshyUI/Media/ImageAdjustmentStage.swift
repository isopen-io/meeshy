import CoreImage
import UIKit
import MeeshySDK

// MARK: - L'étage RÉGLAGES, seul (#9175)

/// **La chaîne CoreImage des réglages d'une image — UNE seule écriture.**
///
/// Elle vivait en privé dans `ImageFilterEngine`, l'éditeur plein écran (resté
/// pour l'avatar). Une image posée dans la scène porte désormais ses réglages
/// (`StoryMediaObject.adjustments`) et le player les peint : les deux rendus
/// passent par CETTE fonction, si bien qu'un contraste réglé ici ne peut pas
/// diverger d'un contraste réglé là.
///
/// `nonisolated` et sans contexte : CIImage → CIImage, pur. Le contexte de rendu
/// appartient à l'appelant (`ImageFilterEngine` pour l'éditeur,
/// `StoryMediaAdjustmentsProcessor` pour la scène).
nonisolated enum ImageAdjustmentStage {

    static func apply(_ input: CIImage, _ adjustments: ImageAdjustments, extent: CGRect) -> CIImage {
        guard !adjustments.isNeutral else { return input }
        var result = input

        if abs(adjustments.exposure) > 0.001 {
            result = ciFilter("CIExposureAdjust", on: result, [kCIInputEVKey: adjustments.exposure])
        }

        if abs(adjustments.brightness) > 0.001
            || abs(adjustments.contrast - 1) > 0.001
            || abs(adjustments.saturation - 1) > 0.001 {
            result = colorControls(
                result,
                saturation: adjustments.saturation,
                contrast: adjustments.contrast,
                brightness: adjustments.brightness
            )
        }

        if abs(adjustments.vibrance) > 0.001 {
            result = ciFilter("CIVibrance", on: result, ["inputAmount": adjustments.vibrance])
        }

        if abs(adjustments.temperature) > 0.001 {
            result = temperature(result, target: 6500 + adjustments.temperature * 1800)
        }

        if adjustments.sharpness > 0.001 {
            result = ciFilter("CISharpenLuminance", on: result, [kCIInputSharpnessKey: adjustments.sharpness])
        }

        if adjustments.blur > 0.001 {
            let radius = adjustments.blur * 16
            let blurred = ciFilter("CIGaussianBlur", on: result.clampedToExtent(), [kCIInputRadiusKey: radius])
            result = blurred.cropped(to: extent)
        }

        if adjustments.vignette > 0.001 {
            result = vignette(result, intensity: adjustments.vignette, radius: 1)
        }

        // Les EFFETS (#9498) closent la chaîne, comme l'étage « effet » de
        // l'éditeur plein écran le faisait après ses réglages.
        if adjustments.bloom > 0.001 {
            result = bloom(result, amount: adjustments.bloom, extent: extent)
        }

        if adjustments.grain > 0.001 {
            result = grain(result, amount: adjustments.grain, extent: extent)
        }

        return result
    }

    // MARK: Les effets (#9498) — UNE écriture, l'éditeur et la scène

    /// Le rayon de `CIBloom`, en pixels de la source — celui du préréglage de
    /// l'ancien éditeur.
    static let bloomRadius: Double = 10
    /// L'alpha du grain à pleine course : à mi-course (0,5), les 0,05 du
    /// préréglage de l'ancien éditeur.
    static let grainAlphaPerUnit: CGFloat = 0.1

    /// **Le BLOOM** : l'image floutée, ajoutée sur elle-même à `amount` (0…1) —
    /// 0,5 rend le préréglage « Bloom » de l'ancien éditeur.
    static func bloom(_ input: CIImage, amount: Float, extent: CGRect) -> CIImage {
        ciFilter("CIBloom", on: input, [
            kCIInputRadiusKey: bloomRadius,
            kCIInputIntensityKey: Double(amount)
        ]).cropped(to: extent)
    }

    /// **Le GRAIN** : un bruit noir posé sur l'image, d'alpha au plus
    /// `amount × 0,1`. `CIRandomGenerator` est déterministe : le même grain
    /// d'un rendu à l'autre, donc d'une image du cache à la suivante.
    static func grain(_ input: CIImage, amount: Float, extent: CGRect) -> CIImage {
        guard let noise = CIFilter(name: "CIRandomGenerator")?.outputImage else { return input }
        let alpha = CGFloat(amount) * grainAlphaPerUnit
        let layer = ciFilter("CIColorMatrix", on: noise.cropped(to: extent), [
            "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputAVector": CIVector(x: 0, y: 0, z: 0, w: alpha)
        ])
        guard let composite = CIFilter(name: "CISourceOverCompositing") else { return input }
        composite.setValue(layer, forKey: kCIInputImageKey)
        composite.setValue(input, forKey: kCIInputBackgroundImageKey)
        return composite.outputImage?.cropped(to: extent) ?? input
    }

    static func ciFilter(_ name: String, on input: CIImage, _ parameters: [String: Any]) -> CIImage {
        guard let filter = CIFilter(name: name) else { return input }
        filter.setValue(input, forKey: kCIInputImageKey)
        for (key, value) in parameters {
            filter.setValue(value, forKey: key)
        }
        return filter.outputImage ?? input
    }

    static func colorControls(_ input: CIImage,
                              saturation: Float = 1,
                              contrast: Float = 1,
                              brightness: Float = 0) -> CIImage {
        ciFilter("CIColorControls", on: input, [
            kCIInputBrightnessKey: brightness,
            kCIInputContrastKey: contrast,
            kCIInputSaturationKey: saturation
        ])
    }

    static func temperature(_ input: CIImage, target: Float) -> CIImage {
        guard let filter = CIFilter(name: "CITemperatureAndTint") else { return input }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(CIVector(x: 6500, y: 0), forKey: "inputNeutral")
        filter.setValue(CIVector(x: CGFloat(target), y: 0), forKey: "inputTargetNeutral")
        return filter.outputImage ?? input
    }

    static func vignette(_ input: CIImage, intensity: Float, radius: Float) -> CIImage {
        ciFilter("CIVignette", on: input, [
            kCIInputIntensityKey: intensity,
            kCIInputRadiusKey: radius
        ])
    }
}

// MARK: - Cuire les réglages d'un objet de la scène

/// **Les réglages d'une image POSÉE, cuits dans son bitmap** — au même point de
/// passage que son filtre et son orientation (`StoryMediaLayer.filtered`), donc
/// dans le composer, le lecteur et la vignette composite à l'identique (loi 6 :
/// le player est l'aperçu).
///
/// Le cache suit l'INSTANCE d'image et les VALEURS : un glissement de curseur
/// qui revient sur une valeur déjà vue ne refait aucun rendu, et un bitmap
/// remplacé ne resservira jamais les réglages de l'ancien.
public nonisolated enum StoryMediaAdjustmentsProcessor {
    nonisolated(unsafe) private static let context = CIContext()
    nonisolated(unsafe) private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 40
        cache.totalCostLimit = 40 * 1024 * 1024
        return cache
    }()

    /// L'image telle quelle sans réglage actif ; sinon la même image réglée,
    /// à la même échelle et dans la même orientation EXIF.
    public static func apply(_ adjustments: ImageAdjustments?, to image: UIImage, imageId: String) -> UIImage {
        guard let adjustments, adjustments.activeCount > 0, let cg = image.cgImage else { return image }
        let key = "\(imageId)|\(signature(adjustments))" as NSString
        if let cached = cache.object(forKey: key) { return cached }

        let input = CIImage(cgImage: cg)
        let extent = input.extent
        guard extent.width >= 1, extent.height >= 1,
              let output = context.createCGImage(ImageAdjustmentStage.apply(input, adjustments, extent: extent),
                                                 from: extent) else { return image }
        let rendered = UIImage(cgImage: output, scale: image.scale, orientation: image.imageOrientation)
        cache.setObject(rendered, forKey: key, cost: output.bytesPerRow * output.height)
        return rendered
    }

    /// Une signature DÉTERMINISTE des valeurs actives — jamais `hashValue`, qui
    /// peut collisionner et servirait alors les réglages d'un autre état.
    static func signature(_ adjustments: ImageAdjustments) -> String {
        adjustments.activeValues.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ",")
    }
}
