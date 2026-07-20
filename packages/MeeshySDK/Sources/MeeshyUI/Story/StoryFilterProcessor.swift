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
    private static let context = CIContext()
    nonisolated(unsafe) private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 50
        c.totalCostLimit = 20 * 1024 * 1024
        return c
    }()

    /// Applies `filter` to `image` at `intensity` (0…1). This is the SINGLE
    /// source of truth for the story filter look — shared by the composer
    /// canvas (`StoryCanvasUIView.updateFilterLayer`), the filter grid tiles and
    /// the legacy picker — so what the tile previews is exactly what the canvas
    /// renders. Intensity blends the fully-filtered image back toward the
    /// original via a dissolve, so the slider behaves identically for all eight
    /// effects (default `1.0` = full effect, preserving prior callers).
    public static func apply(_ filter: StoryFilter?, to image: UIImage,
                             imageId: String? = nil, intensity: Float = 1.0) -> UIImage {
        guard let filter = filter, let ciImage = CIImage(image: image) else { return image }
        let clamped = max(0, min(1, intensity))

        // Cache lookup — use caller-provided imageId (slide ID) or fallback to dimensions.
        // Intensity is part of the key so a slider drag doesn't serve a stale look.
        let id = imageId ?? "\(Int(image.size.width))x\(Int(image.size.height))_\(image.cgImage?.bytesPerRow ?? 0)"
        let cacheKey = "\(id)_\(filter.rawValue)_\(Int((clamped * 100).rounded()))" as NSString
        if let cached = cache.object(forKey: cacheKey) { return cached }

        let output: CIImage?
        switch filter {
        case .vintage:
            let f = CIFilter(name: "CIPhotoEffectTransfer")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        case .bw:
            let f = CIFilter(name: "CIPhotoEffectNoir")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        case .warm:
            let f = CIFilter(name: "CITemperatureAndTint")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            f?.setValue(CIVector(x: 6500 + 1000, y: 0), forKey: "inputNeutral")
            output = f?.outputImage
        case .cool:
            let f = CIFilter(name: "CITemperatureAndTint")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            f?.setValue(CIVector(x: 6500 - 1500, y: 0), forKey: "inputNeutral")
            output = f?.outputImage
        case .dramatic:
            let f = CIFilter(name: "CIPhotoEffectProcess")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        case .vivid:
            let f = CIFilter.colorControls()
            f.inputImage = ciImage
            f.saturation = 1.5
            output = f.outputImage
        case .fade:
            let f = CIFilter(name: "CIPhotoEffectFade")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        case .chrome:
            let f = CIFilter(name: "CIPhotoEffectChrome")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        }

        guard let fullyFiltered = output else { return image }
        // Blend the full effect back toward the original by `intensity` so the
        // slider is meaningful for every filter (including the fixed-recipe
        // PhotoEffect ones). `dissolveTransition.time` 0 = original, 1 = filtered.
        let finalImage: CIImage = {
            if clamped >= 0.999 { return fullyFiltered }
            let dissolve = CIFilter.dissolveTransition()
            dissolve.inputImage = ciImage
            dissolve.targetImage = fullyFiltered.cropped(to: ciImage.extent)
            dissolve.time = clamped
            return dissolve.outputImage ?? fullyFiltered
        }()
        guard let cgImage = context.createCGImage(finalImage, from: ciImage.extent) else {
            return image
        }
        let result = UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
        let pixelCost = Int(result.size.width * result.size.height * result.scale * result.scale) * 4
        cache.setObject(result, forKey: cacheKey, cost: pixelCost)
        return result
    }
}
