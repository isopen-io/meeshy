import CoreImage
import CoreVideo
import ImageIO
import XCTest
@testable import Meeshy

/// #9196 — Teint naturel + Peau lissée : la politique (quand), la géométrie du
/// masque (où), le noyau Metal (comment) et le branchement au pipeline.
@MainActor
final class CallSkinRetouchTests: XCTestCase {

    // MARK: - Plan

    private func overBudget(frames: Int) -> CallVideoDegradation {
        (0..<frames).reduce(CallVideoDegradation()) { ladder, _ in ladder.recording(elapsedMs: 40, blurActive: false) }
    }

    func test_make_defaultConfig_appliesNaturalComplexionOnly() {
        let plan = CallSkinRetouchPlan.make(config: .default, ladder: CallVideoDegradation(), isConstrained: false)
        XCTAssertEqual(plan?.tone, 1)
        XCTAssertEqual(plan?.smoothing, 0)
        XCTAssertEqual(plan?.underEye, 0)
        XCTAssertEqual(plan?.usesFinePass, true)
    }

    func test_make_naturalComplexionOffAndNoSmoothing_returnsNil() {
        var config = VideoFilterConfig.default
        config.naturalComplexionEnabled = false
        XCTAssertNil(CallSkinRetouchPlan.make(config: config, ladder: CallVideoDegradation(), isConstrained: false))
    }

    func test_make_smoothingSelected_carriesTheSliderAndKeepsTexture() {
        var config = VideoFilterConfig.default.selectingFaceEffect(.smoothing)
        config.skinSmoothingIntensity = 0.45
        let plan = CallSkinRetouchPlan.make(config: config, ladder: CallVideoDegradation(), isConstrained: false)
        XCTAssertEqual(plan?.tone, 1)
        XCTAssertEqual(plan?.smoothing, 0.45)
        XCTAssertEqual(plan?.texture, CallSkinRetouchPlan.textureKept)
        XCTAssertEqual(plan?.texture ?? 0, 0.35, accuracy: 0.0001)
        XCTAssertEqual(plan?.underEye ?? 0, 0.45 * CallSkinRetouchPlan.underEyeShare, accuracy: 0.0001)
    }

    func test_make_intensityAboveOne_isClamped() {
        var config = VideoFilterConfig.default.selectingFaceEffect(.smoothing)
        config.skinSmoothingIntensity = 3
        XCTAssertEqual(CallSkinRetouchPlan.make(config: config, ladder: CallVideoDegradation(), isConstrained: false)?.smoothing, 1)
    }

    func test_make_constrainedDevice_dropsNaturalComplexionAndTheFinePass() {
        let alone = CallSkinRetouchPlan.make(config: .default, ladder: CallVideoDegradation(), isConstrained: true)
        XCTAssertNil(alone, "Teint naturel ne coûte rien à un appareil qui se protège")

        let smoothing = CallSkinRetouchPlan.make(
            config: VideoFilterConfig.default.selectingFaceEffect(.smoothing),
            ladder: CallVideoDegradation(),
            isConstrained: true
        )
        XCTAssertEqual(smoothing?.tone, 0)
        XCTAssertEqual(smoothing?.smoothing, 0.4)
        XCTAssertEqual(smoothing?.usesFinePass, false)
    }

    func test_make_smoothingDegraded_dropsSmoothingButKeepsTheTone() {
        let ladder = overBudget(frames: CallVideoDegradation.overBudgetFrames / 2)
        XCTAssertTrue(ladder.isSmoothingDegraded)
        let plan = CallSkinRetouchPlan.make(
            config: VideoFilterConfig.default.selectingFaceEffect(.smoothing),
            ladder: ladder,
            isConstrained: false
        )
        XCTAssertEqual(plan?.smoothing, 0)
        XCTAssertEqual(plan?.tone, 1)
        XCTAssertEqual(plan?.usesFinePass, false)
    }

    func test_make_exhaustedLadder_dropsNaturalComplexion() {
        let ladder = overBudget(frames: CallVideoDegradation.overBudgetFrames)
        XCTAssertTrue(ladder.isExhausted)
        XCTAssertNil(CallSkinRetouchPlan.make(config: .default, ladder: ladder, isConstrained: false))
    }

    func test_make_stylizedPreset_returnsNil() {
        XCTAssertNil(CallSkinRetouchPlan.make(
            config: VideoFilterConfig.default.selectingFaceEffect(.angel),
            ladder: CallVideoDegradation(),
            isConstrained: false
        ))
    }

