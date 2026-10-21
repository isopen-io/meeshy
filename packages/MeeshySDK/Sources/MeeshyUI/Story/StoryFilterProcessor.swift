import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import MeeshySDK

// MARK: - CIFilter Application
//
// Extrait de l'ancien `StoryFilterPicker.swift` (C10/it.85) : la VUE picker
// était morte (sheet jamais présentée) mais ce processor est la source
// unique du rendu des filtres — consommé par StoryBackgroundLayer et
// StoryFilterGridView. Leçon consignée : purger un fichier = inventorier
// TOUS ses types, pas seulement celui qui porte son nom.

public nonisolated struct StoryFilterProcessor {
    nonisolated(unsafe) private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 50
        c.totalCostLimit = 20 * 1024 * 1024
        return c
    }()

    /// Applies `filter` to `image` at `intensity` (0…1). This is the SINGLE
    /// source of truth for the story filter look — shared by the composer
    /// canvas, the filter grid tiles and the legacy picker — so what the tile
    /// previews is exactly what the canvas renders. The bitmap is baked by
    /// `StoryRenderingContext.shared`, upright (`CIImage.oriented`), in the
    /// colour space that keeps the source's gamut (#9873).
    public static func apply(_ filter: StoryFilter?, to image: UIImage,
                             imageId: String? = nil, intensity: Float = 1.0) -> UIImage {
        guard let filter = filter, let source = StoryRenderingContext.orientedSource(of: image) else { return image }
        let clamped = max(0, min(1, intensity))

        // Cache lookup — use caller-provided imageId (slide ID) or fallback to dimensions.
        // Intensity is part of the key so a slider drag doesn't serve a stale look.
        let id = imageId ?? "\(Int(image.size.width))x\(Int(image.size.height))_\(image.cgImage?.bytesPerRow ?? 0)"
        let cacheKey = "\(id)_\(filter.rawValue)_\(Int((clamped * 100).rounded()))" as NSString
        if let cached = cache.object(forKey: cacheKey) { return cached }

        guard let cgImage = StoryRenderingContext.shared.bitmap(filtered(source, filter, intensity: clamped),
                                                                from: source.extent,
                                                                preserving: image.cgImage?.colorSpace) else {
            return image
        }
        let result = UIImage(cgImage: cgImage, scale: image.scale, orientation: .up)
        cache.setObject(result, forKey: cacheKey, cost: cgImage.bytesPerRow * cgImage.height)
        return result
    }

    /// **The filter look as a pure `CIImage → CIImage` chain** — what the
    /// canvas preview, the export and the tiles all render. Intensity blends
    /// the fully-filtered image back toward the original via a dissolve, so
    /// the slider behaves identically for all eight effects.
    public static func filtered(_ ciImage: CIImage, _ filter: StoryFilter, intensity: Float) -> CIImage {
        let clamped = max(0, min(1, intensity))
        guard let fullyFiltered = fullEffect(filter, on: ciImage) else { return ciImage }
        // `dissolveTransition.time` 0 = original, 1 = filtered.
        if clamped >= 0.999 { return fullyFiltered }
        let dissolve = CIFilter.dissolveTransition()
        dissolve.inputImage = ciImage
        dissolve.targetImage = fullyFiltered.cropped(to: ciImage.extent)
        dissolve.time = clamped
        return dissolve.outputImage ?? fullyFiltered
    }

    private static func fullEffect(_ filter: StoryFilter, on ciImage: CIImage) -> CIImage? {
        switch filter {
        case .vintage:
            return photoEffect("CIPhotoEffectTransfer", on: ciImage)
        case .bw:
            return photoEffect("CIPhotoEffectNoir", on: ciImage)
        case .warm:
            return temperature(ciImage, neutral: 6500 + 1000)
        case .cool:
            return temperature(ciImage, neutral: 6500 - 1500)
        case .dramatic:
            return photoEffect("CIPhotoEffectProcess", on: ciImage)
        case .vivid:
            let f = CIFilter.colorControls()
            f.inputImage = ciImage
            f.saturation = 1.5
            return f.outputImage
        case .fade:
            return photoEffect("CIPhotoEffectFade", on: ciImage)
        case .chrome:
            return photoEffect("CIPhotoEffectChrome", on: ciImage)
        }
    }

    private static func photoEffect(_ name: String, on ciImage: CIImage) -> CIImage? {
        let f = CIFilter(name: name)
        f?.setValue(ciImage, forKey: kCIInputImageKey)
        return f?.outputImage
    }

    private static func temperature(_ ciImage: CIImage, neutral: CGFloat) -> CIImage? {
        let f = CIFilter(name: "CITemperatureAndTint")
        f?.setValue(ciImage, forKey: kCIInputImageKey)
        f?.setValue(CIVector(x: neutral, y: 0), forKey: "inputNeutral")
        return f?.outputImage
    }
}
