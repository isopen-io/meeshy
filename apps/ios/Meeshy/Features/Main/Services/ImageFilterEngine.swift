import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

enum ImageFilter: String, CaseIterable, Identifiable {
    case original, vivid, dramatic, mono, noir, sepia
    case warm, cool, fade, chrome, process, instant

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .original: return "Original"
        case .vivid: return "Vivid"
        case .dramatic: return "Dramatic"
        case .mono: return "Mono"
        case .noir: return "Noir"
        case .sepia: return "Sepia"
        case .warm: return "Warm"
        case .cool: return "Cool"
        case .fade: return "Fade"
        case .chrome: return "Chrome"
        case .process: return "Process"
        case .instant: return "Instant"
        }
    }
}

enum ImageEffect: String, CaseIterable, Identifiable {
    case none, blur, vignette, sharpen, bloom, grain

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .none: return "Aucun"
        case .blur: return "Flou"
        case .vignette: return "Vignette"
        case .sharpen: return "Nettet\u{00E9}"
        case .bloom: return "Bloom"
        case .grain: return "Grain"
        }
    }

    var iconName: String {
        switch self {
        case .none: return "sparkles"
        case .blur: return "aqi.medium"
        case .vignette: return "camera.filters"
        case .sharpen: return "sparkle"
        case .bloom: return "sun.max.trianglebadge.exclamationmark"
        case .grain: return "circle.dotted"
        }
    }
}

@MainActor
final class ImageFilterEngine: ObservableObject {
    @Published var activeFilter: ImageFilter = .original
    @Published var brightness: Float = 0
    @Published var contrast: Float = 1
    @Published var saturation: Float = 1
    @Published var sharpness: Float = 0
    @Published var vignetteIntensity: Float = 0
    @Published var activeEffect: ImageEffect = .none

    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