    func test_applyingPreset_keepsNaturalComplexionChoice() {
        var config = VideoFilterConfig.default
        config.naturalComplexionEnabled = false
        XCTAssertFalse(config.applyingPreset(.warm).naturalComplexionEnabled)
        XCTAssertFalse(config.applyingPreset(nil).naturalComplexionEnabled)
    }

    func test_default_naturalComplexionIsOnButNotAnAdvancedFilter() {
        XCTAssertTrue(VideoFilterConfig.default.naturalComplexionEnabled)
        XCTAssertFalse(VideoFilterConfig.default.hasAdvancedFilters)
    }

    // MARK: - Geometry

    private static let faceBox = CGRect(x: 78, y: 58, width: 100, height: 140)
    private static let canvas = CGRect(x: 0, y: 0, width: 256, height: 256)

    private func levelFace(mouth: CGPoint? = nil) -> CallFaceLandmarks {
        CallFaceLandmarks(
            bounds: Self.faceBox,
            leftEye: CGPoint(x: 108, y: 145),
            rightEye: CGPoint(x: 148, y: 145),
            mouth: mouth
        )
    }

    func test_geometry_levelFace_cheeksAreSkinFeaturesAreNot() {
        let sut = CallSkinMaskGeometry(landmarks: levelFace())
        XCTAssertTrue(sut.isSkin(CGPoint(x: 98, y: 110)), "joue")
        XCTAssertTrue(sut.isSkin(CGPoint(x: 128, y: 185)), "front")
        XCTAssertFalse(sut.isSkin(CGPoint(x: 108, y: 145)), "œil")
        XCTAssertFalse(sut.isSkin(CGPoint(x: 148, y: 160)), "sourcil")
        XCTAssertFalse(sut.isSkin(CGPoint(x: 128, y: 89)), "bouche")
        XCTAssertFalse(sut.isSkin(CGPoint(x: 20, y: 20)), "hors du visage")
    }

    func test_geometry_detectedMouth_winsOverTheEstimate() {
        let sut = CallSkinMaskGeometry(landmarks: levelFace(mouth: CGPoint(x: 140, y: 80)))
        XCTAssertEqual(sut.mouth.center, CGPoint(x: 140, y: 80))
        XCTAssertFalse(sut.isSkin(CGPoint(x: 140, y: 80)))
    }

    func test_geometry_eyesInEitherOrder_giveTheSameMask() {
        let swapped = CallFaceLandmarks(bounds: Self.faceBox, leftEye: CGPoint(x: 148, y: 145), rightEye: CGPoint(x: 108, y: 145))
        XCTAssertEqual(CallSkinMaskGeometry(landmarks: swapped), CallSkinMaskGeometry(landmarks: levelFace()))
    }

    func test_geometry_tiltedEyes_tiltTheMaskWithTheHead() {
        let tilt = CGFloat.pi / 9
        let left = CGPoint(x: 108, y: 140)
        let right = CGPoint(x: 108 + 40 * cos(tilt), y: 140 + 40 * sin(tilt))
        let sut = CallSkinMaskGeometry(landmarks: CallFaceLandmarks(bounds: Self.faceBox, leftEye: left, rightEye: right))
        XCTAssertEqual(sut.rotation.dx, cos(tilt), accuracy: 0.001)
        XCTAssertEqual(sut.rotation.dy, sin(tilt), accuracy: 0.001)
        XCTAssertLessThan(sut.leftBrow.center.x, left.x, "le sourcil monte perpendiculairement à la ligne des yeux")
    }

    func test_geometry_absurdTilt_isClamped() {
        let sut = CallSkinMaskGeometry(landmarks: CallFaceLandmarks(
            bounds: Self.faceBox,
            leftEye: CGPoint(x: 120, y: 60),
            rightEye: CGPoint(x: 121, y: 190)
        ))
        XCTAssertEqual(atan2(sut.rotation.dy, sut.rotation.dx), CallSkinMaskGeometry.maxTilt, accuracy: 0.001)
    }

    func test_geometry_missingEyes_areEstimatedInsideTheFace() {
        let sut = CallSkinMaskGeometry(landmarks: CallFaceLandmarks(bounds: Self.faceBox))
        XCTAssertTrue(Self.faceBox.contains(sut.leftEye.center))
        XCTAssertTrue(Self.faceBox.contains(sut.rightEye.center))
        XCTAssertTrue(Self.faceBox.contains(sut.mouth.center))
        XCTAssertLessThan(sut.mouth.center.y, sut.leftEye.center.y)
    }

