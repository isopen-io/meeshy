import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - Image Filter

/// Look-preset applied as the first stage of the render pipeline.
public enum ImageFilter: String, CaseIterable, Identifiable, Codable, Sendable {
    case original, vivid, dramatic, mono, noir, sepia
    case warm, cool, fade, chrome, process, instant

    public var id: String { rawValue }

    public var displayName: String {
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

    /// Filters surfaced in Simple mode. Pro mode shows every case.
    public var isEssential: Bool {
        switch self {
        case .original, .vivid, .dramatic, .mono, .warm, .cool: return true
        default: return false
        }
    }
}

// MARK: - Image Effect

/// One-tap creative effect applied as the final pipeline stage. Distinct from
/// the fine-grained `ImageAdjustments` sliders — effects are bold presets.
public enum ImageEffect: String, CaseIterable, Identifiable, Codable, Sendable {
    case none, blur, vignette, sharpen, bloom, grain

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .none: return "Aucun"
        case .blur: return "Flou"
        case .vignette: return "Vignette"
        case .sharpen: return "Nettet\u{00E9}"
        case .bloom: return "Bloom"
        case .grain: return "Grain"
        }
    }

    public var iconName: String {
        switch self {
        case .none: return "circle.slash"
        case .blur: return "aqi.medium"
        case .vignette: return "camera.filters"
        case .sharpen: return "sparkle"
        case .bloom: return "sun.max.trianglebadge.exclamationmark"
        case .grain: return "circle.dotted"
        }
    }
}

// MARK: - Image Filter Engine

/// Stateless GPU-backed renderer. It owns nothing but an immutable `CIContext`
/// and turns an `(image, ImageEditState)` pair into a rendered `UIImage`.
///
/// Keeping the renderer free of edit state enforces the strict UI / rendering /
/// processing separation: `ImageEditorViewModel` holds the state, the view
/// holds presentation concerns, and this type only knows how to draw pixels.
/// The same `render` runs on a small working copy for live preview and on the
/// full-resolution original for export, so previews are always faithful.
public final class ImageFilterEngine {

    private let context: CIContext

    public init() {
        // Metal-backed: CoreImage filters run on the GPU.
        self.context = CIContext(options: [.useSoftwareRenderer: false])
    }

    // MARK: - Full render

    /// Full non-destructive pipeline: orientation → crop → filter → adjustments
    /// → effect. Geometry is baked first so colour stages always operate on the
    /// final framing.
    public func render(_ source: UIImage, state: ImageEditState) -> UIImage {
        let base = renderGeometryOnly(source, state: state, applyCrop: true)
        guard let cg = base.cgImage else { return base }

        let input = CIImage(cgImage: cg)
        let extent = input.extent
        guard extent.width >= 1, extent.height >= 1 else { return base }

        var ci = applyFilter(input, filter: state.filter)
        ci = applyAdjustments(ci, state.adjustments, extent: extent)
        ci = applyEffect(ci, effect: state.effect, extent: extent)

        guard let output = context.createCGImage(ci, from: extent) else { return base }
        return UIImage(cgImage: output, scale: source.scale, orientation: .up)
    }

    /// Geometry-only render — orientation, flips and (optionally) crop, with no
    /// colour stages. Used for the crop tool backdrop (`applyCrop: false`) and
    /// the before/after comparison image (`applyCrop: true`).
    public func renderGeometryOnly(_ source: UIImage, state: ImageEditState, applyCrop: Bool) -> UIImage {
        let oriented = orient(
            source,
            turns: state.orientationTurns,
            flipH: state.flipHorizontal,
            flipV: state.flipVertical
        )
        guard applyCrop else { return oriented }
        return crop(oriented, normalized: state.cropNormalized)
    }

    // MARK: - Thumbnails

    /// Renders one preview thumbnail per filter from a downscaled copy of the
    /// source. The source should already be geometry-resolved (oriented +
    /// cropped) so thumbnails match the live canvas framing.
    public func filterThumbnails(for source: UIImage, maxPixel: CGFloat = 240) -> [ImageFilter: UIImage] {
        guard let resized = downscaled(source, maxPixel: maxPixel),
              let cg = resized.cgImage else { return [:] }

        let base = CIImage(cgImage: cg)
        let extent = base.extent
        var output: [ImageFilter: UIImage] = [:]
        for filter in ImageFilter.allCases {
            let filtered = applyFilter(base, filter: filter)
            if let result = context.createCGImage(filtered, from: extent) {
                output[filter] = UIImage(cgImage: result)
            }
        }
        return output
    }

    /// Returns a copy of `image` whose longest side is at most `maxPixel`
    /// pixels. Returns the original when it is already small enough. Used to
    /// build the lightweight working copy that backs live preview so even a
    /// 48-megapixel import never stalls the render loop.
    public func downscaled(_ image: UIImage, maxPixel: CGFloat) -> UIImage? {
        let pixelSize = CGSize(
            width: image.size.width * image.scale,
            height: image.size.height * image.scale
        )
        let longest = max(pixelSize.width, pixelSize.height)
        guard longest > maxPixel, longest > 0 else { return image }

        let ratio = maxPixel / longest
        let target = CGSize(width: pixelSize.width * ratio, height: pixelSize.height * ratio)
        guard target.width >= 1, target.height >= 1 else { return image }

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    // MARK: - Geometry

    private func orient(_ image: UIImage, turns: Int, flipH: Bool, flipV: Bool) -> UIImage {
        let t = ((turns % 4) + 4) % 4
        if t == 0, !flipH, !flipV, image.imageOrientation == .up {
            return image
        }

        let size = image.size
        guard size.width > 0, size.height > 0 else { return image }
        let swap = (t == 1 || t == 3)
        let canvas = swap ? CGSize(width: size.height, height: size.width) : size

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: canvas, format: format)
        return renderer.image { ctx in
            let cg = ctx.cgContext
            cg.translateBy(x: canvas.width / 2, y: canvas.height / 2)
            if t != 0 { cg.rotate(by: CGFloat(t) * .pi / 2) }
            if flipH || flipV { cg.scaleBy(x: flipH ? -1 : 1, y: flipV ? -1 : 1) }
            image.draw(in: CGRect(
                x: -size.width / 2, y: -size.height / 2,
                width: size.width, height: size.height
            ))
        }
    }

