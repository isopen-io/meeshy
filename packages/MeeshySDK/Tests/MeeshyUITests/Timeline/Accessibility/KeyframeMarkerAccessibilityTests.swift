import XCTest
@testable import MeeshyUI

@MainActor
final class KeyframeMarkerAccessibilityTests: XCTestCase {

    func test_editLabel_resolves() {
        XCTAssertFalse(KeyframeMarkerView.editLabel.isEmpty)
        XCTAssertFalse(KeyframeMarkerView.editLabel.hasPrefix("story.timeline.a11y"))
    }

    func test_source_exposesActions_butNoAdjustable() throws {
        let code = try Self.source("Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerView.swift")
        XCTAssertTrue(code.contains(".accessibilityAction"))
        XCTAssertTrue(code.contains(".isButton"))
        XCTAssertFalse(code.contains("accessibilityAdjustableAction"),
                       "onDragDelta est une translation cumulée sans fin de geste : un pas y serait un contrôle sans effet")
    }

    private static func source(_ relativePath: String, file: StaticString = #filePath) throws -> String {
        let root = URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }
}
