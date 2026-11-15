import XCTest
@testable import Meeshy

/// **Le halo de lueur ne change que d'opacité** (#9883).
///
/// Animer le RAYON d'une `.shadow` oblige le moteur de rendu à recalculer un
/// flou gaussien à chaque image. Le halo est donc un aplat flouté UNE fois, à
/// rayon constant ; la respiration ne touche que son opacité.
final class GlowHaloLawTests: XCTestCase {

    func test_inactiveGlow_drawsNothing() {
        XCTAssertEqual(GlowHalo.opacity(active: false, glowing: true, intensity: 0.8), 0)
        XCTAssertEqual(GlowHalo.opacity(active: false, glowing: false, intensity: 0.8), 0)
    }

    func test_glowingHalo_reachesTheAuthorsIntensity() {
        XCTAssertEqual(GlowHalo.opacity(active: true, glowing: true, intensity: 0.8), 0.8, accuracy: 1e-9)
    }

    func test_restingHalo_keepsAThirdOfTheIntensity() {
        XCTAssertEqual(GlowHalo.opacity(active: true, glowing: false, intensity: 0.8), 0.24, accuracy: 1e-9)
    }

    func test_theBlurRadius_isAConstant_notAFunctionOfTheAnimatedState() {
        XCTAssertGreaterThan(GlowHalo.blurRadius, 0)
    }

    func test_cometBleed_leavesRoomForItsStrokeAndItsBlur() {
        XCTAssertGreaterThanOrEqual(
            RainbowCometBleed.margin,
            RainbowCometBleed.glowStroke / 2 + 3 * RainbowCometBleed.glowBlur,
            "La marge de la comète coupe le flou de son trait."
        )
    }
}
