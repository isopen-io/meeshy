import XCTest
@testable import MeeshyUI

/// B8 item 4 (ios-full-remediation) — DocumentViewerView (+ its DocumentFullSheet
/// sibling) is a leaf view rendered per-bubble; `@ObservedObject
/// ThemeManager.shared` there re-renders EVERY document bubble in the scroll
/// list on every theme mutation (Zero Unnecessary Re-render rule).
/// `@Environment(\.colorScheme)` is the SwiftUI-native substitute (cf.
/// `ChatBubble.swift` precedent). Source-guard since the view isn't
/// introspectable without ViewInspector.
@MainActor
final class DocumentViewerViewColorSchemeMigrationTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_documentViewerView_doesNotObserveThemeManagerSingleton() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/DocumentViewerView.swift")
        XCTAssertFalse(source.contains("@ObservedObject private var theme = ThemeManager.shared"))
        let colorSchemeCount = source.components(separatedBy: "@Environment(\\.colorScheme)").count - 1
        XCTAssertEqual(colorSchemeCount, 2,
                       "DocumentViewerView AND DocumentFullSheet must both read colorScheme from the environment (found \(colorSchemeCount)).")
    }
}