    func applyEdits(to image: UIImage) -> UIImage {
        guard let cgImage = image.cgImage else { return image }
        var ciImage = CIImage(cgImage: cgImage)

        ciImage = applyFilter(ciImage)
        ciImage = applyAdjustments(ciImage)
        ciImage = applyEffect(ciImage, extent: ciImage.extent)

        guard let outputCG = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return image }
        return UIImage(cgImage: outputCG, scale: image.scale, orientation: image.imageOrientation)
    }

    func generateThumbnails(from image: UIImage, size: CGFloat = 68) -> [ImageFilter: UIImage] {
        let thumbSize = CGSize(width: size * UIScreen.main.scale, height: size * UIScreen.main.scale)
        let renderer = UIGraphicsImageRenderer(size: thumbSize)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: thumbSize))
        }

        guard let cgImage = resized.cgImage else { return [:] }
        let baseCI = CIImage(cgImage: cgImage)

        var results: [ImageFilter: UIImage] = [:]
        for filter in ImageFilter.allCases {
            let filtered = applyFilterPreset(baseCI, filter: filter)
            if let cg = ciContext.createCGImage(filtered, from: filtered.extent) {
                results[filter] = UIImage(cgImage: cg)
            }
        }
        return results
    }

    func reset() {
        activeFilter = .original
        brightness = 0
        contrast = 1
        saturation = 1
        sharpness = 0
        vignetteIntensity = 0
        activeEffect = .none
    }

    // MARK: - Pipeline

    private func applyFilter(_ input: CIImage) -> CIImage {
        applyFilterPreset(input, filter: activeFilter)
    }

    private func applyFilterPreset(_ input: CIImage, filter: ImageFilter) -> CIImage {
        switch filter {
        case .original:
            return input
        case .vivid:
            return applyColorControls(input, saturation: 1.5, contrast: 1.15)
        case .dramatic:
            let adjusted = applyColorControls(input, contrast: 1.4)
            return applyVignetteFilter(adjusted, intensity: 1.5, radius: 1)
        case .mono:
            return applyCIFilter("CIPhotoEffectMono", to: input)
        case .noir:
            return applyCIFilter("CIPhotoEffectNoir", to: input)
        case .sepia:
            guard let filter = CIFilter(name: "CISepiaTone") else { return input }
            filter.setValue(input, forKey: kCIInputImageKey)
            filter.setValue(0.7, forKey: kCIInputIntensityKey)
            return filter.outputImage ?? input
        case .warm:
            return applyTemperature(input, neutral: CIVector(x: 6500, y: 0), target: CIVector(x: 7500, y: 0))
        case .cool:
            return applyTemperature(input, neutral: CIVector(x: 6500, y: 0), target: CIVector(x: 5500, y: 0))
        case .fade:
            return applyCIFilter("CIPhotoEffectFade", to: input)
        case .chrome:
            return applyCIFilter("CIPhotoEffectChrome", to: input)
        case .process:
            return applyCIFilter("CIPhotoEffectProcess", to: input)
        case .instant:
            return applyCIFilter("CIPhotoEffectInstant", to: input)
        }
    }

    private func applyAdjustments(_ input: CIImage) -> CIImage {
        let needsColorControls = brightness != 0 || contrast != 1 || saturation != 1
        let needsSharpness = sharpness > 0
        let needsVignette = vignetteIntensity > 0

        guard needsColorControls || needsSharpness || needsVignette else { return input }

        var result = input

        if needsColorControls {
            guard let filter = CIFilter(name: "CIColorControls") else { return result }
            filter.setValue(result, forKey: kCIInputImageKey)
            filter.setValue(brightness, forKey: kCIInputBrightnessKey)
            filter.setValue(contrast, forKey: kCIInputContrastKey)
            filter.setValue(saturation, forKey: kCIInputSaturationKey)
            result = filter.outputImage ?? result
        }

        if needsSharpness {
            guard let filter = CIFilter(name: "CISharpenLuminance") else { return result }
            filter.setValue(result, forKey: kCIInputImageKey)
            filter.setValue(sharpness, forKey: kCIInputSharpnessKey)
            result = filter.outputImage ?? result
        }

        if needsVignette {
            result = applyVignetteFilter(result, intensity: vignetteIntensity, radius: 1)
        }

        return result
    }

    private func applyEffect(_ input: CIImage, extent: CGRect) -> CIImage {
        switch activeEffect {
        case .none:
            return input
        case .blur:
            guard let filter = CIFilter(name: "CIGaussianBlur") else { return input }
            filter.setValue(input, forKey: kCIInputImageKey)
            filter.setValue(8.0, forKey: kCIInputRadiusKey)
            return filter.outputImage?.cropped(to: extent) ?? input
        case .vignette:
            return applyVignetteFilter(input, intensity: 2, radius: 1)
        case .sharpen:
            guard let filter = CIFilter(name: "CISharpenLuminance") else { return input }
            filter.setValue(input, forKey: kCIInputImageKey)
            filter.setValue(0.8, forKey: kCIInputSharpnessKey)
            return filter.outputImage ?? input
        case .bloom:
            guard let filter = CIFilter(name: "CIBloom") else { return input }
            filter.setValue(input, forKey: kCIInputImageKey)
            filter.setValue(10.0, forKey: kCIInputRadiusKey)
            filter.setValue(0.5, forKey: kCIInputIntensityKey)
            return filter.outputImage?.cropped(to: extent) ?? input
        case .grain:
            return applyGrain(input, extent: extent)
        }
    }

    // MARK: - Helpers

    private func applyCIFilter(_ name: String, to input: CIImage) -> CIImage {
        guard let filter = CIFilter(name: name) else { return input }
        filter.setValue(input, forKey: kCIInputImageKey)
        return filter.outputImage ?? input
    }

    private func applyColorControls(_ input: CIImage, saturation: Float = 1, contrast: Float = 1, brightness: Float = 0) -> CIImage {
        guard let filter = CIFilter(name: "CIColorControls") else { return input }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(brightness, forKey: kCIInputBrightnessKey)
        filter.setValue(contrast, forKey: kCIInputContrastKey)
        filter.setValue(saturation, forKey: kCIInputSaturationKey)
        return filter.outputImage ?? input
    }

    private func applyTemperature(_ input: CIImage, neutral: CIVector, target: CIVector) -> CIImage {
        guard let filter = CIFilter(name: "CITemperatureAndTint") else { return input }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(neutral, forKey: "inputNeutral")
        filter.setValue(target, forKey: "inputTargetNeutral")
        return filter.outputImage ?? input
    }

    private func applyVignetteFilter(_ input: CIImage, intensity: Float, radius: Float) -> CIImage {
        guard let filter = CIFilter(name: "CIVignette") else { return input }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(intensity, forKey: kCIInputIntensityKey)
        filter.setValue(radius, forKey: kCIInputRadiusKey)
        return filter.outputImage ?? input
    }

    private func applyGrain(_ input: CIImage, extent: CGRect) -> CIImage {
        guard let noise = CIFilter(name: "CIRandomGenerator")?.outputImage else { return input }
        let cropped = noise.cropped(to: extent)

        guard let whiten = CIFilter(name: "CIColorMatrix") else { return input }
        whiten.setValue(cropped, forKey: kCIInputImageKey)
        whiten.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputRVector")
        whiten.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputGVector")
        whiten.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputBVector")
        whiten.setValue(CIVector(x: 0, y: 0, z: 0, w: 0.05), forKey: "inputAVector")
        guard let grainLayer = whiten.outputImage else { return input }

        guard let composite = CIFilter(name: "CISourceOverCompositing") else { return input }
        composite.setValue(grainLayer, forKey: kCIInputImageKey)
        composite.setValue(input, forKey: kCIInputBackgroundImageKey)
        return composite.outputImage?.cropped(to: extent) ?? input
    }
}
