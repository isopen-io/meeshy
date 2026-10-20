import XCTest
@testable import MeeshyUI

final class MeeshySurfaceTests: XCTestCase {

    func test_translucent_reduceTransparencyOn_becomesOpaque() {
        XCTAssertEqual(MeeshySurface.translucent.resolved(reduceTransparency: true), .opaque)
    }

    func test_translucent_reduceTransparencyOff_staysTranslucent() {
        XCTAssertEqual(MeeshySurface.translucent.resolved(reduceTransparency: false), .translucent)
    }

    func test_opaque_staysOpaque_whateverTheSetting() {
        XCTAssertEqual(MeeshySurface.opaque.resolved(reduceTransparency: true), .opaque)
        XCTAssertEqual(MeeshySurface.opaque.resolved(reduceTransparency: false), .opaque)
    }

    func test_adaptiveGlassSource_readsReduceTransparency_andKeepsIOS26Branch() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let code = try String(
            contentsOf: root.appendingPathComponent("Sources/MeeshyUI/Compatibility/AdaptiveGlass.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(code.contains("accessibilityReduceTransparency"))
        XCTAssertTrue(code.contains("MeeshySurface"))
        XCTAssertTrue(code.contains("modifier(AdaptiveGlassModifier("))
        XCTAssertTrue(code.contains("modifier(AdaptiveGlassProminentModifier("))
        XCTAssertTrue(code.contains("modifier(AdaptiveSheetGlassBackgroundModifier("))
        let glass = "content.glassEffect(makeMeeshyGlass(tint: tint, interactive: interactive), in: shape)"
        XCTAssertEqual(code.components(separatedBy: glass).count - 1, 2)
    }
}
