import XCTest
@testable import MeeshyUI

/// #11222 — le voile de l'appui long est le MATÉRIAU SYSTÈME, une seule loi
/// pour iOS et le web : matière `.ultraThinMaterial` (le web : flou 20 px),
/// assombrissement de 30 % dans les deux schémas, repli OPAQUE sous Réduire la
/// transparence.
final class LongPressVeilTests: XCTestCase {

    func test_dimOpacity_isThirtyPercent_theValueSharedWithTheWeb() {
        XCTAssertEqual(LongPressVeilLaw.dimOpacity, 0.30, accuracy: 0.0001)
    }

    func test_matter_isTheSystemMaterial_whenTransparencyIsAllowed() {
        XCTAssertEqual(LongPressVeilLaw.matter(reduceTransparency: false), .translucent)
    }

    func test_matter_fallsBackToOpaque_underReduceTransparency() {
        XCTAssertEqual(LongPressVeilLaw.matter(reduceTransparency: true), .opaque)
    }

    func test_opaqueFallback_isDarkInDarkMode_andLightInLightMode() {
        XCTAssertLessThan(LongPressVeilLaw.opaqueWhite(isDark: true), 0.2)
        XCTAssertGreaterThan(LongPressVeilLaw.opaqueWhite(isDark: false), 0.8)
    }

    func test_veilSource_posesTheSystemMaterial_andNoLiteralBlur() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let code = try String(
            contentsOf: root.appendingPathComponent("Sources/MeeshyUI/Theme/LongPressVeil.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(code.contains(".fill(.ultraThinMaterial)"))
        XCTAssertTrue(code.contains("accessibilityReduceTransparency"))
        XCTAssertFalse(code.contains(".blur(radius:"))
    }
}
