import CoreGraphics
import CoreImage
import CoreVideo
import Foundation
import ImageIO
import QuartzCore
import Vision

protocol CallFaceEffectsRendererProviding: AnyObject {
    nonisolated func render(
        _ effect: CallFaceEffect,
        on image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        intensity: Float,
        isDegraded: Bool
    ) -> CIImage
    nonisolated func reset()
}

nonisolated final class CallFaceEffectsRenderer: CallFaceEffectsRendererProviding, @unchecked Sendable {
    private let lock = NSLock()
    private let sequenceHandler = VNSequenceRequestHandler()
    private let clockOrigin = CACurrentMediaTime()
    private let seed: UInt64 = 0x4D65_6573_6879_2A2A
    private var landmarks: CallFaceLandmarks?
    private var frameCounter = 0
    private var missedDetections = 0
    private var sprites: [String: CIImage] = [:]

    init() {}

    func reset() {
        lock.lock()
        defer { lock.unlock() }
        landmarks = nil
        frameCounter = 0
        missedDetections = 0
        sprites = [:]
    }

    func render(
        _ effect: CallFaceEffect,
        on image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        intensity: Float,
        isDegraded: Bool
    ) -> CIImage {
        guard effect != .none else { return image }
        lock.lock()
        defer { lock.unlock() }

        let orientation = CallFrameOrientation.orientation(forRotation: rotation)
        let oriented = image.oriented(orientation)
        let uprightOrigin = oriented.extent.origin
        let upright = oriented.transformed(by: CGAffineTransform(translationX: -uprightOrigin.x, y: -uprightOrigin.y))
        let canvas = CGRect(origin: .zero, size: upright.extent.size)
        let face = effect.needsFace
            ? trackFace(in: pixelBuffer, orientation: orientation, canvas: canvas.size, isDegraded: isDegraded)
            : nil
        let time = CACurrentMediaTime() - clockOrigin

        let styled = stylize(effect, upright, face: face, canvas: canvas, intensity: intensity, time: time, isDegraded: isDegraded)
            .cropped(to: canvas)

        let restored = styled
            .transformed(by: CGAffineTransform(translationX: uprightOrigin.x, y: uprightOrigin.y))
            .oriented(CallFrameOrientation.inverse(of: orientation))
        let restoredOrigin = restored.extent.origin
        return restored
            .transformed(by: CGAffineTransform(
                translationX: image.extent.minX - restoredOrigin.x,
                y: image.extent.minY - restoredOrigin.y
            ))
            .cropped(to: image.extent)
    }

    private func stylize(
        _ effect: CallFaceEffect,
        _ image: CIImage,
        face: CallFaceLandmarks?,
        canvas: CGRect,
        intensity: Float,
        time: TimeInterval,
        isDegraded: Bool
    ) -> CIImage {
        switch effect {
        case .none: return image
        case .smoothing: return smoothing(image, face: face, canvas: canvas, intensity: intensity)
        case .toad: return toad(image, face: face, canvas: canvas, isDegraded: isDegraded)
        case .angel: return angel(image, face: face, canvas: canvas, time: time, isDegraded: isDegraded)
        case .demon: return demon(image, face: face, canvas: canvas, time: time)
        case .volcano: return volcano(image, canvas: canvas, time: time, isDegraded: isDegraded)
        }
    }

    // MARK: - Face tracking

    private func trackFace(in pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation, canvas: CGSize, isDegraded: Bool) -> CallFaceLandmarks? {
        frameCounter &+= 1
        let stride = CallFaceEffectBudget.detectionStride(isDegraded: isDegraded)
        let isDue = frameCounter % stride == 0 || (landmarks == nil && frameCounter % 2 == 0)
        guard isDue else { return landmarks }

        let request = VNDetectFaceLandmarksRequest()
        guard (try? sequenceHandler.perform([request], on: pixelBuffer, orientation: orientation)) != nil,
              let observation = request.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }) else {
            missedDetections += 1
            if missedDetections >= CallFaceEffectBudget.missesBeforeLosingFace { landmarks = nil }
            return landmarks
        }

        missedDetections = 0
        let detected = CallFaceLandmarks.fromNormalized(
            boundingBox: observation.boundingBox,
            leftEye: Self.center(of: observation.landmarks?.leftEye),
            rightEye: Self.center(of: observation.landmarks?.rightEye),
            imageSize: canvas
        )
        landmarks = landmarks?.smoothed(toward: detected, factor: CallFaceEffectBudget.landmarkSmoothing) ?? detected
        return landmarks
    }

    private static func center(of region: VNFaceLandmarkRegion2D?) -> CGPoint? {
        guard let points = region?.normalizedPoints, !points.isEmpty else { return nil }
        let sum = points.reduce(CGPoint.zero) { CGPoint(x: $0.x + $1.x, y: $0.y + $1.y) }
        return CGPoint(x: sum.x / CGFloat(points.count), y: sum.y / CGFloat(points.count))
    }

    // MARK: - Effects

    private func smoothing(_ image: CIImage, face: CallFaceLandmarks?, canvas: CGRect, intensity: Float) -> CIImage {
        guard let face, intensity > 0 else { return image }
        let sigma = max(1, Double(face.bounds.width) * 0.045 * Double(intensity))
        let blurred = image.clampedToExtent().applyingGaussianBlur(sigma: sigma).cropped(to: canvas)
        let mask = Self.ellipseMask(around: face.bounds, strength: 0.8)
        return blurred.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: image,
            kCIInputMaskImageKey: mask
        ])
    }

    private func toad(_ image: CIImage, face: CallFaceLandmarks?, canvas: CGRect, isDegraded: Bool) -> CIImage {
        let green = CIColor(red: 0.36, green: 0.78, blue: 0.24)
        guard let face else {
            return Self.monochrome(image, color: green, intensity: 0.22)
        }
        let bounds = face.bounds
        let cheeks = CallFaceEffectGeometry.cheekCenters(for: bounds)
            .map { ($0, bounds.width * 0.2, 0.45) }
        let eyes = CallFaceEffectGeometry.eyeCenters(for: face)
            .map { ($0, bounds.width * 0.11, 0.55) }
        let bumped = (cheeks + eyes).reduce(image) { current, bump in
            current.applyingFilter("CIBumpDistortion", parameters: [
                kCIInputCenterKey: CIVector(cgPoint: bump.0),
                kCIInputRadiusKey: bump.1,
                kCIInputScaleKey: bump.2
            ])
        }.cropped(to: canvas)

        let tinted = Self.monochrome(bumped, color: green, intensity: 0.65)
        let skin = tinted.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: bumped,
            kCIInputMaskImageKey: Self.ellipseMask(around: bounds, strength: 1)
        ])

        let radius = CallFaceEffectGeometry.wartRadius(for: bounds)
        let warts = CallFaceEffectGeometry
            .wartCenters(for: bounds, count: CallFaceEffectBudget.wartCount(isDegraded: isDegraded), seed: seed)
            .map { Self.spot(at: $0, radius: radius, color: CIColor(red: 0.22, green: 0.38, blue: 0.12, alpha: 0.9)) }
        return warts.reduce(skin) { $1.composited(over: $0) }
    }

    private func angel(_ image: CIImage, face: CallFaceLandmarks?, canvas: CGRect, time: TimeInterval, isDegraded: Bool) -> CIImage {
        let glowing = CallFaceEffectBudget.allowsBloom(isDegraded: isDegraded)
            ? image.applyingFilter("CIBloom", parameters: [
                kCIInputRadiusKey: max(4, canvas.width * 0.015),
                kCIInputIntensityKey: 0.55
            ]).cropped(to: canvas)
            : image
        let warm = glowing.applyingFilter("CIColorControls", parameters: [
            kCIInputBrightnessKey: 0.03,
            kCIInputSaturationKey: 1.05,
            kCIInputContrastKey: 1.0
        ])
        guard let face else { return warm }
        let rect = CallFaceEffectGeometry.haloRect(for: face.bounds)
        guard let halo = sprite(named: "halo", size: rect.size, draw: Self.drawHalo) else { return warm }
        let shimmer = CallFaceEffectGeometry.shimmer(time: time)
        return Self.place(halo, in: rect)
            .applyingFilter("CIColorMatrix", parameters: ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: shimmer)])
            .composited(over: warm)
    }

    private func demon(_ image: CIImage, face: CallFaceLandmarks?, canvas: CGRect, time: TimeInterval) -> CIImage {
        let red = image
            .applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 1.18, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: 0.8, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 0.78, w: 0),
                "inputBiasVector": CIVector(x: 0.02, y: 0, z: 0, w: 0)
            ])
            .applyingFilter("CIVignette", parameters: [kCIInputIntensityKey: 0.9, kCIInputRadiusKey: 1.6])
            .cropped(to: canvas)
        guard let face else { return red }

        let horns = CallFaceEffectGeometry.hornRects(for: face.bounds)
        let withHorns: CIImage = {
            guard horns.count == 2,
                  let horn = self.sprite(named: "horn", size: horns[0].size, draw: Self.drawHorn) else { return red }
            let left = Self.place(horn, in: horns[0])
            let right = Self.placeMirrored(horn, in: horns[1])
            return right.composited(over: left.composited(over: red))
        }()

        let radius = CallFaceEffectGeometry.eyeGlowRadius(for: face.bounds, time: time)
        return CallFaceEffectGeometry.eyeCenters(for: face)
            .map { Self.spot(at: $0, radius: radius, color: CIColor(red: 1, green: 0.12, blue: 0.04, alpha: 0.95)) }
            .reduce(withHorns) { base, glow in
                glow.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: base])
            }
    }

    private func volcano(_ image: CIImage, canvas: CGRect, time: TimeInterval, isDegraded: Bool) -> CIImage {
        let graded = image.applyingFilter("CIColorMatrix", parameters: [
            "inputRVector": CIVector(x: 1.12, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0.9, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0.72, w: 0),
            "inputBiasVector": CIVector(x: 0.03, y: 0.01, z: 0, w: 0)
        ])
        let lavaHeight = CallFaceEffectGeometry.lavaHeight(time: time, canvasHeight: canvas.height)
        let pulse = 0.75 + 0.2 * sin(time * 3.1)
        let lava = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: canvas.midX, y: canvas.minY),
            "inputPoint1": CIVector(x: canvas.midX, y: canvas.minY + lavaHeight),
            "inputColor0": CIColor(red: 1, green: 0.32, blue: 0.02, alpha: CGFloat(pulse)),
            "inputColor1": CIColor(red: 1, green: 0.55, blue: 0.05, alpha: 0)
        ])?.outputImage?.cropped(to: canvas)
        let withLava = lava.map { $0.composited(over: graded) } ?? graded

        return CallFaceEffectGeometry
            .embers(count: CallFaceEffectBudget.emberCount(isDegraded: isDegraded), time: time, canvas: canvas, seed: seed)
            .map { Self.spot(at: $0.center, radius: $0.radius, color: CIColor(red: 1, green: 0.6, blue: 0.15, alpha: $0.opacity)) }
            .reduce(withLava) { base, ember in
                ember.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: base])
            }
            .cropped(to: canvas)
    }

    // MARK: - Building blocks

    private static func monochrome(_ image: CIImage, color: CIColor, intensity: Double) -> CIImage {
        image.applyingFilter("CIColorMonochrome", parameters: [
            kCIInputColorKey: color,
            kCIInputIntensityKey: intensity
        ])
    }

    private static func ellipseMask(around face: CGRect, strength: CGFloat) -> CIImage {
        let radius = face.width * 0.5
        let gradient = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 0, y: 0),
            "inputRadius0": radius * 0.55,
            "inputRadius1": radius * 1.05,
            "inputColor0": CIColor(red: strength, green: strength, blue: strength, alpha: 1),
            "inputColor1": CIColor(red: 0, green: 0, blue: 0, alpha: 1)
        ])?.outputImage ?? CIImage(color: .black)
        let aspect = face.width > 0 ? face.height / face.width : 1
        return gradient
            .transformed(by: CGAffineTransform(scaleX: 1, y: aspect))
            .transformed(by: CGAffineTransform(translationX: face.midX, y: face.midY))
    }

    private static func spot(at center: CGPoint, radius: CGFloat, color: CIColor) -> CIImage {
        let clear = CIColor(red: color.red, green: color.green, blue: color.blue, alpha: 0)
        let gradient = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(cgPoint: center),
            "inputRadius0": radius * 0.25,
            "inputRadius1": max(radius, 1),
            "inputColor0": color,
            "inputColor1": clear
        ])?.outputImage ?? CIImage.empty()
        return gradient.cropped(to: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    }

    private static func place(_ sprite: CIImage, in rect: CGRect) -> CIImage {
        let extent = sprite.extent
        guard extent.width > 0, extent.height > 0 else { return CIImage.empty() }
        return sprite.transformed(by: CGAffineTransform(
            a: rect.width / extent.width, b: 0,
            c: 0, d: rect.height / extent.height,
            tx: rect.minX, ty: rect.minY
        ))
    }

    private static func placeMirrored(_ sprite: CIImage, in rect: CGRect) -> CIImage {
        let extent = sprite.extent
        guard extent.width > 0, extent.height > 0 else { return CIImage.empty() }
        return sprite.transformed(by: CGAffineTransform(
            a: -rect.width / extent.width, b: 0,
            c: 0, d: rect.height / extent.height,
            tx: rect.maxX, ty: rect.minY
        ))
    }

    // MARK: - Sprites

    private func sprite(named name: String, size: CGSize, draw: (CGContext, CGSize) -> Void) -> CIImage? {
        let width = Self.quantized(size.width)
        let height = Self.quantized(size.height)
        let key = "\(name)-\(width)x\(height)"
        if let cached = sprites[key] { return cached }
        guard let bitmap = Self.bitmap(width: width, height: height, draw: draw) else { return nil }
        if sprites.count >= 24 { sprites = [:] }
        let image = CIImage(cgImage: bitmap)
        sprites[key] = image
        return image
    }

    private static func quantized(_ value: CGFloat) -> Int {
        max(16, min(1024, Int((value / 16).rounded()) * 16))
    }

    private static func bitmap(width: Int, height: Int, draw: (CGContext, CGSize) -> Void) -> CGImage? {
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        draw(context, CGSize(width: width, height: height))
        return context.makeImage()
    }

    private static func drawHalo(_ context: CGContext, _ size: CGSize) {
        let lineWidth = size.height * 0.16
        let ring = CGRect(origin: .zero, size: size).insetBy(dx: size.height * 0.24, dy: size.height * 0.24)
        context.setShadow(offset: .zero, blur: size.height * 0.22, color: CGColor(red: 1, green: 0.82, blue: 0.3, alpha: 0.95))
        context.setStrokeColor(CGColor(red: 1, green: 0.8, blue: 0.28, alpha: 1))
        context.setLineWidth(lineWidth)
        context.strokeEllipse(in: ring)
        context.setShadow(offset: .zero, blur: 0, color: nil)
        context.setStrokeColor(CGColor(red: 1, green: 0.97, blue: 0.78, alpha: 0.9))
        context.setLineWidth(lineWidth * 0.35)
        context.strokeEllipse(in: ring)
    }

    private static func drawHorn(_ context: CGContext, _ size: CGSize) {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: size.width * 0.22, y: 0))
        path.addQuadCurve(to: CGPoint(x: size.width * 0.04, y: size.height * 0.98), control: CGPoint(x: size.width * 0.02, y: size.height * 0.5))
        path.addQuadCurve(to: CGPoint(x: size.width * 0.92, y: 0), control: CGPoint(x: size.width * 0.62, y: size.height * 0.42))
        path.closeSubpath()

        context.saveGState()
        context.addPath(path)
        context.clip()
        let colors = [
            CGColor(red: 0.42, green: 0.02, blue: 0.03, alpha: 1),
            CGColor(red: 0.86, green: 0.1, blue: 0.08, alpha: 1),
            CGColor(red: 1, green: 0.45, blue: 0.3, alpha: 1)
        ] as CFArray
        if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.65, 1]) {
            context.drawLinearGradient(
                gradient,
                start: CGPoint(x: size.width * 0.5, y: 0),
                end: CGPoint(x: size.width * 0.1, y: size.height),
                options: []
            )
        }
        context.restoreGState()

        context.addPath(path)
        context.setStrokeColor(CGColor(red: 0.2, green: 0, blue: 0, alpha: 0.85))
        context.setLineWidth(max(1, size.width * 0.03))
        context.strokePath()
    }
}
