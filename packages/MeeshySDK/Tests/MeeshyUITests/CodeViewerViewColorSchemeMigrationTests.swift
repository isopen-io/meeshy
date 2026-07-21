import XCTest
@testable import MeeshyUI

/// B8 item 4 (ios-full-remediation) — CodeViewerView (+ its CodeFullSheet
/// sibling) is a leaf view rendered per-bubble; `@ObservedObject
/// ThemeManager.shared` there re-renders EVERY code bubble in the scroll
/// list on every theme mutation (Zero Unnecessary Re-render rule).
/// `@Environment(\.colorScheme)` is the SwiftUI-native substitute (cf.
/// `ChatBubble.swift` precedent). Source-guard since the view isn't
/// introspectable without ViewInspector.
@MainActor
final class CodeViewerViewColorSchemeMigrationTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_codeViewerView_doesNotObserveThemeManagerSingleton() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/CodeViewerView.swift")
        XCTAssertFalse(source.contains("@ObservedObject private var theme = ThemeManager.shared"))
        let colorSchemeCount = source.components(separatedBy: "@Environment(\\.colorScheme)").count - 1
        XCTAssertEqual(colorSchemeCount, 2,
                       "CodeViewerView AND CodeFullSheet must both read colorScheme from the environment (found \(colorSchemeCount)).")
    }
}
