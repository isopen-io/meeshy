import XCTest
import CoreGraphics
@testable import MeeshyUI

@MainActor
final class TapTargetSingleSourceGuardTests: XCTestCase {

    private static let files = [
        "Sources/MeeshyUI/Primitives/MoodBadge.swift",
        "Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift",
        "Sources/MeeshyUI/Story/Controls/ComposerControlHitTarget.swift",
        "Sources/MeeshyUI/Settings/SettingsComponents.swift"
    ]

    func test_hitTargetFiles_haveNoLiteral44_andReadTheSharedConstant() throws {
        let literal = try NSRegularExpression(pattern: #"(CGFloat = 44\b|width: 44, height: 44|minHeight: 44\b)"#)
        for path in Self.files {
            let code = try Self.codeWithoutComments(path)
            let range = NSRange(code.startIndex..., in: code)
            XCTAssertEqual(literal.numberOfMatches(in: code, range: range), 0, "\(path) porte encore un 44 littéral")
            XCTAssertTrue(code.contains("MeeshyControlSize.tapTarget"), "\(path) ne lit pas MeeshyControlSize.tapTarget")
        }
    }

    func test_values_followTheSharedConstant() {
        let side = MeeshyControlSize.tapTarget
        XCTAssertEqual(MeeshyMoodBadge.minimumHitTarget, side)
        XCTAssertEqual(TransportBar.minimumHitTargetSize, CGSize(width: side, height: side))
        XCTAssertEqual(ComposerControlMetrics.hitDiameter, side)
        XCTAssertEqual(ComposerControlMetrics.hitInset, 4)
        XCTAssertEqual(SettingsRowMetrics.minimumHeight, side)
    }

    private static func codeWithoutComments(_ relativePath: String, file: StaticString = #filePath) throws -> String {
        let root = URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let text = try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        return text.split(separator: "\n", omittingEmptySubsequences: false)
            .map { line in line.range(of: "//").map { String(line[..<$0.lowerBound]) } ?? String(line) }
            .joined(separator: "\n")
    }
}
