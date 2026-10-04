import CoreImage
import XCTest
@testable import Meeshy

/// LES TEINTES D'APPEL, ÉTALONNÉES (#9289) — une teinte se lit à ce qu'elle fait à un gris,
/// à un noir, à un bleu terne et à une peau ; la peau ne suit pas la couleur de la teinte.
final class CallColorLookTests: XCTestCase {

    private let gray = SIMD3<Float>(0.5, 0.5, 0.5)
    private let black = SIMD3<Float>(0, 0, 0)
    private let lightSkin = SIMD3<Float>(0.82, 0.6, 0.48)
    private let darkSkin = SIMD3<Float>(0.45, 0.3, 0.22)
    private let dullBlue = SIMD3<Float>(0.3, 0.4, 0.6)

    private func graded(_ rgb: SIMD3<Float>, _ preset: VideoFilterPreset) throws -> SIMD3<Float> {
        let recipe = try XCTUnwrap(CallColorLook.recipe(for: preset))
        return CallColorLook.grade(rgb, recipe: recipe)
    }

    // MARK: - Ce que chaque teinte fait

    func test_natural_hasNoRecipe() {
        XCTAssertNil(CallColorLook.recipe(for: .natural))
    }

    func test_warm_warmsAGray() throws {
        let out = try graded(gray, .warm)
        XCTAssertGreaterThan(out.x, out.z + 0.04)
    }

    func test_cool_coolsAGray() throws {
        let out = try graded(gray, .cool)
        XCTAssertGreaterThan(out.z, out.x + 0.04)
    }

    func test_vivid_saturatesADullColor() throws {
        let out = try graded(dullBlue, .vivid)
        XCTAssertGreaterThan(CallColorLook.saturation(of: out), CallColorLook.saturation(of: dullBlue) + 0.08)
    }

    func test_muted_liftsTheBlacksAndSoftensColor() throws {
        let out = try graded(black, .muted)
        XCTAssertGreaterThan(out.x, 0.03)
        XCTAssertLessThan(CallColorLook.saturation(of: try graded(dullBlue, .muted)), CallColorLook.saturation(of: dullBlue))
    }

    // MARK: - La peau

    func test_skinLikelihood_recognisesLightAndDarkSkin_notBlueOrPureRed() {
        XCTAssertGreaterThan(CallColorLook.skinLikelihood(lightSkin), 0.9)
        XCTAssertGreaterThan(CallColorLook.skinLikelihood(darkSkin), 0.9)
        XCTAssertEqual(CallColorLook.skinLikelihood(dullBlue), 0)
        XCTAssertEqual(CallColorLook.skinLikelihood(SIMD3(0.9, 0.2, 0.1)), 0)
    }

    func test_cool_doesNotTurnSkinBlue() throws {
        for skin in [lightSkin, darkSkin] {
            let out = try graded(skin, .cool)
            XCTAssertGreaterThan(out.x - out.z, (skin.x - skin.z) * 0.85, "la peau garde son écart rouge-bleu sous Froid")
        }
    }

    func test_vivid_saturatesSkinLessThanTheRest() throws {
        let skinGain = CallColorLook.saturation(of: try graded(lightSkin, .vivid)) / CallColorLook.saturation(of: lightSkin)
        let blueGain = CallColorLook.saturation(of: try graded(dullBlue, .vivid)) / CallColorLook.saturation(of: dullBlue)
        XCTAssertLessThan(skinGain, blueGain)
    }

    func test_everyLook_keepsGraysInOrder() throws {
        for preset in VideoFilterPreset.allCases where preset != .natural {
            let steps = try stride(from: Float(0), through: 1, by: 0.1).map { try graded(SIMD3(repeating: $0), preset) }
            let lumas = steps.map(CallColorLook.luminance)
            XCTAssertEqual(lumas, lumas.sorted(), "\(preset) ne doit jamais inverser deux gris")
        }
    }

    // MARK: - Le cube

    func test_cubeData_hasOneRGBAFloatPerLatticePoint() throws {
        let recipe = try XCTUnwrap(CallColorLook.recipe(for: .warm))
        let data = CallColorLook.cubeData(for: recipe, dimension: 5)
        XCTAssertEqual(data.count, 5 * 5 * 5 * 4 * MemoryLayout<Float>.size)
    }

    func test_cubes_areComputedOnceAndOnlyForALook() {
        let cubes = CallColorLookCubes()
        XCTAssertNil(cubes.cube(for: .natural))
        let first = cubes.cube(for: .vivid)
        XCTAssertNotNil(first)
        XCTAssertEqual(cubes.cube(for: .vivid), first)
    }

    func test_apply_warmsAGrayPixel() throws {
        let context = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB) as Any])
        let image = CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5)).cropped(to: CGRect(x: 0, y: 0, width: 2, height: 2))
        let out = CallColorLook.apply(.warm, to: image, cubes: CallColorLookCubes())
        var pixel = [UInt8](repeating: 0, count: 4)
        context.render(out, toBitmap: &pixel, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
        XCTAssertGreaterThan(Int(pixel[0]), Int(pixel[2]) + 6)
    }

    func test_apply_natural_returnsTheImageUntouched() {
        let image = CIImage(color: .gray)
        XCTAssertTrue(CallColorLook.apply(.natural, to: image) === image)
    }

    // MARK: - Dans le pipeline d'appel

    private func grayBuffer() throws -> CVPixelBuffer {
        var buffer: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        XCTAssertEqual(CVPixelBufferCreate(kCFAllocatorDefault, 8, 8, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &buffer), kCVReturnSuccess)
        let pixel = try XCTUnwrap(buffer)
        CVPixelBufferLockBaseAddress(pixel, [])
        let base = try XCTUnwrap(CVPixelBufferGetBaseAddress(pixel))
        memset(base, 128, CVPixelBufferGetBytesPerRow(pixel) * 8)
        CVPixelBufferUnlockBaseAddress(pixel, [])
        return pixel
    }

    private func firstPixel(_ buffer: CVPixelBuffer) throws -> (b: Int, g: Int, r: Int) {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        let base = try XCTUnwrap(CVPixelBufferGetBaseAddress(buffer)).assumingMemoryBound(to: UInt8.self)
        return (Int(base[0]), Int(base[1]), Int(base[2]))
    }

    func test_pipeline_warmLook_warmsTheSentFrame() throws {
        let sut = VideoFilterPipeline(isPowerConstrained: { false })
        sut.config = VideoFilterConfig.default.applyingPreset(.warm)

        let out = try firstPixel(sut.process(try grayBuffer(), averageBrightness: 200, rotation: 90))

        XCTAssertGreaterThan(out.r, out.b + 6)
    }

    func test_pipeline_brightnessOverALook_keepsTheLookAndBrightens() throws {
        let warm = VideoFilterPipeline(isPowerConstrained: { false })
        warm.config = VideoFilterConfig.default.applyingPreset(.warm)
        let brighter = VideoFilterPipeline(isPowerConstrained: { false })
        brighter.config = VideoFilterConfig.default.applyingPreset(.warm).withBrightness(0.2)

        let base = try firstPixel(warm.process(try grayBuffer(), averageBrightness: 200, rotation: 90))
        let lifted = try firstPixel(brighter.process(try grayBuffer(), averageBrightness: 200, rotation: 90))

        XCTAssertGreaterThan(lifted.g, base.g + 10)
        XCTAssertGreaterThan(lifted.r, lifted.b)
    }
}
