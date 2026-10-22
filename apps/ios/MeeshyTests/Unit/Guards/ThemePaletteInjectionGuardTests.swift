import XCTest
@testable import Meeshy

final class ThemePaletteInjectionGuardTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    private static let migratedViews = [
        "Meeshy/Features/Auth/Signup/SignupView.swift",
        "Meeshy/Features/Main/Views/RootView.swift",
        "Meeshy/Features/Main/Views/iPadRootView.swift",
        "Meeshy/Features/Main/Views/AdaptiveRootView.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Media/AudioEditorToolPanel.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditorHistoryOverlay.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTranscriptionView.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyAudioEditorView.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyImageEditorView.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Media/UniversalAudioRecorderView.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+PostsTab.swift",
        "../../packages/MeeshySDK/Sources/MeeshyUI/Theme/ViewModifiers.swift"
    ]

    private func observesThemeSingleton(_ source: String) -> Bool {
        let pattern = #"@(?:ObservedObject|StateObject)\s+(?:\w+(?:\(set\))?\s+)*var\s+\w+\s*(?::\s*ThemeManager\s*)?=\s*(?:ThemeManager)?\.shared\b"#
        return source.range(of: pattern, options: .regularExpression) != nil
    }

    func test_appRoot_injectsThemeOnBothWindowGroups() throws {
        let source = try code("Meeshy/MeeshyApp.swift")
        XCTAssertEqual(source.components(separatedBy: ".meeshyThemeRoot(theme)").count - 1, 2)
        XCTAssertFalse(source.contains(".preferredColorScheme(theme.preferredColorScheme)"))
    }

    func test_migratedViews_readResolvedPalette() throws {
        for path in Self.migratedViews {
            let source = try code(path)
            let readsPalette = source.contains("@ResolvedThemePalette")
                || source.contains("RootThemedBackground(theme: ThemeManager.shared)")
            XCTAssertTrue(readsPalette, "\(path) ne lit pas la palette injectée")
            XCTAssertFalse(observesThemeSingleton(source), "\(path) observe encore ThemeManager.shared")
        }
    }
}
