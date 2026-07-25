import XCTest
@testable import MeeshyUI

/// B8 item 4 (ios-full-remediation) — ImageViewerView is a leaf view rendered
/// per-bubble; `@ObservedObject ThemeManager.shared` there re-renders EVERY
/// image bubble in the scroll list on every theme mutation (Zero Unnecessary
/// Re-render rule). `@Environment(\.colorScheme)` is the SwiftUI-native
/// substitute (cf. `ChatBubble.swift` precedent). Source-guard since the view
/// isn't introspectable without ViewInspector.
@MainActor
final class ImageViewerViewColorSchemeMigrationTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_imageViewerView_doesNotObserveThemeManagerSingleton() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/ImageViewerView.swift")
        XCTAssertFalse(source.contains("@ObservedObject private var theme = ThemeManager.shared"),
                       "ImageViewerView is a leaf view rendered per-bubble — it must not @ObservedObject the ThemeManager singleton.")
        XCTAssertTrue(source.contains("@Environment(\\.colorScheme) private var colorScheme"))
    }
}
