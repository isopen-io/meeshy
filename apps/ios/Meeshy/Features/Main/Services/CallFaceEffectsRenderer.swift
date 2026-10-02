import CoreGraphics
import CoreImage
import CoreVideo
import Foundation
import ImageIO
import QuartzCore

protocol CallFaceEffectsRendererProviding: AnyObject {
    nonisolated func render(
        _ effect: CallFaceEffect,
        on image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        intensity: Float,
        isDegraded: Bool
    ) -> CIImage
    /// #9196 — Teint naturel et Peau lissée sur le visage suivi. `nil` quand
    /// aucun visage n'est connu : l'image n'a alors rien à payer de plus.
    nonisolated func retouch(
        _ image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        plan: CallSkinRetouchPlan,
        isDegraded: Bool
    ) -> CIImage?
    nonisolated func reset()
}

extension CallFaceEffectsRendererProviding {
    nonisolated func retouch(
        _ image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        plan: CallSkinRetouchPlan,
        isDegraded: Bool
    ) -> CIImage? {
        nil
    }
}

nonisolated final class CallFaceEffectsRenderer: CallFaceEffectsRendererProviding, @unchecked Sendable {
    private let lock = NSLock()
    private let tracker: CallFaceTracker
    private let isReduceMotionEnabled: @Sendable () -> Bool
    private let clock: @Sendable () -> CFTimeInterval
    private let clockOrigin: CFTimeInterval
    private let seed: UInt64 = 0x4D65_6573_6879_2A2A
    private var sprites: [String: CIImage] = [:]
    private var spriteDraws: [String: Int] = [:]

    init(
        detector: any CallFaceLandmarkDetecting = VisionFaceLandmarkDetector(),
        executor: any CallVisionExecuting = CallVisionQueueExecutor(label: "me.meeshy.call.face-landmarks"),
        isReduceMotionEnabled: @escaping @Sendable () -> Bool = { CallMotionPreference.shared.isReduceMotionEnabled },
        clock: @escaping @Sendable () -> CFTimeInterval = { CACurrentMediaTime() }
    ) {
        self.tracker = CallFaceTracker(detector: detector, executor: executor)
        self.isReduceMotionEnabled = isReduceMotionEnabled
        self.clock = clock
        self.clockOrigin = clock()
    }

    func reset() {
        tracker.reset()
        lock.lock()
        defer { lock.unlock() }
        sprites = [:]
    }

    var spriteDrawCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return spriteDraws.values.reduce(0, +)
    }

    func spriteDrawCount(prefix: String) -> Int {
        lock.lock()
        defer { lock.unlock() }
        return spriteDraws.filter { $0.key.hasPrefix(prefix) }.values.reduce(0, +)
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

        let isAnimated = !isReduceMotionEnabled()
        let time = isAnimated ? clock() - clockOrigin : 0
        return Self.upright(image, rotation: rotation) { upright, canvas, orientation in
            let face = effect.needsFace
                ? tracker.landmarks(for: pixelBuffer, orientation: orientation, canvas: canvas.size, isDegraded: isDegraded)
                : nil
            return stylize(effect, upright, face: face, canvas: canvas, intensity: intensity, time: time, isAnimated: isAnimated, isDegraded: isDegraded)
        } ?? image
    }

    func retouch(
        _ image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        plan: CallSkinRetouchPlan,
        isDegraded: Bool
    ) -> CIImage? {
        lock.lock()
        defer { lock.unlock() }
        return Self.upright(image, rotation: rotation) { upright, canvas, orientation in
            guard let face = tracker.landmarks(for: pixelBuffer, orientation: orientation, canvas: canvas.size, isDegraded: isDegraded) else {
                return nil
            }
            return CallSkinRetoucher.apply(plan, to: upright, face: face, canvas: canvas)
        }
    }

    /// Redresse l'image (le visage se cherche et se dessine debout), applique
    /// `body`, puis rend l'image dans son orientation et son étendue d'origine.
    private static func upright(
        _ image: CIImage,
        rotation: Int,
        _ body: (CIImage, CGRect, CGImagePropertyOrientation) -> CIImage?
    ) -> CIImage? {
        let orientation = CallFrameOrientation.orientation(forRotation: rotation)
        let oriented = image.oriented(orientation)
        let uprightOrigin = oriented.extent.origin
        let upright = oriented.transformed(by: CGAffineTransform(translationX: -uprightOrigin.x, y: -uprightOrigin.y))
        let canvas = CGRect(origin: .zero, size: upright.extent.size)
        guard let styled = body(upright, canvas, orientation)?.cropped(to: canvas) else { return nil }

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
        isAnimated: Bool,
        isDegraded: Bool
    ) -> CIImage {
        switch effect {
        case .none: return image
        case .smoothing: return smoothing(image, face: face, canvas: canvas, intensity: intensity)
        case .toad: return toad(image, face: face, canvas: canvas, isDegraded: isDegraded)
        case .angel: return angel(image, face: face, canvas: canvas, time: time, isDegraded: isDegraded)
        case .demon: return demon(image, face: face, canvas: canvas, time: time)
        case .volcano: return volcano(image, canvas: canvas, time: time, isAnimated: isAnimated, isDegraded: isDegraded)
        }
    }

    // MARK: - Effects

    /// Peau lissée appelée comme un effet (aperçu, chemin historique) : même
    /// séparation de fréquences que la retouche de l'appel, sans Teint naturel.
    private func smoothing(_ image: CIImage, face: CallFaceLandmarks?, canvas: CGRect, intensity: Float) -> CIImage {
        guard let face, intensity > 0 else { return image }
        let plan = CallSkinRetouchPlan(
            tone: 0,
            smoothing: min(intensity, 1),
            texture: CallSkinRetouchPlan.textureKept,
            underEye: min(intensity, 1) * CallSkinRetouchPlan.underEyeShare,
            usesFinePass: true
        )
        return CallSkinRetoucher.apply(plan, to: image, face: face, canvas: canvas)
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
            ? Self.glow(image, canvas: canvas, radius: max(4, canvas.width * 0.015), intensity: 0.55)
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

    private func volcano(_ image: CIImage, canvas: CGRect, time: TimeInterval, isAnimated: Bool, isDegraded: Bool) -> CIImage {
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
        guard isAnimated else { return withLava.cropped(to: canvas) }

        let levels = CallFaceEffectBudget.emberOpacityLevels
        let embers = CallFaceEffectGeometry
            .embers(count: CallFaceEffectBudget.emberCount(isDegraded: isDegraded), time: time, canvas: canvas, seed: seed)
            .compactMap { ember -> CIImage? in
                let level = min(levels, Int((ember.opacity * CGFloat(levels)).rounded(.up)))
                guard level > 0,
                      let sprite = sprite(named: "ember-\(level)", size: Self.emberSpriteSize, draw: Self.drawEmber(alpha: CGFloat(level) / CGFloat(levels)))
                else { return nil }
                return Self.place(sprite, in: CGRect(
                    x: ember.center.x - ember.radius,
                    y: ember.center.y - ember.radius,
                    width: ember.radius * 2,
                    height: ember.radius * 2
                ))
            }
        guard !embers.isEmpty else { return withLava.cropped(to: canvas) }
        return embers
            .reduce(CIImage.empty()) { $1.composited(over: $0) }
            .applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: withLava])
            .cropped(to: canvas)
    }

    // MARK: - Building blocks

    /// Le halo de l'ange : flou calculé au quart de la résolution puis ajouté en
    /// écran — l'éclat d'un `CIBloom` pour un seizième de ses pixels.
    private static func glow(_ image: CIImage, canvas: CGRect, radius: CGFloat, intensity: CGFloat) -> CIImage {
        let down = CGAffineTransform(scaleX: CallFaceEffectBudget.glowReduction, y: CallFaceEffectBudget.glowReduction)
        let reduced = image.transformed(by: down)
        return reduced
            .clampedToExtent()
            .applyingGaussianBlur(sigma: Double(radius * CallFaceEffectBudget.glowReduction))
            .cropped(to: reduced.extent)
            .clampedToExtent()
            .transformed(by: down.inverted())
            .cropped(to: canvas)
            .applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: intensity, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: intensity, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: intensity, w: 0)
            ])
            .applyingFilter("CIScreenBlendMode", parameters: [kCIInputBackgroundImageKey: image])
            .cropped(to: canvas)
    }

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
        spriteDraws[name, default: 0] += 1
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

    private static let emberSpriteSize = CGSize(width: 32, height: 32)

    private static func drawEmber(alpha: CGFloat) -> (CGContext, CGSize) -> Void {
        { context, size in
            let colors = [
                CGColor(red: 1, green: 0.6, blue: 0.15, alpha: alpha),
                CGColor(red: 1, green: 0.6, blue: 0.15, alpha: 0)
            ] as CFArray
            guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = size.width / 2
            context.drawRadialGradient(
                gradient,
                startCenter: center,
                startRadius: radius * 0.25,
                endCenter: center,
                endRadius: radius,
                options: [.drawsBeforeStartLocation]
            )
        }
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
