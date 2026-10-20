import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class MeeshyIconButtonTests: XCTestCase {

    func test_init_requiresNonOptionalLabel_signature() {
        let make: (String, String, @escaping () -> Void) -> MeeshyIconButton = { MeeshyIconButton(systemName: $0, label: $1, action: $2) }
        XCTAssertEqual(make("xmark", "Fermer", {}).label, "Fermer")
    }

    func test_spokenLabel_trimsWhitespace() {
        XCTAssertEqual(MeeshyIconButton.spokenLabel("  Fermer \n"), "Fermer")
    }

    func test_minimumHitSide_isTheSharedTapTarget() {
        XCTAssertEqual(MeeshyIconButton.minimumHitSide, MeeshyControlSize.tapTarget)
    }

    func test_source_labelsTheButton_hidesTheGlyph_widensTheTarget() throws {
        let code = try Self.source("Sources/MeeshyUI/Primitives/MeeshyIconButton.swift")
        XCTAssertTrue(code.contains(".accessibilityLabel("))
        XCTAssertTrue(code.contains(".accessibilityHidden(true)"))
        XCTAssertTrue(code.contains(".meeshyTapTarget("))
        XCTAssertFalse(code.contains("label: String?"))
        XCTAssertFalse(code.contains(".font(.system(size:"))
    }

    private static func source(_ relativePath: String, file: StaticString = #filePath) throws -> String {
        let root = URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }
}