    func test_region_coversTheFaceAndStaysInTheCanvas() {
        let sut = CallSkinMaskGeometry(landmarks: levelFace())
        let region = sut.region(in: Self.canvas)
        XCTAssertTrue(region.contains(CGPoint(x: sut.face.center.x, y: sut.face.center.y + sut.face.radii.height * 0.99)))
        XCTAssertTrue(Self.canvas.contains(region))

        let corner = CallSkinMaskGeometry(landmarks: CallFaceLandmarks(bounds: CGRect(x: -40, y: -40, width: 100, height: 140)))
        XCTAssertTrue(Self.canvas.contains(corner.region(in: Self.canvas)))
    }

    // MARK: - Kernel

    func test_kernel_loadsFromTheAppLibrary() {
        XCTAssertNotNil(CallSkinRetouchKernel.shared, "MTL_COMPILER_FLAGS -fcikernel / MTLLINKER_FLAGS -cikernel manquants ?")
    }

    private static let lightSkin = (r: 0.85, g: 0.65, b: 0.55)
    private static let deepSkin = (r: 0.45, g: 0.30, b: 0.22)
    private static let cheek = CGPoint(x: 98, y: 110)
    private static let grayPatch = CGRect(x: 140, y: 95, width: 22, height: 22)

    /// Un visage de synthèse : fond gris, ovale de peau, une imperfection peu
    /// contrastée sur la joue gauche et une pastille grise (une branche de
    /// lunettes) sur la joue droite.
    private func syntheticFace(skin: (r: Double, g: Double, b: Double)) -> CIImage {
        let size = Int(Self.canvas.width)
        let context = CGContext(
            data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )!
        context.setFillColor(CGColor(colorSpace: CGColorSpaceCreateDeviceRGB(), components: [0.5, 0.5, 0.5, 1])!)
        context.fill(Self.canvas)
        context.setFillColor(CGColor(colorSpace: CGColorSpaceCreateDeviceRGB(), components: [skin.r, skin.g, skin.b, 1])!)
        context.fillEllipse(in: Self.faceBox.insetBy(dx: -8, dy: -8))
        context.setFillColor(CGColor(colorSpace: CGColorSpaceCreateDeviceRGB(), components: [skin.r - 0.06, skin.g - 0.06, skin.b - 0.05, 1])!)
        context.fillEllipse(in: CGRect(x: Self.cheek.x - 3, y: Self.cheek.y - 3, width: 6, height: 6))
        context.setFillColor(CGColor(colorSpace: CGColorSpaceCreateDeviceRGB(), components: [0.5, 0.5, 0.5, 1])!)
        context.fill(Self.grayPatch)
        return CIImage(cgImage: context.makeImage()!)
    }