    private func crop(_ image: UIImage, normalized: CGRect?) -> UIImage {
        guard let normalized, let cg = image.cgImage else { return image }
        let pxWidth = CGFloat(cg.width)
        let pxHeight = CGFloat(cg.height)
        guard pxWidth >= 1, pxHeight >= 1 else { return image }

        let pixelRect = CGRect(
            x: normalized.minX * pxWidth,
            y: normalized.minY * pxHeight,
            width: normalized.width * pxWidth,
            height: normalized.height * pxHeight
        ).integral

        let bounds = CGRect(x: 0, y: 0, width: pxWidth, height: pxHeight)
        let clamped = pixelRect.intersection(bounds)
        guard clamped.width >= 1, clamped.height >= 1,
              let cropped = cg.cropping(to: clamped) else { return image }
        return UIImage(cgImage: cropped, scale: image.scale, orientation: .up)
    }

    // MARK: - Filter stage

    private func applyFilter(_ input: CIImage, filter: ImageFilter) -> CIImage {
        switch filter {
        case .original:
            return input
        case .vivid:
            return colorControls(input, saturation: 1.5, contrast: 1.15)
        case .dramatic:
            let adjusted = colorControls(input, contrast: 1.4)
            return vignette(adjusted, intensity: 1.5, radius: 1)
        case .mono:
            return named("CIPhotoEffectMono", input)
        case .noir:
            return named("CIPhotoEffectNoir", input)
        case .sepia:
            return ciFilter("CISepiaTone", on: input, [kCIInputIntensityKey: 0.7])
        case .warm:
            return temperature(input, target: 7800)
        case .cool:
            return temperature(input, target: 5200)
        case .fade:
            return named("CIPhotoEffectFade", input)
        case .chrome:
            return named("CIPhotoEffectChrome", input)
        case .process:
            return named("CIPhotoEffectProcess", input)
        case .instant:
            return named("CIPhotoEffectInstant", input)
        }
    }

    // MARK: - Adjustment stage

    private func applyAdjustments(_ input: CIImage, _ adjustments: ImageAdjustments, extent: CGRect) -> CIImage {
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

        return result
    }

    // MARK: - Effect stage

    private func applyEffect(_ input: CIImage, effect: ImageEffect, extent: CGRect) -> CIImage {
        switch effect {
        case .none:
            return input
        case .blur:
            let blurred = ciFilter("CIGaussianBlur", on: input.clampedToExtent(), [kCIInputRadiusKey: 8.0])
            return blurred.cropped(to: extent)
        case .vignette:
            return vignette(input, intensity: 2, radius: 1)
        case .sharpen:
            return ciFilter("CISharpenLuminance", on: input, [kCIInputSharpnessKey: 0.8])
        case .bloom:
            let bloomed = ciFilter("CIBloom", on: input, [
                kCIInputRadiusKey: 10.0,
                kCIInputIntensityKey: 0.5
            ])
            return bloomed.cropped(to: extent)
        case .grain:
            return grain(input, extent: extent)
        }
    }

    // MARK: - Filter helpers

    private func named(_ name: String, _ input: CIImage) -> CIImage {
        ciFilter(name, on: input, [:])
    }

    private func ciFilter(_ name: String, on input: CIImage, _ parameters: [String: Any]) -> CIImage {
        guard let filter = CIFilter(name: name) else { return input }
        filter.setValue(input, forKey: kCIInputImageKey)
        for (key, value) in parameters {
            filter.setValue(value, forKey: key)
        }
        return filter.outputImage ?? input
    }

    private func colorControls(
        _ input: CIImage,
        saturation: Float = 1,
        contrast: Float = 1,
        brightness: Float = 0
    ) -> CIImage {
        ciFilter("CIColorControls", on: input, [
            kCIInputBrightnessKey: brightness,
            kCIInputContrastKey: contrast,
            kCIInputSaturationKey: saturation
        ])
    }

    private func temperature(_ input: CIImage, target: Float) -> CIImage {
        guard let filter = CIFilter(name: "CITemperatureAndTint") else { return input }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(CIVector(x: 6500, y: 0), forKey: "inputNeutral")
        filter.setValue(CIVector(x: CGFloat(target), y: 0), forKey: "inputTargetNeutral")
        return filter.outputImage ?? input
    }

    private func vignette(_ input: CIImage, intensity: Float, radius: Float) -> CIImage {
        ciFilter("CIVignette", on: input, [
            kCIInputIntensityKey: intensity,
            kCIInputRadiusKey: radius
        ])
    }

    private func grain(_ input: CIImage, extent: CGRect) -> CIImage {
        guard let noise = CIFilter(name: "CIRandomGenerator")?.outputImage else { return input }
        let cropped = noise.cropped(to: extent)

        let grainLayer = ciFilter("CIColorMatrix", on: cropped, [
            "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0.05)
        ])

        guard let composite = CIFilter(name: "CISourceOverCompositing") else { return input }
        composite.setValue(grainLayer, forKey: kCIInputImageKey)
        composite.setValue(input, forKey: kCIInputBackgroundImageKey)
        return composite.outputImage?.cropped(to: extent) ?? input
    }
}
