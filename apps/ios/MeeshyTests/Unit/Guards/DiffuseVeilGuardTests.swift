import XCTest
@testable import Meeshy

final class DiffuseVeilGuardTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private static let veiledRows = [
        "Meeshy/Features/Main/Views/ConversationPreviewLine.swift",
        "Meeshy/Features/Main/Components/MessageSearchResultRow.swift",
    ]

    private func code(_ relativePath: String) throws -> String {
        let url = Self.appRoot.appendingPathComponent(relativePath)
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertFalse(source.isEmpty, relativePath)
        return source
    }

    func test_veil_isDiffuseLikeTheBubbleFog() {
        XCTAssertGreaterThanOrEqual(DiffuseVeil.radius, 6)
        XCTAssertLessThan(DiffuseVeil.opacity, 1)
        XCTAssertGreaterThan(DiffuseVeil.opacity, 0)
    }

    func test_veiledRows_wearTheSharedVeil_neverPlaceholderBars() throws {
        for path in Self.veiledRows {
            let source = try code(path)
            XCTAssertTrue(source.contains(".modifier(DiffuseVeil())"), path)
            XCTAssertFalse(source.contains(".redacted(reason: .placeholder)"), path)
        }
    }
}