    private let context = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])

    private func pixels(_ image: CIImage) -> [UInt8] {
        let size = Int(Self.canvas.width)
        var bytes = [UInt8](repeating: 0, count: size * size * 4)
        context.render(image, toBitmap: &bytes, rowBytes: size * 4, bounds: Self.canvas, format: .RGBA8, colorSpace: nil)
        return bytes
    }

    /// Luma et chroma (Y, Cb, Cr) moyennes d'un carré centré sur `point`, en 0…1.
    private func ycc(_ image: CIImage, at point: CGPoint, radius: Int = 0) -> (y: Double, cb: Double, cr: Double) {
        let side = radius * 2 + 1
        var bytes = [UInt8](repeating: 0, count: side * side * 4)
        let bounds = CGRect(x: point.x - CGFloat(radius), y: point.y - CGFloat(radius), width: CGFloat(side), height: CGFloat(side))
        context.render(image, toBitmap: &bytes, rowBytes: side * 4, bounds: bounds, format: .RGBA8, colorSpace: nil)
        let count = Double(side * side)
        let channel = { (offset: Int) in stride(from: offset, to: bytes.count, by: 4).reduce(0.0) { $0 + Double(bytes[$1]) / 255 } / count }
        let r = channel(0), g = channel(1), b = channel(2)
        let y = 0.299 * r + 0.587 * g + 0.114 * b
        return (y, (b - y) * 0.564, (r - y) * 0.713)
    }

    private func plan(tone: Float = 0, smoothing: Float = 0) -> CallSkinRetouchPlan {
        CallSkinRetouchPlan(tone: tone, smoothing: smoothing, texture: CallSkinRetouchPlan.textureKept, underEye: smoothing * CallSkinRetouchPlan.underEyeShare, usesFinePass: true)
    }

    private func blemishContrast(_ image: CIImage) -> Double {
        let surround = ycc(image, at: CGPoint(x: Self.cheek.x - 10, y: Self.cheek.y), radius: 1).y
        return surround - ycc(image, at: Self.cheek).y
    }

    func test_apply_zeroPlan_isIdentity() {
        let image = syntheticFace(skin: Self.lightSkin)
        let output = CallSkinRetoucher.apply(plan(), to: image, face: levelFace(), canvas: Self.canvas)
        let before = pixels(image)
        let after = pixels(output)
        let maxDelta = zip(before, after).map { abs(Int($0) - Int($1)) }.max() ?? 0
        XCTAssertLessThanOrEqual(maxDelta, 1)
    }

    func test_apply_smoothing_fadesTheBlemishOnEveryCarnation() {
        for skin in [Self.lightSkin, Self.deepSkin] {
            let image = syntheticFace(skin: skin)
            let before = blemishContrast(image)
            let after = blemishContrast(CallSkinRetoucher.apply(plan(smoothing: 1), to: image, face: levelFace(), canvas: Self.canvas))
            XCTAssertGreaterThan(before, 0.03, "\(skin)")
            XCTAssertLessThan(after, before * 0.75, "\(skin) : l'imperfection doit s'estomper")
        }
    }

    func test_apply_naturalComplexion_illuminatesWithoutLighteningTheSkinTone() {
        for skin in [Self.lightSkin, Self.deepSkin] {
            let image = syntheticFace(skin: skin)
            let spot = CGPoint(x: 128, y: 175)
            let before = ycc(image, at: spot, radius: 2)
            let after = ycc(CallSkinRetoucher.apply(plan(tone: 1), to: image, face: levelFace(), canvas: Self.canvas), at: spot, radius: 2)
            XCTAssertGreaterThanOrEqual(after.y, before.y - 0.002, "\(skin)")
            XCTAssertLessThanOrEqual(after.y - before.y, 0.045, "\(skin) : relevé plafonné")
            XCTAssertEqual(after.cb, before.cb, accuracy: 0.01, "\(skin) : teinte conservée")
            XCTAssertEqual(after.cr, before.cr, accuracy: 0.01, "\(skin) : teinte conservée")
        }
    }

    func test_apply_leavesNonSkinAndOutsideUntouched() {
        let image = syntheticFace(skin: Self.lightSkin)
        let after = CallSkinRetoucher.apply(plan(tone: 1, smoothing: 1), to: image, face: levelFace(), canvas: Self.canvas)
        for point in [CGPoint(x: Self.grayPatch.midX, y: Self.grayPatch.midY), CGPoint(x: 10, y: 10), CGPoint(x: 240, y: 240)] {
            XCTAssertEqual(ycc(after, at: point).y, ycc(image, at: point).y, accuracy: 2.0 / 255, "\(point)")
        }
    }

    func test_apply_keepsTheImageExtent() {
        let image = syntheticFace(skin: Self.lightSkin)
        let output = CallSkinRetoucher.apply(plan(tone: 1, smoothing: 0.5), to: image, face: levelFace(), canvas: Self.canvas)
        XCTAssertEqual(output.extent, image.extent)
    }

    // MARK: - Renderer

    private func makeRenderer() -> CallFaceEffectsRenderer {
        let detection = CallFaceDetection(
            boundingBox: CGRect(x: 0.3, y: 0.2, width: 0.4, height: 0.55),
            leftEye: CGPoint(x: 0.3, y: 0.62),
            rightEye: CGPoint(x: 0.7, y: 0.62),
            mouth: CGPoint(x: 0.5, y: 0.22)
        )
        return CallFaceEffectsRenderer(detector: CountingFaceDetector(result: detection), executor: InlineVisionExecutor())
    }

    func test_retouch_beforeAnyFaceIsKnown_returnsNil() {
        let buffer = CallSyntheticFrame.make(width: 64, height: 48)
        let sut = CallFaceEffectsRenderer(detector: SilentFaceDetector(), executor: InlineVisionExecutor())
        let output = (0..<4).map { _ in
            sut.retouch(CIImage(cvPixelBuffer: buffer), pixelBuffer: buffer, rotation: 90, plan: plan(tone: 1), isDegraded: false)
        }
        XCTAssertTrue(output.allSatisfy { $0 == nil })
    }

    func test_retouch_trackedFace_keepsTheExtentAtEveryRotation() {
        let buffer = CallSyntheticFrame.make(width: 64, height: 48)
        let image = CIImage(cvPixelBuffer: buffer)
        for rotation in [0, 90, 180, 270] {
            let sut = makeRenderer()
            let output = (0..<3).compactMap { _ in
                sut.retouch(image, pixelBuffer: buffer, rotation: rotation, plan: plan(tone: 1, smoothing: 0.5), isDegraded: false)
            }.last
            XCTAssertEqual(output?.extent, image.extent, "\(rotation)°")
        }
    }

    // MARK: - Pipeline

    func test_process_naturalComplexionWithoutFace_returnsTheInputBuffer() {
        let spy = RetouchSpy(output: nil)
        let sut = VideoFilterPipeline(faceEffects: spy, isPowerConstrained: { false })
        let buffer = CallSyntheticFrame.make(width: 64, height: 48)
        XCTAssertTrue(sut.process(buffer) === buffer)
        XCTAssertEqual(spy.plans.map(\.tone), [1])
        XCTAssertNil(sut.lastFrameProcessingTime)
    }

    func test_process_naturalComplexionWithFace_rendersANewBuffer() {
        let spy = RetouchSpy(output: CIImage(color: .white))
        let sut = VideoFilterPipeline(faceEffects: spy, isPowerConstrained: { false })
        let buffer = CallSyntheticFrame.make(width: 64, height: 48)
        XCTAssertFalse(sut.process(buffer) === buffer)
        XCTAssertNotNil(sut.lastFrameProcessingTime)
    }

    func test_process_smoothing_goesThroughTheRetouchNotTheStylizer() {
        let spy = RetouchSpy(output: nil)
        let sut = VideoFilterPipeline(faceEffects: spy, isPowerConstrained: { false })
        sut.config = VideoFilterConfig.default.selectingFaceEffect(.smoothing)
        _ = sut.process(CallSyntheticFrame.make(width: 64, height: 48), averageBrightness: nil, rotation: 270)
        XCTAssertEqual(spy.plans.map(\.smoothing), [0.4])
        XCTAssertEqual(spy.rotations, [270])
        XCTAssertTrue(spy.renders.isEmpty)
    }

    func test_process_constrainedDevice_skipsNaturalComplexion() {
        let spy = RetouchSpy(output: CIImage(color: .white))
        let sut = VideoFilterPipeline(faceEffects: spy, isPowerConstrained: { true })
        let buffer = CallSyntheticFrame.make(width: 64, height: 48)
        XCTAssertTrue(sut.process(buffer) === buffer)
        XCTAssertTrue(spy.plans.isEmpty)
    }

    func test_process_naturalComplexionOff_neverAsksForAFace() {
        let spy = RetouchSpy(output: CIImage(color: .white))
        let sut = VideoFilterPipeline(faceEffects: spy, isPowerConstrained: { false })
        sut.config.naturalComplexionEnabled = false
        _ = sut.process(CallSyntheticFrame.make(width: 64, height: 48))
        XCTAssertTrue(spy.plans.isEmpty)
    }
}

private final class RetouchSpy: CallFaceEffectsRendererProviding, @unchecked Sendable {
    private let output: CIImage?
    private(set) var plans: [CallSkinRetouchPlan] = []
    private(set) var rotations: [Int] = []
    private(set) var renders: [CallFaceEffect] = []

    init(output: CIImage?) {
        self.output = output
    }

    nonisolated func render(
        _ effect: CallFaceEffect,
        on image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        intensity: Float,
        isDegraded: Bool
    ) -> CIImage {
        renders.append(effect)
        return image
    }

    nonisolated func retouch(
        _ image: CIImage,
        pixelBuffer: CVPixelBuffer,
        rotation: Int,
        plan: CallSkinRetouchPlan,
        isDegraded: Bool
    ) -> CIImage? {
        plans.append(plan)
        rotations.append(rotation)
        return output?.cropped(to: image.extent)
    }

    nonisolated func reset() {}
}
